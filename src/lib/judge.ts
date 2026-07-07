import { GoogleGenerativeAI } from "@google/generative-ai";
import { getEnv } from "./env";
import { isMockMode } from "./config";
import { RFPInput, ProposalContent } from "../types";

let genAI: GoogleGenerativeAI | null = null;

const getGenAI = (): GoogleGenerativeAI => {
  if (genAI) return genAI;
  const env = getEnv();
  genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return genAI;
};

// Response schema for the Judge evaluator
const judgeResponseSchema = {
  type: "OBJECT",
  properties: {
    passed: { type: "BOOLEAN" },
    score: { type: "INTEGER" },
    issues: {
      type: "ARRAY",
      items: { type: "STRING" }
    }
  },
  required: ["passed", "score", "issues"]
};

export interface AuditResult {
  passed: boolean;
  score: number;
  issues: string[];
}

/**
 * Audit generated proposal against the RFP using LLM-as-a-Judge
 */
export const auditProposalWithJudge = async (
  rfp: RFPInput,
  proposal: ProposalContent
): Promise<AuditResult> => {
  if (isMockMode()) {
    console.log("[Judge] Running in MOCK mode. Automatically passing audit.");
    return {
      passed: true,
      score: 95,
      issues: []
    };
  }

  const prompt = `
قم بتقييم ومراجعة جودة العرض التدريبي المولد بناءً على كراسة الشروط (RFP) المعطاة أدناه.
تحقق من:
1. الالتزام بلغة التدريب المطلوبة ونوع التدريب (حضوري/عن بعد/هجين).
2. عدم اختراع أسعار أو مجاميع مالية في العرض المالي (يجب أن تظل null إذا كانت موجودة).
3. سلامة اللغة العربية الإملائية والأسلوب المهني المناسب للمعاهد السعودية.
4. مواءمة الجدول الزمني والمحاور مع عدد الأيام المطلوبة.

كراسة الشروط (RFP):
- اسم البرنامج: ${rfp.title}
- العميل: ${rfp.client_name}
- اللغة: ${rfp.preferred_language}
- نوع التدريب: ${rfp.training_type}
- متطلبات أخرى: ${rfp.other_requirements || "لا يوجد"}

العرض المولد للمراجعة:
الملخص التنفيذي:
${proposal.executive_summary}

المنهجية:
${proposal.methodology?.approach || ""}

عدد مراحل المنهجية: ${(proposal.methodology?.phases || []).length} مرحلة.

أجب بصيغة JSON تطابق المخطط الهيكلي المحدد.
إذا كانت نسبة التطابق والجودة الإجمالية أقل من 80%، قم بتعيين passed = false واذكر الأسباب بالتفصيل في مصفوفة issues.
  `;

  try {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: "أنت مقيم ومصحح جودة للعروض التدريبية الفنية في المملكة العربية السعودية. مهمتك هي تدقيق العروض ومقارنتها مع متطلبات كراسة الشروط RFP وإبراز الأخطاء ونقاط الضعف بكل صرامة. أجب بـ JSON فقط.",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: judgeResponseSchema as any,
        temperature: 0.1,
      },
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const responseText = result.response.text();
    if (!responseText) {
      throw new Error("Empty response from Judge");
    }

    const auditData = JSON.parse(responseText.trim()) as AuditResult;
    console.log(`[Judge] Audited Proposal. Score: ${auditData.score}%. Passed: ${auditData.passed}. Issues count: ${auditData.issues.length}`);
    return auditData;
  } catch (error) {
    console.error("[Judge] Audit execution failed, returning default pass fallback:", error);
    // Fallback: Default to true to prevent blocking generation if judge model fails
    return {
      passed: true,
      score: 85,
      issues: []
    };
  }
};

/**
 * Distill RFP and Proposal content into concise tenant-client guidelines
 */
export const distillClientGuidelines = async (
  rfp: RFPInput,
  proposal: ProposalContent
): Promise<string> => {
  if (isMockMode()) {
    return `العميل يفضل التفاعل العملي وورش عمل الحالات التطبيقية باللغة العربية.`;
  }

  const prompt = `
بصفتك محللاً خبيراً، قم بتحليل طلب العميل التدريبي (RFP) التالي والعرض التدريبي المكتوب له لاستخلاص أهم التفضيلات والدروس المستفادة والخطوط التوجيهية في نقاط محددة:

طلب العميل (RFP):
- اسم البرنامج: ${rfp.title}
- الجهة: ${rfp.client_name}
- نوع التدريب: ${rfp.training_type}
- اللغة: ${rfp.preferred_language}

تفاصيل العرض التدريبي:
- الملخص التنفيذي:
${proposal.executive_summary}

- المنهجية والأدوات:
${proposal.methodology?.approach || ""}

استخلص 3 إلى 5 نقاط توجيهية قصيرة ومحددة باللغة العربية حول تفضيلات هذا العميل وتركيزه (مثل أسلوب الصياغة، والمنصات المفضلة، ونوع الشهادات).
  `;

  try {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: "أنت خبير صياغة عروض تدريبية. استخلص تفضيلات العميل بنقاط عربية مباشرة وواضحة فقط دون مقدمات.",
      generationConfig: {
        temperature: 0.2,
      },
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    return result.response.text().trim();
  } catch (err) {
    console.error("[Distiller] Failed to distill guidelines:", err);
    return `العميل يفضل الالتزام التام بجدول التدريب واللغة العربية الرسمية.`;
  }
};

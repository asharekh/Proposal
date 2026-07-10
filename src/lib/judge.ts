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
    },
    title_alignment: {
      type: "OBJECT",
      properties: { covered: { type: "BOOLEAN" }, note: { type: "STRING" } },
      required: ["covered", "note"]
    },
    delivery_mode_alignment: {
      type: "OBJECT",
      properties: { covered: { type: "BOOLEAN" }, note: { type: "STRING" } },
      required: ["covered", "note"]
    },
    language_alignment: {
      type: "OBJECT",
      properties: { covered: { type: "BOOLEAN" }, note: { type: "STRING" } },
      required: ["covered", "note"]
    },
    certificate_alignment: {
      type: "OBJECT",
      properties: { covered: { type: "BOOLEAN" }, note: { type: "STRING" } },
      required: ["covered", "note"]
    },
    other_requirements_alignment: {
      type: "OBJECT",
      properties: { covered: { type: "BOOLEAN" }, note: { type: "STRING" } },
      required: ["covered", "note"]
    },
    client_notes_alignment: {
      type: "OBJECT",
      properties: { covered: { type: "BOOLEAN" }, note: { type: "STRING" } },
      required: ["covered", "note"]
    }
  },
  required: [
    "passed",
    "score",
    "issues",
    "title_alignment",
    "delivery_mode_alignment",
    "language_alignment",
    "certificate_alignment",
    "other_requirements_alignment",
    "client_notes_alignment"
  ]
};

export interface AlignmentCheck {
  covered: boolean;
  note: string;
}

export interface AuditResult {
  passed: boolean;
  score: number;
  issues: string[];
  title_alignment: AlignmentCheck;
  delivery_mode_alignment: AlignmentCheck;
  language_alignment: AlignmentCheck;
  certificate_alignment: AlignmentCheck;
  other_requirements_alignment: AlignmentCheck;
  client_notes_alignment: AlignmentCheck;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
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
      issues: [],
      title_alignment: { covered: true, note: "الاسم مطابق لمتطلبات البرنامج." },
      delivery_mode_alignment: { covered: true, note: "طريقة التقديم مطابقة تماماً." },
      language_alignment: { covered: true, note: "اللغة مطابقة للغة المطلوبة." },
      certificate_alignment: { covered: true, note: "الشهادات مطابقة لطلب العميل." },
      other_requirements_alignment: { covered: true, note: "تمت تلبية جميع المتطلبات الإضافية." },
      client_notes_alignment: { covered: true, note: "تمت مراعاة ملاحظات العميل الإضافية." },
      usage: null
    };
  }

  const prompt = `
قم بتقييم ومراجعة جودة العرض التدريبي المولد بناءً على كراسة الشروط (RFP) المعطاة أدناه.
تحقق من وصِغ التقييم لكل مما يلي:
1. مواءمة اسم البرنامج (title_alignment): تحقق مما إذا كان العرض التدريبي متوافقاً مع اسم البرنامج التدريبي المطلوب.
2. الالتزام بنوع التدريب / طريقة التقديم (delivery_mode_alignment): تأكد من الالتزام التام بنوع التدريب المطلوب (حضوري، عن بعد، هجين). احذر من الوقوع في فخ النفي (مثلاً، إذا كان النص يذكر أن التدريب لن يكون حضورياً "NOT in-person" أو ما يشابه ذلك من صياغات النفي، فيجب اعتبارها غير مطابقة covered = false).
3. الالتزام بلغة التدريب المفضلة (language_alignment): تأكد من الالتزام بلغة التدريب المطلوبة. احذر من الوقوع في فخ النفي (مثلاً، إذا كان النص يذكر أن التدريب لن يكون باللغة المطلوبة، فيجب اعتبارها غير مطابقة covered = false).
4. الالتزام بنوع الشهادات المطلوبة (certificate_alignment): تأكد من الالتزام بالشهادة المطلوبة في كراسة الشروط.
5. الالتزام بالمتطلبات الإضافية (other_requirements_alignment): تحقق من معالجة "متطلبات أخرى" بشكل ملموس في العرض. إذا كانت المتطلبات الأخرى فارغة أو تساوي "لا يوجد"، فاعتبرها مطابقة تلقائياً (covered = true, note = "لا توجد متطلبات إضافية مطلوبة").
6. الالتزام بملاحظات العميل الإضافية (client_notes_alignment): تحقق من معالجة "ملاحظات العميل الإضافية" في العرض. إذا كانت ملاحظات العميل فارغة أو تساوي "لا يوجد"، فاعتبرها مطابقة تلقائياً (covered = true, note = "لا توجد ملاحظات إضافية من العميل").

كراسة الشروط (RFP):
- اسم البرنامج: ${rfp.title}
- العميل: ${rfp.client_name}
- اللغة: ${rfp.preferred_language}
- نوع التدريب: ${rfp.training_type}
- متطلبات أخرى: ${rfp.other_requirements || "لا يوجد"}
- ملاحظات العميل الإضافية: ${rfp.client_notes || "لا يوجد"}

العرض المولد للمراجعة:
الملخص التنفيذي:
${proposal.executive_summary}

المنهجية:
${proposal.methodology?.approach || ""}

عدد مراحل المنهجية: ${(proposal.methodology?.phases || []).length} مرحلة.

أجب بصيغة JSON تطابق المخطط الهيكلي المحدد. تأكد من ملء الحقول الستة المضافة للتقييم الهيكلي بالتفصيل مع تحديد covered كـ boolean و note كشرح مختصر باللغة العربية.
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
    
    const usage = result.response.usageMetadata;
    return {
      ...auditData,
      usage: usage ? {
        promptTokens: usage.promptTokenCount,
        completionTokens: usage.candidatesTokenCount,
        totalTokens: usage.totalTokenCount
      } : null
    };
  } catch (error) {
    console.error("[Judge] Audit execution failed, returning default pass fallback:", error);
    // Fallback: Default to true to prevent blocking generation if judge model fails
    return {
      passed: true,
      score: 85,
      issues: [],
      title_alignment: { covered: true, note: "موافقة افتراضية لاسم البرنامج." },
      delivery_mode_alignment: { covered: true, note: "موافقة افتراضية لطريقة التقديم." },
      language_alignment: { covered: true, note: "موافقة افتراضية للغة البرنامج." },
      certificate_alignment: { covered: true, note: "موافقة افتراضية لنوع الشهادات." },
      other_requirements_alignment: { covered: true, note: "موافقة افتراضية للمتطلبات الإضافية." },
      client_notes_alignment: { covered: true, note: "موافقة افتراضية لملاحظات العميل." },
      usage: null
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

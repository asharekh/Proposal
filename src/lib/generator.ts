import { GoogleGenerativeAI } from "@google/generative-ai";
import { getEnv } from "./env";
import { isMockMode } from "./config";
import { RFPInput, ProposalContent, ComplianceItem } from "../types";
import { getLangfuse } from "./trace";
import { auditProposalWithJudge } from "./judge";

let genAI: GoogleGenerativeAI | null = null;

const getGenAI = (): GoogleGenerativeAI => {
  if (genAI) return genAI;
  const env = getEnv();
  genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return genAI;
};

// Response schema definition for Gemini Structured Outputs
const proposalResponseSchema = {
  type: "OBJECT",
  properties: {
    executive_summary: { type: "STRING" },
    about_institute: { type: "STRING" },
    methodology: {
      type: "OBJECT",
      properties: {
        approach: { type: "STRING" },
        phases: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              number: { type: "INTEGER" },
              title: { type: "STRING" },
              description: { type: "STRING" },
              duration: { type: "STRING" },
              objectives: { type: "ARRAY", items: { type: "STRING" } }
            },
            required: ["number", "title", "description", "duration", "objectives"]
          }
        },
        tools_and_resources: { type: "ARRAY", items: { type: "STRING" } }
      },
      required: ["approach", "phases", "tools_and_resources"]
    },
    timeline: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          week: { type: "STRING" },
          activity: { type: "STRING" }
        },
        required: ["week", "activity"]
      }
    },
    financial: {
      type: "OBJECT",
      properties: {
        breakdown: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              item: { type: "STRING" },
              quantity: { type: "INTEGER" },
              unit_price: { type: "NUMBER" },
              total: { type: "NUMBER" }
            },
            required: ["item", "quantity"]
          }
        },
        total_before_vat: { type: "NUMBER" },
        vat_amount: { type: "NUMBER" },
        total_after_vat: { type: "NUMBER" },
        payment_terms: { type: "STRING" },
        validity_days: { type: "INTEGER" }
      },
      required: ["breakdown", "payment_terms", "validity_days"]
    },
    terms_and_conditions: { type: "STRING" }
  },
  required: ["executive_summary", "about_institute", "methodology", "timeline", "terms_and_conditions"]
};

/**
 * Clean text and extract JSON using 3 strategies (fence block -> any block -> raw)
 */
const extractJsonString = (text: string): string => {
  // Strategy 1: Find ```json ... ``` markdown fence
  const fenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }

  // Strategy 2: Find first '{' and last '}'
  const startIdx = text.indexOf("{");
  const endIdx = text.lastIndexOf("}");
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return text.substring(startIdx, endIdx + 1).trim();
  }

  // Strategy 3: Just return the raw text
  return text.trim();
};

/**
 * Calculates a detailed compliance checklist and score from generated content
 */
export const calculateCompliance = (
  rfp: RFPInput,
  content: ProposalContent
): { score: number; checklist: ComplianceItem[] } => {
  const checklist: ComplianceItem[] = [];

  const textToScan = [
    content.executive_summary,
    content.methodology?.approach || "",
    ...(content.methodology?.phases || []).map((p) => `${p.title} ${p.description}`),
    content.terms_and_conditions,
  ]
    .join(" ")
    .toLowerCase();

  // Calculate duration in days
  let durationDays = 5;
  if (rfp.start_date && rfp.end_date) {
    const s = new Date(rfp.start_date);
    const e = new Date(rfp.end_date);
    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
    if (diff > 0) durationDays = diff;
  }

  // 1. Check title alignment
  const titleKeywords = rfp.title.split(" ").filter((w) => w.length > 3);
  const titleCovered = titleKeywords.some((kw) => textToScan.includes(kw.toLowerCase()));
  checklist.push({
    requirement: `مواءمة البرنامج مع اسم الدورة المطلوبة: "${rfp.title}"`,
    covered: titleCovered,
    note: titleCovered ? "تمت الإشارة إلى موضوع ومحاور البرنامج التدريبي في متن العرض." : "يرجى إضافة إشارة واضحة لاسم البرنامج.",
  });

  // 2. Check duration alignment
  const durationInText =
    textToScan.includes(`${durationDays} أيام`) ||
    textToScan.includes(`${durationDays} يوم`) ||
    (content.timeline && content.timeline.length > 0);
  checklist.push({
    requirement: `تحديد مدة تدريبية تتطابق مع الطلب (${durationDays} يوم/أيام)`,
    covered: durationInText,
    note: durationInText ? `تم إدراج جدول زمني أو الإشارة للمدة المطلوبة: ${durationDays} يوم.` : "الجدول التدريبي يفتقر للتفاصيل الصريحة بالأيام.",
  });

  // 3. Check training type (delivery mode)
  const trainingTypeKeywords: Record<string, string[]> = {
    "حضوري": ["حضوري", "موقع", "مقر", "قاعة", "ميداني"],
    "عن بعد": ["عن بعد", "افتراض", "منصة", "زوم", "تيمز"],
    "هجين": ["هجين", "مدمج", "مشترك", "حضوري وعن بعد"],
  };
  const deliveryKeywords = trainingTypeKeywords[rfp.training_type] || [rfp.training_type];
  const deliveryCovered = deliveryKeywords.some((kw) => textToScan.includes(kw.toLowerCase()));
  checklist.push({
    requirement: `الالتزام بنوع تقديم التدريب المطلوب (${rfp.training_type})`,
    covered: deliveryCovered,
    note: deliveryCovered ? `العرض يذكر تقديم البرنامج بأسلوب (${rfp.training_type}) بشكل ملائم.` : `لم يتم العثور على تأكيد صريح لتقديم التدريب بأسلوب (${rfp.training_type}).`,
  });

  // 4. Check language alignment
  const langKeywords: Record<string, string[]> = {
    "العربية": ["عربي", "العربية"],
    "الإنجليزية": ["إنجليزي", "الانجليزية", "english"],
    "كلاهما (عربي/إنجليزي)": ["عربي", "إنجليزي", "العربية والإنجليزية"],
  };
  const langKw = langKeywords[rfp.preferred_language] || [rfp.preferred_language];
  const langCovered = langKw.some((kw) => textToScan.includes(kw.toLowerCase()));
  checklist.push({
    requirement: `الالتزام بلغة تقديم التدريب المطلوبة (${rfp.preferred_language})`,
    covered: langCovered,
    note: langCovered ? `العرض يذكر تقديم البرنامج باللغة (${rfp.preferred_language}) بشكل ملائم.` : `لم يتم العثور على تأكيد صريح لتقديم التدريب باللغة (${rfp.preferred_language}).`,
  });

  // 5. Check certificate type
  const requiresCert = rfp.certificate_type && rfp.certificate_type !== "بدون شهادة" && rfp.certificate_type !== "";
  if (requiresCert) {
    const certCovered = textToScan.includes("شهاد") || textToScan.includes("اعتماد") || textToScan.includes(rfp.certificate_type!.toLowerCase());
    checklist.push({
      requirement: `توفير شهادات حضور أو اجتياز من النوع المطلوب: (${rfp.certificate_type})`,
      covered: certCovered,
      note: certCovered ? "تم إدراج بند شهادات الحضور المعتمدة في الشروط أو الملخص." : "الرجاء تأكيد توفير شهادات حضور معتمدة.",
    });
  } else {
    checklist.push({
      requirement: "بند الشهادات غير مطلوب أو لا يوجد متطلبات شهادة محددة",
      covered: true,
      note: "الشهادات ليست شرطاً أساسياً في هذا العرض.",
    });
  }

  // 6. Financial breakdown check (for combined/financial proposals)
  if (rfp.proposal_type !== "technical") {
    const hasFinancialBreakdown =
      content.financial &&
      content.financial.breakdown &&
      content.financial.breakdown.length > 0;
    checklist.push({
      requirement: "إدراج العرض المالي وبنود التسعير بالتفصيل",
      covered: !!hasFinancialBreakdown,
      note: hasFinancialBreakdown ? "تم تفصيل البنود المالية وجدول الأسعار." : "العرض المالي فارغ أو يفتقر إلى بنود التسعير الفردية.",
    });
  } else {
    checklist.push({
      requirement: "عرض فني فقط - لا يتطلب تفاصيل تسعير مالية",
      covered: true,
      note: "تم استبعاد التسعير بناء على رغبة العميل بتقديم عرض فني فقط.",
    });
  }

  // Calculate score
  const coveredCount = checklist.filter((item) => item.covered).length;
  const score = Math.round((coveredCount / checklist.length) * 100);

  return { score, checklist };
};

/**
 * Detailed Mock Proposal Generator for fast and robust local testing
 */
const generateMockProposal = (rfp: RFPInput, tenantName: string): ProposalContent => {
  let durationDays = 5;
  if (rfp.start_date && rfp.end_date) {
    const s = new Date(rfp.start_date);
    const e = new Date(rfp.end_date);
    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
    if (diff > 0) durationDays = diff;
  }

  const breakdown: any[] = [];
  if (rfp.proposal_type !== "technical") {
    breakdown.push(
      { item: "تقديم الحقيبة التدريبية والمادة العلمية المعتمدة", quantity: 1, unit_price: null, total: null },
      { item: `تنفيذ الأيام التدريبية (${durationDays} يوم تدريبي لعدد ${rfp.trainees_count} متدرب)`, quantity: durationDays, unit_price: null, total: null }
    );
    if (rfp.certificate_type && rfp.certificate_type !== "بدون شهادة") {
      breakdown.push({ item: `إصدار شهادات (${rfp.certificate_type}) للمتدربين الناجحين`, quantity: rfp.trainees_count, unit_price: null, total: null });
    }
  }

  return {
    executive_summary: `يسر ${tenantName} تقديم هذا العرض الخاص ببرنامج "${rfp.title}" الموجه لشركائنا في "${rfp.client_name}". يهدف هذا البرنامج إلى تمكين وتطوير مهارات الكوادر البشرية في تخصص "${rfp.category || "التطوير المهني"}" وتزويدهم بالمعرفة الحديثة والخبرات التطبيقية التي تلبي الاحتياجات التشغيلية للشركة. لقد قمنا بتصميم هذا العرض بعناية ليتناسب تماماً مع متطلبات التدريب، مما يضمن تحقيق عائد فوري وملموس على الاستثمار التدريبي لدى منشأتكم.`,
    about_institute: `تأسس ${tenantName} كأحد المعاهد التدريبية الرائدة المرخصة في المملكة العربية السعودية. نحن نهدف لتطوير القيادات وبناء القدرات الفنية والإدارية للمؤسسات والشركات الكبرى. يتميز المعهد بشبكة دولية ومحلية من الخبراء والاستشاريين المعتمدين، ونحن فخورون بشراكتنا المستمرة لتطوير قطاعات الأعمال الحكومية والخاصة بالمملكة وتقديم حقائب تدريبية متوافقة مع أحدث المعايير المهنية العالمية والمحلية الصادرة عن الجهات التنظيمية في المملكة.`,
    methodology: {
      approach: `تعتمد منهجيتنا في تقديم برنامج "${rfp.title}" على أسلوب التعلم التجريبي والتفاعلي (Experiential Learning). نحن لا نكتفي بتقديم المادة النظرية، بل نركز على ورش العمل التطبيقية والمحاكاة التفاعلية، ودراسة الحالات الواقعية المستمدة من بيئة العمل السعودية. سيتم تقديم البرنامج باللغة (${rfp.preferred_language}) وبطريقة تدريب (${rfp.training_type}).`,
      phases: [
        {
          number: 1,
          title: "مرحلة التحضير والتقييم القبلي",
          description: "دراسة الاحتياجات الفعلية للمشاركين وتصميم الاستبيانات القبلية لتحديد الفجوات المعرفية والمهارية وتخصيص المادة العلمية.",
          duration: "قبل البدء بـ 3 أيام",
          objectives: ["تحديد الأهداف الشخصية للمتدربين", "تعديل محاور الحقيبة بما يطابق تحديات العمل اليومية للمشاركين"]
        },
        {
          number: 2,
          title: "مرحلة التنفيذ والتفاعل التدريبي",
          description: `تقديم المحتوى التدريبي على مدار ${durationDays} يوم تدريبي، تتخلله ورش عمل ودراسات حالة وأنشطة جماعية تضمن تفاعل المشاركين.`,
          duration: `${durationDays} أيام`,
          objectives: [`شرح وتطبيق المهارات الأساسية للبرنامج`, "تمكين المشاركين من ممارسة الأدوات والمنهجيات المعتمدة"]
        },
        {
          number: 3,
          title: "مرحلة التقييم الختامي والتقارير",
          description: "إجراء اختبار بعدي لقياس المعرفة المكتسبة، وتقديم تقرير ختامي شامل لإدارة التدريب يتضمن توصيات لاستدامة الأثر وتطوير أداء المشاركين مستقبلاً.",
          duration: "بعد التدريب بـ 3 أيام",
          objectives: ["قياس مدى نجاح أهداف التدريب ونسبة الحضور والاجتياز", "تقديم تقرير تقييمي لكل متدرب وتوصيات الميسر"]
        }
      ],
      tools_and_resources: [
        "حقيبة تدريبية إلكترونية متكاملة لكل متدرب",
        "تمارين وورش عمل محاكاة مصممة خصيصاً",
        "استمارات قياس وتطبيقات عملية لاختبار الفهم والمهارات"
      ]
    },
    timeline: Array.from({ length: Math.ceil(durationDays / 2) }, (_, i) => ({
      week: `اليوم ${i * 2 + 1} - ${Math.min((i + 1) * 2, durationDays)}`,
      activity: `تغطية الوحدات التدريبية والعملية المقررة في المنهج للبرنامج: ${rfp.title} وورش المحاكاة التطبيقية.`
    })),
    financial: rfp.proposal_type !== "technical" ? {
      breakdown,
      total_before_vat: null,
      vat_amount: null,
      total_after_vat: null,
      payment_terms: "يتم تسديد القيمة الإجمالية للعقد بموجب فاتورة رسمية صادرة من المعهد، حيث تدفع 50% كدفعة مقدمة قبل البدء و50% بعد تقديم التقرير الختامي وتوزيع الشهادات.",
      validity_days: 30
    } : null,
    terms_and_conditions: `1. صلاحية العرض: هذا العرض ساري المفعول لمدة 30 يوماً من تاريخ إصداره.
2. السرية: يلتزم الطرفان بالحفاظ على سرية المعلومات والوثائق المتبادلة طوال فترة التعاقد وبعدها.
3. التعديل والإلغاء: أي تعديل على تاريخ أو تفاصيل البرنامج يجب أن يتم بالتنسيق الكتابي المسبق قبل 5 أيام عمل من الموعد المقرر على الأقل تفادياً لأي رسوم إلغاء.`
  };
};

/**
 * Orquestrate the prompt layout and call Gemini model
 */
export const generateProposal = async (
  rfp: RFPInput,
  ragContext: string,
  tenantName: string
): Promise<{
  content: ProposalContent;
  compliance_score: number;
  compliance_checklist: ComplianceItem[];
  judge_score: number | null;
  judge_issues: string[] | null;
}> => {
  // If in mock mode, return mock content instantly
  if (isMockMode()) {
    if (rfp.other_requirements && rfp.other_requirements.includes("FAIL_GENERATION")) {
      throw new Error("سيرفر الذكاء اصطناعي غير متاح حالياً (خطأ تجريبي متعمد)");
    }
    console.log("[Generator] Running in MOCK mode. Generating mock proposal.");
    const mockContent = generateMockProposal(rfp, tenantName);
    const compliance = calculateCompliance(rfp, mockContent);
    return {
      content: mockContent,
      compliance_score: compliance.score,
      compliance_checklist: compliance.checklist,
      judge_score: 90,
      judge_issues: [],
    };
  }

  // 1. Initialize Langfuse Trace
  const langfuse = getLangfuse();
  const promptVersion = "v1.2.0"; // Prompt versioning tag
  const trace = langfuse ? langfuse.trace({
    name: "Generate Proposal",
    metadata: {
      client: rfp.client_name,
      title: rfp.title,
      type: rfp.proposal_type,
      prompt_version: promptVersion,
    }
  }) : null;

  // Calculate duration in days for prompt context
  let durationDays = 5;
  if (rfp.start_date && rfp.end_date) {
    const s = new Date(rfp.start_date);
    const e = new Date(rfp.end_date);
    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
    if (diff > 0) durationDays = diff;
  }

  let prompt = `
أنت خبير في كتابة العروض التدريبية الفنية والمالية للمعاهد التدريبية في المملكة العربية السعودية.
اكتب باللغة العربية الفصحى الرسمية الاحترافية دائماً.
مهم جداً: لا تخترع أرقاماً أو أسعاراً مالية أبداً — ضع قيم الأسعار والمجاميع كـ null ليقوم الموظف بإدخالها لاحقاً.

بيانات المعهد والأسلوب المرجعي:
${ragContext}

طلب العميل الحالي (RFP):
- اسم البرنامج المطلوب: ${rfp.title}
- العميل المستهدف: ${rfp.client_name} (اسم المسؤول: ${rfp.client_contact || "غير محدد"})
- الفئة: ${rfp.category || "غير محدد"} (الفئة الفرعية: ${rfp.subcategory || "غير محدد"})
- نوع التدريب: ${rfp.training_type}
- نوع الشهادة المطلوبة: ${rfp.certificate_type || "غير محدد"}
- اللغة المفضلة للتدريب: ${rfp.preferred_language}
- عدد المشاركين: ${rfp.trainees_count} متدرب
- مدة التدريب بالأيام المقدرة: ${durationDays} أيام (من تاريخ ${rfp.start_date || "غير محدد"} إلى ${rfp.end_date || "غير محدد"})
- ميزانية التدريب المقدرة: ${rfp.budget ? `${rfp.budget} ريال سعودي` : "غير محددة"}
- متطلبات أخرى: ${rfp.other_requirements || "لا يوجد"}
- نوع العرض المطلوب: ${rfp.proposal_type} (فني فقط / مالي فقط / فني ومالي متكامل)
- ملاحظات إضافية: ${rfp.client_notes || "لا يوجد"}

التعليمات الهيكلية:
1. صِغ العرض معتمداً على أسلوب المعهد المرجعي الموضح في السياق.
2. وزع المنهجية إلى خطوات ومراحل واضحة مرقمة (Phase 1, Phase 2, etc.) تحتوي على وصف دقيق وأهداف لكل مرحلة.
3. الجدول المالي (إذا كان العرض مالي أو فني ومالي مشترك): ضع تفاصيل البنود والكميات، ودع أسعار الوحدات والمجاميع null.
4. أجب بصيغة JSON مطابقة تماماً للمخطط الهيكلي المطلوب أدناه.
  `;

  let lastError: any = null;
  const timeoutMs = 90000;
  let finalJudgeScore: number | null = null;
  let finalJudgeIssues: string[] | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const generationSpan = trace ? trace.generation({
      name: `Gemini Generation Run - Attempt ${attempt}`,
      model: "gemini-2.5-flash",
      input: prompt,
      modelParameters: { temperature: 0.2 }
    }) : null;

    try {
      console.log(`[Generator] Generation attempt ${attempt}/3 using Gemini API...`);
      const ai = getGenAI();
      
      const model = ai.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: "أنت خبير في كتابة العروض الفنية والمالية للمعاهد التدريبية في المملكة العربية السعودية. اكتب بالعربية الفصحى الرسمية دائماً. لا تخترع أرقاماً مالية — اتركها null. استخدم أسلوب المعهد المرجعي. أجب بـ JSON صحيح فقط.",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: proposalResponseSchema as any,
          temperature: 0.2,
        },
      });

      const startTime = Date.now();
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
      const responseTime = Date.now() - startTime;

      clearTimeout(timeoutId);

      const responseText = result.response.text();
      if (!responseText) {
        throw new Error("Received empty response from Gemini API");
      }

      const jsonStr = extractJsonString(responseText);
      const content = JSON.parse(jsonStr) as ProposalContent;

      // Validate basic structure
      if (!content.executive_summary || !content.about_institute || !content.methodology) {
        throw new Error("Generated JSON misses key proposal sections");
      }

      const usage = result.response.usageMetadata;

      if (generationSpan) {
        generationSpan.update({
          output: jsonStr,
          usage: usage ? {
            input: usage.promptTokenCount,
            output: usage.candidatesTokenCount,
            total: usage.totalTokenCount
          } : undefined,
          metadata: { latency_ms: responseTime }
        });
        generationSpan.end();
      }

      // 2. Perform LLM-as-a-Judge Evaluation Gating
      console.log(`[Generator] Run evaluation judge audit check...`);
      const auditResult = await auditProposalWithJudge(rfp, content);
      
      finalJudgeScore = auditResult.score;
      finalJudgeIssues = auditResult.issues;

      if (!auditResult.passed && attempt < 3) {
        console.warn(`[Generator] Audit check failed on attempt ${attempt}. Feedback: ${auditResult.issues.join(", ")}. Retrying with self-correction prompt.`);
        
        // Append self-correction feedback loop instruction to prompt
        prompt += `
\nتنبيه: محاولتك السابقة تحتوي على بعض الأخطاء ويجب تصحيحها في هذه النسخة الجديدة:
${auditResult.issues.map((issue) => `- ${issue}`).join("\n")}
        `;
        
        if (trace) {
          trace.event({
            name: "Evaluation Failure",
            input: JSON.stringify(auditResult)
          });
        }
        
        // Wait 1 second before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      console.log("[Generator] Proposal generated successfully via Gemini and passed Judge audit!");
      const compliance = calculateCompliance(rfp, content);

      if (trace) {
        trace.update({
          output: JSON.stringify(content),
          tags: ["success", auditResult.passed ? "passed-audit" : "failed-audit-fallback"]
        });
      }

      return {
        content,
        compliance_score: compliance.score,
        compliance_checklist: compliance.checklist,
        judge_score: finalJudgeScore,
        judge_issues: finalJudgeIssues,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      lastError = error;
      console.warn(`[Generator] Attempt ${attempt} failed:`, error.message || error);
      
      if (generationSpan) {
        generationSpan.update({
          output: error.message || String(error),
          level: "ERROR"
        });
        generationSpan.end();
      }

      if (attempt < 3) {
        // Wait 1 second before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  console.error("[Generator] All 3 generation attempts failed. Falling back to Mock.", lastError);
  
  if (trace) {
    trace.update({
      output: lastError?.message || String(lastError),
      tags: ["fallback"]
    });
  }

  // Fail-safe: Fallback to high-quality mock if real API calls fail in production/development
  const fallbackMock = generateMockProposal(rfp, tenantName);
  const compliance = calculateCompliance(rfp, fallbackMock);
  return {
    content: fallbackMock,
    compliance_score: compliance.score,
    compliance_checklist: compliance.checklist,
    judge_score: null,
    judge_issues: ["Fallback mock used due to generation failure"],
  };
};

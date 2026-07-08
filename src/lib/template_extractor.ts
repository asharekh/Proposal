import { GoogleGenerativeAI } from "@google/generative-ai";
import { getEnv } from "./env";
import { isMockMode } from "./config";

let genAI: GoogleGenerativeAI | null = null;

const getGenAI = (): GoogleGenerativeAI => {
  if (genAI) return genAI;
  const env = getEnv();
  genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return genAI;
};

// Response schema for template extractor
const templateResponseSchema = {
  type: "OBJECT",
  properties: {
    colors: {
      type: "OBJECT",
      properties: {
        primary: { type: "STRING", description: "Primary branding color hex (e.g. #16A34A)" },
        secondary: { type: "STRING", description: "Secondary color hex (e.g. #111827)" },
        bg_dark: { type: "STRING", description: "Dark slide background hex" },
        bg_light: { type: "STRING", description: "Light slide background hex" },
        text_dark: { type: "STRING", description: "Dark text color hex for light slides" },
        text_light: { type: "STRING", description: "Light text color hex for dark slides" }
      },
      required: ["primary", "secondary", "bg_dark", "bg_light", "text_dark", "text_light"]
    },
    fonts: {
      type: "OBJECT",
      properties: {
        heading: { type: "STRING", description: "Font family suggested for headings/titles" },
        body: { type: "STRING", description: "Font family suggested for body text" }
      },
      required: ["heading", "body"]
    },
    slide_structure: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          slide_number: { type: "INTEGER" },
          title: { type: "STRING" },
          layout_type: { type: "STRING", description: "One of: cover, text, phases, timeline, financials, closing" }
        },
        required: ["slide_number", "title", "layout_type"]
      }
    }
  },
  required: ["colors", "fonts", "slide_structure"]
};

export interface TemplateMetadata {
  colors: {
    primary: string;
    secondary: string;
    bg_dark: string;
    bg_light: string;
    text_dark: string;
    text_light: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  slide_structure: {
    slide_number: number;
    title: string;
    layout_type: string;
  }[];
}

/**
 * AI-powered analysis to figure out presentation template styling and section structure from text
 */
export const extractTemplateMetadata = async (
  rawText: string,
  filename: string
): Promise<TemplateMetadata> => {
  if (isMockMode()) {
    console.log("[TemplateExtractor] Running in MOCK mode. Returning default template.");
    return {
      colors: {
        primary: "#16A34A",
        secondary: "#111827",
        bg_dark: "#111827",
        bg_light: "#FFFFFF",
        text_dark: "#1F2937",
        text_light: "#FFFFFF"
      },
      fonts: {
        heading: "Arial",
        body: "Arial"
      },
      slide_structure: [
        { slide_number: 1, title: "Cover Slide", layout_type: "cover" },
        { slide_number: 2, title: "الملخص التنفيذي", layout_type: "text" },
        { slide_number: 3, title: "منهجية العمل", layout_type: "phases" },
        { slide_number: 4, title: "الجدول الزمني", layout_type: "timeline" },
        { slide_number: 5, title: "العرض المالي", layout_type: "financials" },
        { slide_number: 6, title: "الخاتمة", layout_type: "closing" }
      ]
    };
  }

  let textToAnalyze = rawText;
  const estimatedTokens = Math.ceil(textToAnalyze.length / 2.2);
  if (estimatedTokens > 4500) {
    const maxChars = Math.floor(4500 * 2.2);
    console.warn(`[TemplateExtractor] Truncating reference text for analysis to stay under 4500 estimated tokens. Original estimate: ${estimatedTokens} tokens, truncated estimate: 4500 tokens.`);
    textToAnalyze = textToAnalyze.substring(0, maxChars);
  }

  const prompt = `
قم بتحليل النص التالي المستخرج من عرض تقديمي تدريبي (PowerPoint). 
حدد الهيكل البنيوي والنمط البصري المقترح للعرض:
1. استنتج ألوان الهوية المناسبة استناداً إلى اسم الجهة أو نوع قطاع التدريب (على سبيل المثال: إذا كانت أرامكو، فاللون أخضر/أزرق بترولي. إذا كانت وزارة الطاقة، فالأخضر الرسمي. إذا كان تدريب قادة تنفيذي، فذهبى وكحلي).
2. اقترح خطوطاً (Fonts) مناسبة للعناوين والنصوص استناداً لدرجة الرسمية والقطاع (افتراضياً اقترح خطوطاً شائعة تدعم العربية مثل Arial أو Calibri).
3. استخلص قائمة بأسماء وتتابع العناوين الرئيسية لكل شريحة ونوع التخطيط الأنسب لها (مثل: cover, text, phases, timeline, financials, closing).

اسم الملف: ${filename}

نص العرض التقديمي المرجعي:
${textToAnalyze}

أجب بصيغة JSON تطابق المخطط الهيكلي المحدد بدقة.
  `;

  try {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: "أنت خبير فني في تصميم العروض التقديمية في المملكة العربية السعودية. مهمتك هي تحليل نصوص العروض المرجعية واستخلاص مخططات الألوان والشرائح كـ JSON فقط.",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: templateResponseSchema as any,
        temperature: 0.2,
      },
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const responseText = result.response.text();
    if (!responseText) {
      throw new Error("Received empty response from Template Extractor");
    }

    const data = JSON.parse(responseText.trim()) as TemplateMetadata;
    console.log(`[TemplateExtractor] Extracted colors: Primary ${data.colors.primary}, Secondary ${data.colors.secondary}. Found ${data.slide_structure.length} slides.`);
    return data;
  } catch (error) {
    console.error("[TemplateExtractor] Failed to extract template metadata, returning fallback styles:", error);
    return {
      colors: {
        primary: "#16A34A",
        secondary: "#111827",
        bg_dark: "#111827",
        bg_light: "#FFFFFF",
        text_dark: "#1F2937",
        text_light: "#FFFFFF"
      },
      fonts: {
        heading: "Arial",
        body: "Arial"
      },
      slide_structure: [
        { slide_number: 1, title: "Cover Slide", layout_type: "cover" },
        { slide_number: 2, title: "الملخص التنفيذي", layout_type: "text" },
        { slide_number: 3, title: "المنهجية والأسلوب", layout_type: "phases" },
        { slide_number: 4, title: "الجدول الزمني", layout_type: "timeline" },
        { slide_number: 5, title: "العرض المالي", layout_type: "financials" },
        { slide_number: 6, title: "الخاتمة", layout_type: "closing" }
      ]
    };
  }
};

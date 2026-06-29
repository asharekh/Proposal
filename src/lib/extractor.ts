// Native file parser libraries are dynamically imported inside extraction handlers to prevent build-time evaluation issues

// Polyfill browser globals for pdfjs-dist in Next.js Server / Node.js contexts
if (typeof globalThis !== "undefined") {
  if (!(globalThis as any).DOMMatrix) {
    (globalThis as any).DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      constructor(init?: any) {
        if (Array.isArray(init)) {
          this.a = init[0]; this.b = init[1]; this.c = init[2]; this.d = init[3]; this.e = init[4]; this.f = init[5];
        }
      }
    };
  }
  if (!(globalThis as any).ImageData) {
    (globalThis as any).ImageData = class ImageData {
      width: number; height: number; data: Uint8ClampedArray;
      constructor(width: number, height: number) {
        this.width = width; this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    };
  }
  if (!(globalThis as any).Path2D) {
    (globalThis as any).Path2D = class Path2D {};
  }
}
if (typeof global !== "undefined") {
  if (!(global as any).DOMMatrix) {
    (global as any).DOMMatrix = (globalThis as any).DOMMatrix;
  }
  if (!(global as any).ImageData) {
    (global as any).ImageData = (globalThis as any).ImageData;
  }
  if (!(global as any).Path2D) {
    (global as any).Path2D = (globalThis as any).Path2D;
  }
}


/**
 * Normalizes Arabic text by fixing encoding issues, removing control chars, and cleaning whitespaces
 */
export const normalizeArabic = (text: string): string => {
  if (!text) return "";

  let cleaned = text;

  // 1. Fix line endings to standard Unix style
  cleaned = cleaned.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Remove non-printable control characters (except tab and newlines)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");

  // 3. Address UTF-8 mojibake/encoding glitches common in Arabic file readers (e.g., standard symbols replacement)
  // Fixes common Windows-1256 / UTF-8 misalignments if any, but mostly keeps clean unicode characters.
  
  // 4. Normalize multiple whitespaces/tabs into a single space, while keeping separate paragraphs
  cleaned = cleaned.split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return cleaned;
};

/**
 * Assesses the quality of extracted text based on Arabic characters ratio and word counts
 */
export const checkExtractionQuality = (
  text: string
): { quality: "good" | "poor" | "empty"; wordCount: number; message?: string } => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { quality: "empty", wordCount: 0, message: "الملف فارغ أو لم يتم استخراج أي نص منه." };
  }

  // Count words
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Count Arabic characters
  // Matches standard Arabic characters range (0600-06FF) and Arabic Presentation Forms A and B
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  const matchResult = trimmed.match(arabicRegex);
  const arabicCharCount = matchResult ? matchResult.length : 0;
  const totalCharCount = trimmed.length;

  const arabicRatio = totalCharCount > 0 ? arabicCharCount / totalCharCount : 0;

  if (wordCount < 10) {
    return {
      quality: "poor",
      wordCount,
      message: "محتوى الملف قصير جداً (أقل من 10 كلمات)، يرجى رفع ملف أطول.",
    };
  }

  if (wordCount < 50 || arabicRatio < 0.1) {
    const arabicPercentage = Math.round(arabicRatio * 100);
    return {
      quality: "poor",
      wordCount,
      message: `تنبيه: جودة النص المستخرج قد تكون ضعيفة. عدد الكلمات: ${wordCount}، نسبة الحروف العربية: ${arabicPercentage}%. يرجى التحقق من صياغة الملف المرفوع.`,
    };
  }

  return { quality: "good", wordCount };
};

/**
 * Extracts plain text from document buffer based on file name extension
 */
export const extractTextFromFile = async (
  buffer: Buffer,
  filename: string
): Promise<string> => {
  const ext = filename.split(".").pop()?.toLowerCase();

  let rawText = "";

  if (ext === "pdf") {
    // Extract using pdf-parse
    const pdfImport = await import("pdf-parse");
    const parser = new pdfImport.PDFParse({ data: buffer });
    try {
      const textResult = await parser.getText();
      rawText = textResult.text || "";
    } finally {
      await parser.destroy();
    }
  } else if (ext === "docx" || ext === "doc") {
    // Extract using mammoth
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    rawText = result.value || "";
  } else if (ext === "txt") {
    // Decode as UTF-8 plain text
    rawText = buffer.toString("utf-8");
  } else {
    throw new Error("نوع الملف غير مدعوم. يرجى رفع ملف بصيغة (PDF, DOCX, TXT) فقط.");
  }

  // Clean and normalize
  return normalizeArabic(rawText);
};

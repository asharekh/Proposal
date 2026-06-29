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

/**
 * Generate a 768-dimension vector embedding for reference proposals or search queries.
 */
export const getEmbedding = async (
  text: string,
  metadata?: { title?: string; trainingType?: string; sector?: string }
): Promise<number[]> => {
  // 1. Prepare and clean content
  let contentToEmbed = text;
  if (metadata) {
    const parts = [
      metadata.title ? `Title: ${metadata.title}` : "",
      metadata.trainingType ? `Type: ${metadata.trainingType}` : "",
      metadata.sector ? `Sector: ${metadata.sector}` : "",
      text,
    ].filter(Boolean);
    contentToEmbed = parts.join("\n");
  }

  // 2. Truncate to 8000 chars max
  contentToEmbed = contentToEmbed.substring(0, 8000);

  // 3. Fallback mock embedding if mock mode is active
  if (isMockMode()) {
    // Generate a deterministically pseudo-random 768-dimension vector based on text
    const vector: number[] = [];
    let hash = 0;
    for (let i = 0; i < contentToEmbed.length; i++) {
      hash = contentToEmbed.charCodeAt(i) + ((hash << 5) - hash);
    }
    for (let i = 0; i < 768; i++) {
      const value = Math.sin(hash + i) * 0.5 + 0.5; // range [0, 1]
      vector.push(value);
    }
    return vector;
  }

  try {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(contentToEmbed);
    
    if (result && result.embedding && result.embedding.values) {
      return result.embedding.values;
    }
    throw new Error("Invalid response format from Google Embeddings API");
  } catch (error) {
    console.error("Failed to generate embedding from Gemini API:", error);
    // If real API fails but we are running in dev, return a mock fallback vector
    const vector: number[] = Array.from({ length: 768 }, (_, i) => Math.sin(i) * 0.1);
    return vector;
  }
};

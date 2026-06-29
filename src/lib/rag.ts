import { query, queryOne, memoryStore, checkDbConnection } from "./db";
import { getEmbedding } from "./embeddings";
import { SimilarProposal } from "../types";
import { isMockMode } from "./config";

/**
 * Perform a cosine similarity vector search over reference proposals
 */
export const findSimilarProposals = async (
  tenantId: string,
  rfpText: string,
  limit: number = 5
): Promise<SimilarProposal[]> => {
  // Check count of references first (handles cold start gracefully)
  const isDbAvailable = !isMockMode() && (await checkDbConnection());

  if (!isDbAvailable) {
    // Mock memory vector search using dot-product or simple matching
    console.log(`[Mock Vector Search] Tenant: ${tenantId} | Query: "${rfpText.substring(0, 50)}..."`);
    const mockRefProposals = Array.from(memoryStore.proposals.values()).filter(
      (p) => p.tenant_id === tenantId
    );

    if (mockRefProposals.length === 0) {
      console.log("[Mock Vector Search] Cold start: no proposals found.");
      return [];
    }

    // Since we don't have a real vector engine in memory, we rank by simple text overlap or return them
    const queryVector = await getEmbedding(rfpText);
    const results = mockRefProposals.map((p) => {
      // Calculate dot product of mock vectors for similarity
      const pVector = p.embedding || [];
      let similarity = 0.5; // default fallback similarity
      if (pVector.length === queryVector.length) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < queryVector.length; i++) {
          dotProduct += queryVector[i] * pVector[i];
          normA += queryVector[i] * queryVector[i];
          normB += pVector[i] * pVector[i];
        }
        similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
      }

      return {
        id: p.id,
        rfp_title: p.rfp_title,
        training_type: p.training_type,
        sector: p.sector,
        content_text: p.content_text,
        status: p.status,
        similarity,
      };
    });

    const filtered = results.filter((r) => r.similarity > 0.2);
    filtered.sort((a, b) => b.similarity - a.similarity);
    console.log(`[Mock Vector Search] Found ${filtered.length} similar proposals in memory.`);
    return filtered.slice(0, limit);
  }

  try {
    // 1. Get count first
    const countRow = await queryOne<{ count: string }>(
      tenantId,
      "SELECT COUNT(*) as count FROM proposals"
    );
    if (!countRow || parseInt(countRow.count, 10) === 0) {
      console.log("Vector search cold start: proposals table is empty.");
      return [];
    }

    // 2. Generate search vector
    const vector = await getEmbedding(rfpText);

    // 3. Cosine similarity query (pgvector format)
    const sql = `
      SELECT 
        id, 
        rfp_title, 
        training_type, 
        sector, 
        content_text, 
        status,
        (1 - (embedding <=> $1::vector)) as similarity
      FROM proposals 
      WHERE tenant_id = $2 AND (1 - (embedding <=> $1::vector)) > 0.2
      ORDER BY similarity DESC 
      LIMIT $3
    `;

    // Stringify vector for pg pgvector input
    const vectorStr = `[${vector.join(",")}]`;
    const results = await query<SimilarProposal>(tenantId, sql, [vectorStr, tenantId, limit]);
    
    console.log(`[DB Vector Search] Found ${results.length} proposals with similarity > 0.2.`);
    return results;
  } catch (error) {
    console.error("Vector search failed on DB:", error);
    return [];
  }
};

/**
 * Format retrieved references and profile context for prompting Gemini
 */
export const buildRAGContext = async (
  similarProposals: SimilarProposal[],
  tenantId: string
): Promise<string> => {
  // Fetch tenant profile configuration
  let profile: any = null;
  const isDbAvailable = !isMockMode() && (await checkDbConnection());

  if (!isDbAvailable) {
    profile = memoryStore.profiles.get(tenantId);
  } else {
    profile = await queryOne(
      tenantId,
      "SELECT writing_style, fixed_terms, pricing_ranges, specializations FROM tenant_proposal_profiles WHERE tenant_id = $1",
      [tenantId]
    );
  }

  let context = "";

  // 1. Add institute baseline profile info
  if (profile) {
    context += "=== هُوية وأسلوب المعهد التدريبي ===\n";
    if (profile.writing_style) {
      context += `- أسلوب الصياغة والكتابة: ${profile.writing_style}\n`;
    }
    if (profile.specializations && profile.specializations.length > 0) {
      context += `- تخصصات المعهد: ${profile.specializations.join("، ")}\n`;
    }
    if (profile.fixed_terms && Object.keys(profile.fixed_terms).length > 0) {
      context += `- بنود وأحكام ثابتة للمعهد:\n`;
      for (const [key, value] of Object.entries(profile.fixed_terms)) {
        context += `  * ${key}: ${value}\n`;
      }
    }
    context += "\n";
  }

  // 2. Format proposals context (won proposals first as prime examples)
  if (similarProposals.length > 0) {
    context += "=== عروض تدريبية مرجعية سابقة للاسترشاد بها ===\n\n";

    // Sort: won first, then others
    const sortedProposals = [...similarProposals].sort((a, b) => {
      if (a.status === "won" && b.status !== "won") return -1;
      if (a.status !== "won" && b.status === "won") return 1;
      return b.similarity - a.similarity;
    });

    sortedProposals.forEach((p, idx) => {
      const isWon = p.status === "won";
      const characterLimit = isWon ? 2500 : 1200;
      const cleanContent = p.content_text.substring(0, characterLimit);

      context += `[عرض مرجعي #${idx + 1}] (${isWon ? "مرجع رئيسي - عرض فائز" : "عرض سابق"})\n`;
      context += `العنوان: ${p.rfp_title}\n`;
      if (p.training_type) context += `نوع التدريب: ${p.training_type}\n`;
      if (p.sector) context += `القطاع: ${p.sector}\n`;
      context += `المحتوى المرجعي:\n"""\n${cleanContent}\n"""\n\n`;
    });
  } else {
    context += "=== ملاحظة ===\nلا توجد عروض مرجعية سابقة. يرجى صياغة العرض بناءً على المدخلات فقط وبشكل احترافي فائق الجودة.\n\n";
  }

  return context;
};

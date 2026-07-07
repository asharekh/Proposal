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
  limit: number = 5,
  filters?: { sector?: string; trainingType?: string }
): Promise<SimilarProposal[]> => {
  // Check count of references first (handles cold start gracefully)
  const isDbAvailable = !isMockMode() && (await checkDbConnection());

  if (!isDbAvailable) {
    // Mock memory vector search using dot-product or simple matching
    console.log(`[Mock Vector Search] Tenant: ${tenantId} | Query: "${rfpText.substring(0, 50)}..."`);
    let mockRefProposals = Array.from(memoryStore.proposals.values()).filter(
      (p) => p.tenant_id === tenantId
    );

    if (mockRefProposals.length === 0) {
      console.log("[Mock Vector Search] Cold start: no proposals found.");
      return [];
    }

    // Apply hybrid filtering preferences in mock mode
    if (filters) {
      let filtered = mockRefProposals;
      if (filters.sector) {
        filtered = filtered.filter((p) => p.sector === filters.sector);
      }
      if (filters.trainingType) {
        filtered = filtered.filter((p) => p.training_type === filters.trainingType);
      }
      // If we got matches, use them. Otherwise, fall back to unfiltered to prevent empty results.
      if (filtered.length > 0) {
        mockRefProposals = filtered;
      }
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
      "SELECT COUNT(*) as count FROM proposal_chunks"
    );
    if (!countRow || parseInt(countRow.count, 10) === 0) {
      console.log("Vector search cold start: proposal_chunks table is empty.");
      return [];
    }

    // 2. Generate search vector
    const vector = await getEmbedding(rfpText);
    const vectorStr = `[${vector.join(",")}]`;

    let results: SimilarProposal[] = [];

    // 3. Try sector/training_type specific search first (if filters are provided)
    if (filters && (filters.sector || filters.trainingType)) {
      const conditions: string[] = [];
      const params: any[] = [vectorStr, tenantId];
      let paramCount = 3;

      if (filters.sector) {
        conditions.push(`p.sector = $${paramCount}`);
        params.push(filters.sector);
        paramCount++;
      }
      if (filters.trainingType) {
        conditions.push(`p.training_type = $${paramCount}`);
        params.push(filters.trainingType);
        paramCount++;
      }

      params.push(limit);
      const limitParamIdx = paramCount;

      const sql = `
        SELECT 
          c.id, 
          p.rfp_title, 
          p.training_type, 
          p.sector, 
          c.content_text, 
          p.status,
          (- (c.embedding <#> $1::vector)) as similarity
        FROM proposal_chunks c
        JOIN proposals p ON c.proposal_id = p.id
        WHERE c.tenant_id = $2 
          AND ${conditions.join(" AND ")}
          AND (- (c.embedding <#> $1::vector)) > 0.2
        ORDER BY similarity DESC 
        LIMIT $${limitParamIdx}
      `;
      
      results = await query<SimilarProposal>(tenantId, sql, params);
      console.log(`[DB Vector Search] Found ${results.length} metadata-matching semantic chunks.`);
    }

    // 4. Fallback search (if results count is less than the limit)
    if (results.length < limit) {
      const remainingLimit = limit - results.length;
      
      // Exclude already retrieved chunk IDs
      let excludeClause = "";
      const params: any[] = [vectorStr, tenantId, remainingLimit];
      if (results.length > 0) {
        const idList = results.map((r, i) => `$${i + 4}`).join(",");
        excludeClause = `AND c.id NOT IN (${idList})`;
        results.forEach(r => params.push(r.id));
      }

      const sql = `
        SELECT 
          c.id, 
          p.rfp_title, 
          p.training_type, 
          p.sector, 
          c.content_text, 
          p.status,
          (- (c.embedding <#> $1::vector)) as similarity
        FROM proposal_chunks c
        JOIN proposals p ON c.proposal_id = p.id
        WHERE c.tenant_id = $2 
          ${excludeClause}
          AND (- (c.embedding <#> $1::vector)) > 0.2
        ORDER BY similarity DESC 
        LIMIT $3
      `;
      
      const fallbackResults = await query<SimilarProposal>(tenantId, sql, params);
      results = [...results, ...fallbackResults];
      console.log(`[DB Vector Search] Combined retrieved chunks count: ${results.length}.`);
    }

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

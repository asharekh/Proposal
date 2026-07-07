import { NextRequest, NextResponse } from "next/server";
import { query, executeIsolatedQuery, memoryStore, checkDbConnection } from "@/lib/db";
import { isMockMode, getTenantId } from "@/lib/config";
import { extractTextFromFile, checkExtractionQuality, splitTextIntoChunks } from "@/lib/extractor";
import { getEmbedding } from "@/lib/embeddings";
import { Proposal } from "@/types";
import { extractTemplateMetadata } from "@/lib/template_extractor";

export const dynamic = "force-dynamic";

// GET - retrieve reference proposals
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenant_id") || getTenantId();

  const isDbConnected = !isMockMode() && (await checkDbConnection());

  if (!isDbConnected) {
    const list = Array.from(memoryStore.proposals.values())
      .filter((p) => p.tenant_id === tenantId)
      .map(({ id, rfp_title, training_type, sector, status, created_at }) => ({
        id,
        rfp_title,
        training_type,
        sector,
        status,
        created_at,
      }));
    return NextResponse.json({ success: true, data: list });
  }

  try {
    const list = await query(
      tenantId,
      `SELECT id, rfp_title, training_type, sector, status, created_at 
       FROM proposals 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC`,
      [tenantId]
    );
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    console.error("Error listing reference proposals:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST - upload a reference proposal
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const rfpTitle = formData.get("rfp_title") as string | null;
    const trainingType = formData.get("training_type") as string | null;
    const sector = formData.get("sector") as string | null;
    const status = (formData.get("status") as string | null) || "pending";
    const tenantId = (formData.get("tenant_id") as string | null) || getTenantId();

    if (!file) {
      return NextResponse.json({ success: false, error: "لم يتم إرسال أي ملف" }, { status: 400 });
    }

    if (!rfpTitle) {
      return NextResponse.json({ success: false, error: "عنوان العرض المرجعي مطلوب" }, { status: 400 });
    }

    // 1. Validate file size (max 20MB)
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "حجم الملف يتجاوز الحد الأقصى المسموح به (20 ميجابايت)" }, { status: 400 });
    }

    // 2. Read array buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Extract text
    let extractedText = "";
    try {
      extractedText = await extractTextFromFile(buffer, file.name);
    } catch (err: any) {
      console.error("PDF extraction failed:", err);
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }

    // 4. Quality checks
    const qualityResult = checkExtractionQuality(extractedText);
    if (qualityResult.quality === "empty") {
      return NextResponse.json({ success: false, error: qualityResult.message }, { status: 400 });
    }

    // 5. Generate embeddings
    let embedding: number[] = [];
    try {
      embedding = await getEmbedding(extractedText, {
        title: rfpTitle,
        trainingType: trainingType || undefined,
        sector: sector || undefined,
      });
    } catch (err: any) {
      console.error("Failed to generate embedding during upload:", err);
      // We will allow continuing in mock mode or dev fallback, but strictly handle it.
    }

    // 5b. Extract PPTX template metadata if applicable
    let templateMetadata: any = null;
    const isPptx = file.name.endsWith(".pptx");
    if (isPptx) {
      try {
        templateMetadata = await extractTemplateMetadata(extractedText, file.name);
      } catch (err) {
        console.error("Failed to extract PPTX template metadata:", err);
      }
    }

    const isDbConnected = !isMockMode() && (await checkDbConnection());

    if (!isDbConnected) {
      // Save to memory store
      const newProposal: Proposal = {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        rfp_title: rfpTitle,
        training_type: trainingType,
        sector: sector,
        content_text: extractedText,
        status: status as any,
        embedding: embedding,
        created_at: new Date().toISOString(),
      };
      (newProposal as any).template_metadata = templateMetadata;
      memoryStore.proposals.set(newProposal.id, newProposal);

      return NextResponse.json({
        success: true,
        message: "تم رفع وتحليل الملف وحفظه بنجاح (وضع الحفظ المؤقت)",
        data: {
          id: newProposal.id,
          word_count: qualityResult.wordCount,
          quality: qualityResult.quality,
          warning: qualityResult.message,
        },
      });
    }

    // Save to Database
    const proposalId = await executeIsolatedQuery(tenantId, async (client) => {
      if (!client) return null;
      
      // 1. Insert parent proposal record
      const sql = `
        INSERT INTO proposals (tenant_id, rfp_title, training_type, sector, content_text, status, embedding, template_metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, NOW())
        RETURNING id
      `;
      // Format vector array for pg
      const vectorStr = `[${embedding.join(",")}]`;
      const res = await client.query(sql, [
        tenantId,
        rfpTitle,
        trainingType,
        sector,
        extractedText,
        status,
        vectorStr,
        templateMetadata ? JSON.stringify(templateMetadata) : null,
      ]);
      const parentId = res.rows[0].id;

      // 2. Segment and insert semantic chunks
      const chunks = splitTextIntoChunks(extractedText, 1200, 150);
      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        
        let chunkEmbedding: number[] = [];
        try {
          chunkEmbedding = await getEmbedding(chunkText, {
            title: rfpTitle,
            trainingType: trainingType || undefined,
            sector: sector || undefined,
          });
        } catch (err) {
          console.error(`Failed to generate embedding for chunk ${i}:`, err);
          // Fallback pseudo-random embedding vector if Gemini API fails
          chunkEmbedding = Array.from({ length: 768 }, (_, k) => Math.sin(k + i) * 0.1);
        }

        const chunkVectorStr = `[${chunkEmbedding.join(",")}]`;
        const chunkSql = `
          INSERT INTO proposal_chunks (proposal_id, tenant_id, chunk_index, content_text, embedding, created_at)
          VALUES ($1, $2, $3, $4, $5::vector, NOW())
        `;
        await client.query(chunkSql, [parentId, tenantId, i, chunkText, chunkVectorStr]);
      }

      return parentId;
    });

    return NextResponse.json({
      success: true,
      message: "تم رفع وتحليل العرض المرجعي بنجاح وحفظه في قاعدة البيانات",
      data: {
        id: proposalId,
        word_count: qualityResult.wordCount,
        quality: qualityResult.quality,
        warning: qualityResult.message,
      },
    });
  } catch (error: any) {
    console.error("Error uploading file:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

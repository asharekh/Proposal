import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryOne, executeIsolatedQuery, memoryStore, checkDbConnection } from "@/lib/db";
import { isMockMode, getTenantId } from "@/lib/config";
import { rateLimit } from "@/lib/rate-limit";
import { findSimilarProposals, buildRAGContext } from "@/lib/rag";
import { generateProposal } from "@/lib/generator";
import { RFPInput, GeneratedProposal } from "@/types";

export const dynamic = "force-dynamic";

// Zod validation schema for RFP Input
const rfpInputSchema = z.object({
  title: z.string().min(1, "اسم الدورة مطلوب"),
  client_name: z.string().min(1, "اسم الشركة أو الجهة مطلوب"),
  client_contact: z.string().optional().nullable(),
  budget: z.number().optional().nullable(),
  category: z.string().optional().nullable(),
  subcategory: z.string().optional().nullable(),
  training_type: z.string().min(1, "نوع التدريب مطلوب"),
  certificate_type: z.string().optional().nullable(),
  preferred_language: z.string().min(1, "اللغة المفضلة مطلوبة"),
  trainees_count: z.number().int().positive("عدد المشاركين يجب أن يكون أكبر من 0"),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  other_requirements: z.string().optional().nullable(),
  
  proposal_type: z.enum(["technical", "financial", "combined"]),
  deadline: z.string().optional().nullable(),
  client_notes: z.string().optional().nullable(),
  rfp_text: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Rate Limit Check (10 requests/minute/IP)
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    if (!rateLimit(ip, "/api/generate")) {
      return NextResponse.json(
        { success: false, error: "تم تجاوز الحد الأقصى للمعدل المسموح به (10 طلبات في الدقيقة). يرجى المحاولة لاحقاً." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const tenantId = body.tenant_id || getTenantId();

    let rfpData: RFPInput;
    let proposalId: string;
    let isRetry = false;

    const isDbConnected = !isMockMode() && (await checkDbConnection());

    // Check if it's a retry request (contains proposal_id and no rfp data)
    if (body.proposal_id && !body.rfp) {
      isRetry = true;
      proposalId = body.proposal_id;

      if (isDbConnected) {
        const row = await queryOne(
          tenantId,
          "SELECT rfp_data FROM generated_proposals WHERE id = $1",
          [proposalId]
        );
        if (!row) {
          return NextResponse.json({ success: false, error: "لم يتم العثور على الطلب التدريبي" }, { status: 404 });
        }
        rfpData = row.rfp_data as RFPInput;
      } else {
        const row = memoryStore.generatedProposals.get(proposalId);
        if (!row) {
          return NextResponse.json({ success: false, error: "لم يتم العثور على الطلب التدريبي" }, { status: 404 });
        }
        rfpData = row.rfp_data;
      }
    } else {
      // Validate RFP data
      const parseResult = rfpInputSchema.safeParse(body.rfp);
      if (!parseResult.success) {
        const errorMsg = parseResult.error.issues.map((e) => e.message).join("، ");
        return NextResponse.json({ success: false, error: `البيانات المدخلة غير صالحة: ${errorMsg}` }, { status: 400 });
      }

      rfpData = parseResult.data as RFPInput;

      // 2. Save RFP first as a draft record
      const emptyContent = {
        executive_summary: "",
        about_institute: "",
        methodology: { approach: "", phases: [], tools_and_resources: [] },
        timeline: [],
        terms_and_conditions: "",
      };

      if (isDbConnected) {
        proposalId = await executeIsolatedQuery(tenantId, async (client) => {
          if (!client) return "";
          const sql = `
            INSERT INTO generated_proposals (
              tenant_id, rfp_data, draft_content, review_status, 
              compliance_score, compliance_checklist, reference_proposal_ids, created_at
            )
            VALUES ($1, $2, $3, 'draft', 0, '[]'::jsonb, '[]'::jsonb, NOW())
            RETURNING id
          `;
          const res = await client.query(sql, [
            tenantId,
            JSON.stringify(rfpData),
            JSON.stringify(emptyContent),
          ]);
          return res.rows[0].id;
        });
      } else {
        proposalId = crypto.randomUUID();
        const newGen: GeneratedProposal = {
          id: proposalId,
          tenant_id: tenantId,
          rfp_data: rfpData,
          draft_content: emptyContent,
          review_status: "draft",
          compliance_score: 0,
          compliance_checklist: [],
          reference_proposal_ids: [],
          created_at: new Date().toISOString(),
        };
        memoryStore.generatedProposals.set(proposalId, newGen);
      }
    }

    let tenantName = "معهد التميز للتدريب";

    // 3. Fetch Tenant Details
    if (isDbConnected) {
      const tenant = await queryOne(
        tenantId,
        "SELECT name FROM tenants WHERE id = $1",
        [tenantId]
      );
      if (tenant) {
        tenantName = tenant.name;
      }
    } else {
      const tenant = memoryStore.tenants.get(tenantId);
      if (tenant) tenantName = tenant.name;
    }

    try {
      // 4. Vector Cosine Similarity Search
      const searchString = rfpData.rfp_text || 
        `برنامج تدريبي بعنوان ${rfpData.title} في فئة ${rfpData.category || ""}. نوع التدريب: ${rfpData.training_type}. متطلبات أخرى: ${rfpData.other_requirements || ""}`;
      
      const similarProposals = await findSimilarProposals(tenantId, searchString, 5);

      // 5. Build RAG Context
      const ragContext = await buildRAGContext(similarProposals, tenantId);

      // 6. Generate proposal using Gemini
      const { content, compliance_score, compliance_checklist } = await generateProposal(
        rfpData,
        ragContext,
        tenantName
      );

      const refIds = similarProposals.map((p) => p.id);

      // 7. Update proposal with generated content
      if (isDbConnected) {
        await executeIsolatedQuery(tenantId, async (client) => {
          if (!client) return;
          const sql = `
            UPDATE generated_proposals
            SET draft_content = $1, compliance_score = $2, compliance_checklist = $3, reference_proposal_ids = $4, review_status = 'in_review'
            WHERE id = $5
          `;
          await client.query(sql, [
            JSON.stringify(content),
            compliance_score,
            JSON.stringify(compliance_checklist),
            JSON.stringify(refIds),
            proposalId,
          ]);
        });
      } else {
        const genProp = memoryStore.generatedProposals.get(proposalId);
        if (genProp) {
          genProp.draft_content = content;
          genProp.compliance_score = compliance_score;
          genProp.compliance_checklist = compliance_checklist;
          genProp.reference_proposal_ids = refIds;
          genProp.review_status = "in_review";
        }
      }

      return NextResponse.json({
        success: true,
        proposal_id: proposalId,
        compliance_score,
        compliance_checklist,
        content,
      });
    } catch (genError: any) {
      console.error("AI proposal generation failed, returning saved draft:", genError);
      return NextResponse.json({
        success: false,
        error: `فشل توليد العرض بالذكاء الاصطناعي: ${genError.message || genError}. تم حفظ الطلب كمسودة.`,
        proposal_id: proposalId,
        rfp_saved: true,
      });
    }
  } catch (error: any) {
    console.error("Error in generate route:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

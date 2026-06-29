import { NextRequest, NextResponse } from "next/server";
import { queryOne, memoryStore, checkDbConnection } from "@/lib/db";
import { isMockMode, getTenantId } from "@/lib/config";
import { GeneratedProposal } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenant_id") || getTenantId();

  if (!id) {
    return NextResponse.json({ success: false, error: "معرف العرض مطلوب" }, { status: 400 });
  }

  const isDbConnected = !isMockMode() && (await checkDbConnection());

  if (!isDbConnected) {
    const proposal = memoryStore.generatedProposals.get(id);
    if (!proposal || proposal.tenant_id !== tenantId) {
      return NextResponse.json({ success: false, error: "العرض التدريبي المولد غير موجود" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: proposal });
  }

  try {
    const row = await queryOne(
      tenantId,
      `SELECT id, tenant_id, rfp_data, draft_content, review_status, 
              compliance_score, compliance_checklist, reference_proposal_ids, 
              reviewer_id, reviewed_at, exported_pdf_url, created_at 
       FROM generated_proposals 
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (!row) {
      return NextResponse.json({ success: false, error: "العرض التدريبي المولد غير موجود" }, { status: 404 });
    }

    const proposal: GeneratedProposal = {
      id: row.id,
      tenant_id: row.tenant_id,
      rfp_data: typeof row.rfp_data === "string" ? JSON.parse(row.rfp_data) : row.rfp_data,
      draft_content: typeof row.draft_content === "string" ? JSON.parse(row.draft_content) : row.draft_content,
      review_status: row.review_status,
      compliance_score: row.compliance_score,
      compliance_checklist: typeof row.compliance_checklist === "string" ? JSON.parse(row.compliance_checklist) : row.compliance_checklist,
      reference_proposal_ids: typeof row.reference_proposal_ids === "string" ? JSON.parse(row.reference_proposal_ids) : row.reference_proposal_ids,
      reviewer_id: row.reviewer_id,
      reviewed_at: row.reviewed_at,
      exported_pdf_url: row.exported_pdf_url,
      created_at: row.created_at,
    };

    return NextResponse.json({ success: true, data: proposal });
  } catch (error: any) {
    console.error("Error fetching single proposal:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

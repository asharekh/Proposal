import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, executeIsolatedQuery, memoryStore, checkDbConnection } from "@/lib/db";
import { isMockMode, getTenantId } from "@/lib/config";
import { ProposalContent, GeneratedProposal } from "@/types";
import { calculateCompliance, validateFinancialCompleteness } from "@/lib/generator";
import { getEmbedding } from "@/lib/embeddings";
import { distillClientGuidelines } from "@/lib/judge";

export const dynamic = "force-dynamic";

/**
 * Compiles modular proposal content into a clean plain text block for reference index archiving
 */
const compileProposalText = (content: ProposalContent): string => {
  const parts = [
    "=== الملخص التنفيذي ===",
    content.executive_summary,
    "=== نبذة عن المعهد ===",
    content.about_institute,
    "=== المنهجية والأسلوب التدريبي ===",
    content.methodology?.approach,
    ...(content.methodology?.phases || []).map(
      (p) => `[مرحلة ${p.number}] ${p.title}\nالمدة: ${p.duration}\nالوصف: ${p.description}\nالأهداف: ${p.objectives?.join("، ")}`
    ),
    "=== الجدول الزمني ===",
    ...(content.timeline || []).map((t) => `${t.week}: ${t.activity}`),
    content.financial
      ? `=== تفاصيل العرض المالي ===\nشروط الدفع: ${content.financial.payment_terms}\nمدة الصلاحية: ${content.financial.validity_days} يوم`
      : "",
    "=== البنود والشروط ===",
    content.terms_and_conditions,
  ].filter(Boolean);

  return parts.join("\n\n");
};

// GET - List generated proposals
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenant_id") || getTenantId();
  const statusFilter = searchParams.get("status"); // optional filter

  const isDbConnected = !isMockMode() && (await checkDbConnection());

  if (!isDbConnected) {
    let list = Array.from(memoryStore.generatedProposals.values()).filter(
      (p) => p.tenant_id === tenantId
    );

    if (statusFilter) {
      list = list.filter((p) => p.review_status === statusFilter);
    }

    // Return summaries only
    const summaries = list.map((p) => ({
      id: p.id,
      client_name: p.rfp_data.client_name,
      rfp_title: p.rfp_data.title,
      proposal_type: p.rfp_data.proposal_type,
      review_status: p.review_status,
      compliance_score: p.compliance_score,
      created_at: p.created_at,
      judge_score: p.judge_score,
    }));

    return NextResponse.json({ success: true, data: summaries });
  }

  try {
    let sql = `
      SELECT 
        id, 
        rfp_data->>'client_name' as client_name, 
        rfp_data->>'title' as rfp_title, 
        rfp_data->>'proposal_type' as proposal_type, 
        review_status, 
        compliance_score, 
        created_at,
        judge_score
      FROM generated_proposals 
      WHERE tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (statusFilter) {
      sql += " AND review_status = $2";
      params.push(statusFilter);
    }

    sql += " ORDER BY created_at DESC";

    const list = await query(tenantId, sql, params);
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    console.error("Error listing generated proposals:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PATCH - Perform actions: approve, update_content, mark_exported, mark_won, mark_lost
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action, tenant_id, draft_content } = body;
    const tenantId = tenant_id || getTenantId();

    if (!id || !action) {
      return NextResponse.json({ success: false, error: "المعرف والإجراء مطلوبان" }, { status: 400 });
    }

    const isDbConnected = !isMockMode() && (await checkDbConnection());
    let proposal: GeneratedProposal | null = null;

    // Fetch existing generated proposal details
    if (!isDbConnected) {
      proposal = memoryStore.generatedProposals.get(id) || null;
    } else {
      const dbRow = await queryOne(
        tenantId,
        "SELECT id, tenant_id, rfp_data, draft_content, review_status, compliance_score, compliance_checklist, reference_proposal_ids, created_at, judge_score, judge_issues FROM generated_proposals WHERE id = $1",
        [id]
      );
      if (dbRow) {
        proposal = {
          id: dbRow.id,
          tenant_id: dbRow.tenant_id,
          rfp_data: typeof dbRow.rfp_data === "string" ? JSON.parse(dbRow.rfp_data) : dbRow.rfp_data,
          draft_content: typeof dbRow.draft_content === "string" ? JSON.parse(dbRow.draft_content) : dbRow.draft_content,
          review_status: dbRow.review_status,
          compliance_score: dbRow.compliance_score,
          compliance_checklist: typeof dbRow.compliance_checklist === "string" ? JSON.parse(dbRow.compliance_checklist) : dbRow.compliance_checklist,
          reference_proposal_ids: typeof dbRow.reference_proposal_ids === "string" ? JSON.parse(dbRow.reference_proposal_ids) : dbRow.reference_proposal_ids,
          created_at: dbRow.created_at,
          judge_score: dbRow.judge_score,
          judge_issues: typeof dbRow.judge_issues === "string" ? JSON.parse(dbRow.judge_issues) : dbRow.judge_issues,
        };
      }
    }

    if (!proposal) {
      return NextResponse.json({ success: false, error: "العرض التدريبي المولد غير موجود" }, { status: 404 });
    }

    // ACTION: update_content
    if (action === "update_content") {
      if (!draft_content) {
        return NextResponse.json({ success: false, error: "المحتوى المعدل مطلوب" }, { status: 400 });
      }

      const updatedContent = draft_content as ProposalContent;

      // Recalculate compliance score based on updated edits
      const { score: newScore, checklist: newChecklist } = calculateCompliance(proposal.rfp_data, updatedContent);

      if (!isDbConnected) {
        const updatedProposal = {
          ...proposal,
          draft_content: updatedContent,
          review_status: "in_review" as const,
          compliance_score: newScore,
          compliance_checklist: newChecklist,
        };
        memoryStore.generatedProposals.set(id, updatedProposal);
      } else {
        await query(
          tenantId,
          `UPDATE generated_proposals 
           SET draft_content = $1, review_status = 'in_review', compliance_score = $2, compliance_checklist = $3 
           WHERE id = $4`,
          [JSON.stringify(updatedContent), newScore, JSON.stringify(newChecklist), id]
        );
      }

      return NextResponse.json({
        success: true,
        message: "تم حفظ التعديلات وإعادة حساب درجة المطابقة بنجاح",
        data: { compliance_score: newScore, compliance_checklist: newChecklist },
      });
    }

    // ACTION: approve
    if (action === "approve") {
      const { complete, missingItems } = validateFinancialCompleteness(proposal.rfp_data, proposal.draft_content);
      if (!complete) {
        return NextResponse.json(
          { success: false, error: "لا يمكن اعتماد العرض قبل استكمال جميع البيانات المالية.", missing_items: missingItems },
          { status: 400 }
        );
      }

      const reviewerId = "00000000-0000-0000-0000-000000000002"; // dummy reviewer id

      if (!isDbConnected) {
        const updatedProposal = {
          ...proposal,
          review_status: "approved" as const,
          reviewer_id: reviewerId,
          reviewed_at: new Date().toISOString(),
        };
        memoryStore.generatedProposals.set(id, updatedProposal);
      } else {
        await query(
          tenantId,
          `UPDATE generated_proposals 
           SET review_status = 'approved', reviewer_id = $1, reviewed_at = NOW() 
           WHERE id = $2`,
          [reviewerId, id]
        );
      }

      return NextResponse.json({ success: true, message: "تم اعتماد العرض بنجاح" });
    }

    // ACTION: mark_exported
    if (action === "mark_exported") {
      if (!isDbConnected) {
        const updatedProposal = { ...proposal, review_status: "exported" as const };
        memoryStore.generatedProposals.set(id, updatedProposal);
      } else {
        await query(
          tenantId,
          "UPDATE generated_proposals SET review_status = 'exported' WHERE id = $1",
          [id]
        );
      }

      return NextResponse.json({ success: true, message: "تم وسم العرض كمصدّر بنجاح" });
    }

    // ACTION: mark_won or mark_lost (Learning Loop!)
    if (action === "mark_won" || action === "mark_lost") {
      const finalStatus = action === "mark_won" ? "won" : "lost";
      const compiledText = compileProposalText(proposal.draft_content);

      // Trigger memory distillation if proposal is won
      if (finalStatus === "won") {
        try {
          const guidelines = await distillClientGuidelines(proposal.rfp_data, proposal.draft_content);
          if (!isDbConnected) {
            console.log(`[Memory DB] Saved client guidelines for ${proposal.rfp_data.client_name}`);
          } else {
            await query(
              tenantId,
              `INSERT INTO tenant_client_guidelines (tenant_id, client_name, guidelines, updated_at)
               VALUES ($1, $2, $3, NOW())
               ON CONFLICT (tenant_id, client_name) 
               DO UPDATE SET guidelines = EXCLUDED.guidelines, updated_at = NOW()`,
              [tenantId, proposal.rfp_data.client_name, guidelines]
            );
            console.log(`[DB] Successfully distilled guidelines for client: ${proposal.rfp_data.client_name}`);
          }
        } catch (err) {
          console.error("Failed to distill client guidelines during mark_won:", err);
        }
      }

      let embedding: number[] = [];
      try {
        embedding = await getEmbedding(compiledText, {
          title: proposal.rfp_data.title,
          trainingType: proposal.rfp_data.training_type,
          sector: proposal.rfp_data.client_sector || undefined,
        });
      } catch (err) {
        console.error("Failed to generate embedding for learning loop:", err);
      }

      if (!isDbConnected) {
        // Save copy to proposals memory store
        const newRefProposal = {
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          rfp_title: proposal.rfp_data.title,
          training_type: proposal.rfp_data.training_type,
          sector: proposal.rfp_data.client_sector,
          content_text: compiledText,
          status: finalStatus as any,
          embedding: embedding,
          created_at: new Date().toISOString(),
        };
        memoryStore.proposals.set(newRefProposal.id, newRefProposal);
      } else {
        await executeIsolatedQuery(tenantId, async (client) => {
          if (!client) return;

          await client.query("BEGIN");
          try {
            // Check if it already exists as a reference
            const exists = await client.query(
              "SELECT id FROM proposals WHERE rfp_title = $1 AND tenant_id = $2",
              [proposal!.rfp_data.title, tenantId]
            );

            const vectorStr = `[${embedding.join(",")}]`;

            if (exists.rowCount !== null && exists.rowCount > 0) {
              // Update existing reference status
              await client.query(
                "UPDATE proposals SET status = $1, content_text = $2, embedding = $3::vector WHERE id = $4",
                [finalStatus, compiledText, vectorStr, exists.rows[0].id]
              );
            } else {
              // Insert new learning loop entry
              await client.query(
                `INSERT INTO proposals (tenant_id, rfp_title, training_type, sector, content_text, status, embedding, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::vector, NOW())`,
                [
                  tenantId,
                  proposal!.rfp_data.title,
                  proposal!.rfp_data.training_type,
                  proposal!.rfp_data.client_sector,
                  compiledText,
                  finalStatus,
                  vectorStr,
                ]
              );
            }
            await client.query("COMMIT");
          } catch (err) {
            await client.query("ROLLBACK");
            throw err;
          }
        });
      }

      return NextResponse.json({
        success: true,
        message: `تم تسجيل نفع العرض بنجاح ووسمه كـ (${action === "mark_won" ? "فائز" : "خاسر"}) في بنك المعلومات`,
      });
    }

    return NextResponse.json({ success: false, error: "الإجراء المطلوب غير معروف" }, { status: 400 });
  } catch (error: any) {
    console.error("Error modifying proposal:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

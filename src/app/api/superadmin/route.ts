import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, checkDbConnection, memoryStore } from "@/lib/db";
import { isMockMode } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const isDbConnected = !isMockMode() && (await checkDbConnection());

  if (!isDbConnected) {
    // Return mock statistics based on memoryStore values
    const tenantsCount = memoryStore.tenants.size || 3;
    const proposalsCount = memoryStore.generatedProposals.size || 24;
    const referencesCount = memoryStore.proposals.size || 18;
    
    const mockTenants = [
      {
        id: "a0000000-0000-0000-0000-000000000001",
        name: "معهد التميز للتدريب",
        license_number: "TVTC-12345",
        email: "info@excellence-training.sa",
        phone: "+966501234567",
        proposals_count: 14
      },
      {
        id: "a0000000-0000-0000-0000-000000000002",
        name: "أكاديمية المعرفة الرقمية",
        license_number: "TVTC-88990",
        email: "admin@knowledge-academy.sa",
        phone: "+966551122334",
        proposals_count: 8
      },
      {
        id: "a0000000-0000-0000-0000-000000000003",
        name: "معهد تطوير الكفاءات للغات",
        license_number: "TVTC-44552",
        email: "contact@skills-development.sa",
        phone: "+966567788990",
        proposals_count: 2
      }
    ];

    const mockRecent = Array.from(memoryStore.generatedProposals.values()).slice(0, 5).map(p => ({
      id: p.id,
      tenant_name: "معهد التميز للتدريب",
      title: p.rfp_data.title,
      compliance_score: p.compliance_score,
      judge_score: p.judge_score || 85,
      created_at: p.created_at
    }));

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          tenants_count: tenantsCount,
          proposals_count: proposalsCount,
          references_count: referencesCount,
          avg_judge_score: 87
        },
        tenants: mockTenants,
        recent_proposals: mockRecent
      }
    });
  }

  try {
    const defaultTenantId = "a0000000-0000-0000-0000-000000000001"; // Default schema resolver context

    // 1. Fetch system overall aggregations
    const tenantsRow = await queryOne<{ count: string }>(defaultTenantId, "SELECT COUNT(*) as count FROM tenants");
    const proposalsRow = await queryOne<{ count: string }>(defaultTenantId, "SELECT COUNT(*) as count FROM generated_proposals");
    const referencesRow = await queryOne<{ count: string }>(defaultTenantId, "SELECT COUNT(*) as count FROM proposals");
    const avgJudgeRow = await queryOne<{ avg: string }>(
      defaultTenantId, 
      "SELECT ROUND(AVG(judge_score)) as avg FROM generated_proposals WHERE judge_score IS NOT NULL"
    );

    // 2. Fetch tenant distributions
    const tenantsSql = `
      SELECT t.id, t.name, t.license_number, t.email, t.phone, COUNT(g.id) as proposals_count 
      FROM tenants t 
      LEFT JOIN generated_proposals g ON t.id = g.tenant_id 
      GROUP BY t.id, t.name, t.license_number, t.email, t.phone
      ORDER BY proposals_count DESC
    `;
    const tenantsList = await query<any>(defaultTenantId, tenantsSql);

    // 3. Fetch recent generations cross-tenant
    const recentSql = `
      SELECT g.id, t.name as tenant_name, g.rfp_data->>'title' as title, g.compliance_score, g.judge_score, g.created_at 
      FROM generated_proposals g 
      JOIN tenants t ON g.tenant_id = t.id 
      ORDER BY g.created_at DESC 
      LIMIT 10
    `;
    const recentList = await query<any>(defaultTenantId, recentSql);

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          tenants_count: tenantsRow ? parseInt(tenantsRow.count, 10) : 0,
          proposals_count: proposalsRow ? parseInt(proposalsRow.count, 10) : 0,
          references_count: referencesRow ? parseInt(referencesRow.count, 10) : 0,
          avg_judge_score: avgJudgeRow && avgJudgeRow.avg ? parseInt(avgJudgeRow.avg, 10) : 85
        },
        tenants: tenantsList,
        recent_proposals: recentList
      }
    });
  } catch (error: any) {
    console.error("Superadmin route failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

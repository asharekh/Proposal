import { NextRequest, NextResponse } from "next/server";
import { queryOne, query, executeIsolatedQuery, memoryStore, checkDbConnection } from "@/lib/db";
import { isMockMode, getTenantId } from "@/lib/config";

export const dynamic = "force-dynamic";

// GET profile
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenant_id") || getTenantId();

  const isDbConnected = !isMockMode() && (await checkDbConnection());

  if (!isDbConnected) {
    const tenant = memoryStore.tenants.get(tenantId);
    const profile = memoryStore.profiles.get(tenantId);
    return NextResponse.json({
      success: true,
      data: {
        ...tenant,
        writing_style: profile?.writing_style || "",
        fixed_terms: profile?.fixed_terms || {},
        pricing_ranges: profile?.pricing_ranges || [],
        specializations: profile?.specializations || [],
      },
    });
  }

  try {
    const tenant = await queryOne(
      tenantId,
      "SELECT id, name, name_en, logo_url, license_number, phone, email, address FROM tenants WHERE id = $1",
      [tenantId]
    );

    if (!tenant) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });
    }

    const profile = await queryOne(
      tenantId,
      "SELECT writing_style, fixed_terms, pricing_ranges, specializations FROM tenant_proposal_profiles WHERE tenant_id = $1",
      [tenantId]
    );

    return NextResponse.json({
      success: true,
      data: {
        ...tenant,
        writing_style: profile?.writing_style || "",
        fixed_terms: profile?.fixed_terms || {},
        pricing_ranges: profile?.pricing_ranges || [],
        specializations: profile?.specializations || [],
      },
    });
  } catch (error: any) {
    console.error("Error fetching tenant profile:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST upsert profile
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenant_id,
      name,
      name_en,
      license_number,
      phone,
      email,
      address,
      writing_style,
      specializations,
      fixed_terms,
    } = body;

    const tenantId = tenant_id || getTenantId();
    const isDbConnected = !isMockMode() && (await checkDbConnection());

    if (!isDbConnected) {
      // Update memory store
      const tenant = memoryStore.tenants.get(tenantId) || { id: tenantId, created_at: new Date().toISOString(), name: "" };
      const updatedTenant = {
        ...tenant,
        name: name || tenant.name,
        name_en,
        license_number,
        phone,
        email,
        address,
      };
      memoryStore.tenants.set(tenantId, updatedTenant);

      const profile = memoryStore.profiles.get(tenantId) || { tenant_id: tenantId, last_updated: new Date().toISOString() };
      const updatedProfile = {
        ...profile,
        writing_style,
        specializations: Array.isArray(specializations) ? specializations : [],
        fixed_terms: typeof fixed_terms === "object" ? fixed_terms : {},
        last_updated: new Date().toISOString(),
      };
      memoryStore.profiles.set(tenantId, updatedProfile);

      return NextResponse.json({ success: true, message: "تم حفظ الإعدادات في الذاكرة المؤقتة بنجاح" });
    }

    // Run DB transaction
    await executeIsolatedQuery(tenantId, async (client) => {
      if (!client) return;

      // Start transaction
      await client.query("BEGIN");
      try {
        // 1. Update tenants table
        await client.query(
          `UPDATE tenants 
           SET name = $1, name_en = $2, license_number = $3, phone = $4, email = $5, address = $6 
           WHERE id = $7`,
          [name, name_en, license_number, phone, email, address, tenantId]
        );

        // 2. Upsert profile table
        const profileExists = await client.query(
          "SELECT 1 FROM tenant_proposal_profiles WHERE tenant_id = $1",
          [tenantId]
        );

        if (profileExists.rowCount > 0) {
          await client.query(
            `UPDATE tenant_proposal_profiles 
             SET writing_style = $1, specializations = $2, fixed_terms = $3, last_updated = NOW() 
             WHERE tenant_id = $4`,
            [writing_style, specializations, JSON.stringify(fixed_terms), tenantId]
          );
        } else {
          await client.query(
            `INSERT INTO tenant_proposal_profiles (tenant_id, writing_style, specializations, fixed_terms, last_updated) 
             VALUES ($1, $2, $3, $4, NOW())`,
            [tenantId, writing_style, specializations, JSON.stringify(fixed_terms)]
          );
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    return NextResponse.json({ success: true, message: "تم تحديث إعدادات المعهد بنجاح في قاعدة البيانات" });
  } catch (error: any) {
    console.error("Error updating tenant profile:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

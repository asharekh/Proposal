import { Pool, PoolClient } from "pg";
import { getEnv } from "./env";
import { isMockMode } from "./config";
import { Proposal, GeneratedProposal, Tenant } from "../types";

let pool: Pool | null = null;

const getPool = (): Pool => {
  if (pool) return pool;
  
  const env = getEnv();
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });

  pool.on("error", (err) => {
    console.error("Unexpected database pool error:", err);
  });

  return pool;
};

// In-memory fallback database for Mock Mode
class MemoryDB {
  tenants: Map<string, Tenant> = new Map([
    [
      "a0000000-0000-0000-0000-000000000001",
      {
        id: "a0000000-0000-0000-0000-000000000001",
        name: "معهد التميز للتدريب",
        license_number: "TVTC-12345",
        phone: "+966501234567",
        email: "info@excellence-training.sa",
        address: "الرياض، المملكة العربية السعودية",
        created_at: new Date().toISOString(),
      },
    ],
  ]);

  profiles: Map<string, any> = new Map([
    [
      "a0000000-0000-0000-0000-000000000001",
      {
        tenant_id: "a0000000-0000-0000-0000-000000000001",
        writing_style: "أسلوب رسمي مهني مع التركيز على الجانب العملي والواقعي وتطبيق الحالات العملية السعودية.",
        fixed_terms: {
          payment: "دفع 50% مقدم و50% بعد انتهاء التدريب وتسليم التقرير الختامي.",
          certificates: "تُمنح الشهادات فقط للحضور الذين تتجاوز نسبة حضورهم 80%.",
        },
        pricing_ranges: [
          { min_trainees: 1, max_trainees: 10, price_per_day: 5000 },
          { min_trainees: 11, max_trainees: 25, price_per_day: 8000 },
        ],
        specializations: ["القيادة والإدارة", "الأمن السيبراني", "تحليل البيانات", "الموارد البشرية"],
        last_updated: new Date().toISOString(),
      },
    ],
  ]);

  proposals: Map<string, Proposal> = new Map([
    [
      "ref-1",
      {
        id: "ref-1",
        tenant_id: "a0000000-0000-0000-0000-000000000001",
        rfp_title: "برنامج تطوير القادة التنفيذيين في وزارة الطاقة",
        training_type: "قيادة",
        sector: "حكومي",
        status: "won",
        content_text: "منهجية المعهد في تطوير القادة تعتمد على نموذج كوتر للتغيير والتركيز على المحاكاة القيادية وإدارة المبادرات الاستراتيجية الوطنية وفق رؤية المملكة 2030.",
        embedding: Array(1536).fill(0.01),
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      }
    ]
  ]);

  generatedProposals: Map<string, GeneratedProposal> = new Map([
    [
      "gen-1",
      {
        id: "gen-1",
        tenant_id: "a0000000-0000-0000-0000-000000000001",
        rfp_data: {
          title: "دورة الذكاء الاصطناعي وتطبيقاته في قطاع الطاقة",
          client_name: "شركة أرامكو السعودية",
          client_contact: "م. فهد السديري",
          budget: 75000,
          training_type: "قيادة",
          preferred_language: "العربية",
          trainees_count: 15,
          proposal_type: "combined"
        },
        draft_content: {
          executive_summary: "نهدف في هذا البرنامج إلى تزويد القادة التنفيذيين في قطاع الطاقة بالمعارف والمهارات اللازمة لتبني تقنيات الذكاء الاصطناعي وحوكمتها لرفع كفاءة الإنتاج وتقليل الانبعاثات الكربونية.",
          about_institute: "معهد التميز للتدريب هو معهد رائد مرخص من المؤسسة العامة للتدريب التقني والمهني برقم TVTC-12345.",
          methodology: {
            approach: "منهجية تفاعلية تعتمد على دراسة الحالات العملية وورش العمل التفاعلية.",
            phases: [
              {
                number: 1,
                title: "التحضير والتقييم القبلي",
                description: "فهم الاحتياجات التدريبية وتصميم الحالات التطبيقية.",
                duration: "أسبوع واحد",
                objectives: ["تحديد الفجوات المعرفية", "مواءمة المحتوى"]
              }
            ],
            tools_and_resources: ["حقيبة تدريبية متكاملة", "منصة كورسيت للتعليم المدمج"]
          },
          timeline: [
            { "week": "الأسبوع الأول", "activity": "أساسيات الذكاء الاصطناعي في الطاقة" }
          ],
          financial: {
            breakdown: [
              { "item": "البرنامج التدريبي الشامل", "quantity": 1, "unit_price": 75000, "total": 75000 }
            ],
            total_before_vat: 75000,
            vat_amount: 11250,
            total_after_vat: 86250,
            payment_terms: "دفع 50% مقدم و50% بعد انتهاء التدريب وتسليم التقرير الختامي.",
            validity_days: 30
          },
          terms_and_conditions: "تُمنح الشهادات فقط للحضور الذين تتجاوز نسبة حضورهم 80%."
        },
        review_status: "draft",
        compliance_score: 95,
        compliance_checklist: [
          { "requirement": "اللغة العربية", "covered": true }
        ],
        reference_proposal_ids: ["ref-1"],
        created_at: new Date().toISOString()
      }
    ]
  ]);
}

const globalForMemoryDb = globalThis as unknown as { memoryStore: MemoryDB };
export const memoryStore = globalForMemoryDb.memoryStore || new MemoryDB();
if (process.env.NODE_ENV !== "production") globalForMemoryDb.memoryStore = memoryStore;

// Helper to check if DB is connected
export const checkDbConnection = async (): Promise<boolean> => {
  if (isMockMode()) return true;
  try {
    const dbPool = getPool();
    const client = await dbPool.connect();
    client.release();
    return true;
  } catch (e) {
    console.warn("⚠️ Database connection failed. Running database in mock mode. Error:", e);
    return false;
  }
};

/**
 * Execute a query with tenant isolation context
 */
export const executeIsolatedQuery = async <T>(
  tenantId: string,
  queryFn: (client: PoolClient | null) => Promise<T>
): Promise<T> => {
  const isDbAvailable = !isMockMode() && (await checkDbConnection());

  if (!isDbAvailable) {
    // Return operation on memory store (handled client side or via router stubs)
    return queryFn(null);
  }

  const dbPool = getPool();
  const client = await dbPool.connect();
  try {
    // Set tenant isolation context
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    return await queryFn(client);
  } finally {
    client.release();
  }
};

/**
 * Standard query helper with tenant isolation
 */
export const query = async <T = any>(
  tenantId: string,
  sqlText: string,
  params: any[] = []
): Promise<T[]> => {
  return executeIsolatedQuery(tenantId, async (client) => {
    if (!client) {
      // Mock parsing query logic for simple select cases or return empty
      console.log(`[Mock DB Query] Tenant: ${tenantId} | SQL: ${sqlText}`);
      
      // Simple mock route handlers:
      if (sqlText.toLowerCase().includes("select * from tenants") || sqlText.toLowerCase().includes("select id, name")) {
        const tenant = memoryStore.tenants.get(tenantId);
        return tenant ? [tenant] : [];
      }
      
      if (sqlText.toLowerCase().includes("select * from tenant_proposal_profiles")) {
        const profile = memoryStore.profiles.get(tenantId);
        return profile ? [profile] : [];
      }
      
      if (sqlText.toLowerCase().includes("from proposals")) {
        const proposalsList = Array.from(memoryStore.proposals.values()).filter(p => p.tenant_id === tenantId);
        return proposalsList;
      }
      
      if (sqlText.toLowerCase().includes("from generated_proposals")) {
        const list = Array.from(memoryStore.generatedProposals.values()).filter(p => p.tenant_id === tenantId);
        // If sorting
        return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
      }

      return [];
    }
    const res = await client.query(sqlText, params);
    return res.rows;
  });
};

/**
 * Standard queryOne helper with tenant isolation
 */
export const queryOne = async <T = any>(
  tenantId: string,
  sqlText: string,
  params: any[] = []
): Promise<T | null> => {
  const rows = await query<T>(tenantId, sqlText, params);
  return rows.length > 0 ? rows[0] : null;
};

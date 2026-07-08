"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Shield, 
  Users, 
  FileText, 
  Sparkles, 
  Building, 
  TrendingUp, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle,
  ExternalLink,
  Phone,
  Mail
} from "lucide-react";

export default function SuperadminDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/superadmin");
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      } catch (error) {
        console.error("Failed to load superadmin metrics:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
        <p className="text-sm text-gray-500 font-bold">جاري تحميل بيانات النظام والإحصائيات العامة...</p>
      </div>
    );
  }

  const stats = data?.stats || { tenants_count: 0, proposals_count: 0, references_count: 0, avg_judge_score: 0 };
  const tenants = data?.tenants || [];
  const recentProposals = data?.recent_proposals || [];

  return (
    <div className="space-y-8 animate-fade-in text-right" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-gray-100 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-green-600" />
            <h1 className="text-2xl font-bold text-gray-900">إدارة النظام (Superadmin Console)</h1>
          </div>
          <p className="text-sm text-gray-500 font-medium">مرحباً بك عبدالعزيز. نظرة شاملة على مؤشرات الأداء، المشتركين، وجودة توليد العقود التدريبية.</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="premium-card p-6 bg-white flex items-center justify-between border border-gray-150 rounded-2xl shadow-sm">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase">المعاهد المشتركة (Tenants)</p>
            <h3 className="text-3xl font-extrabold text-gray-900 mt-2">{stats.tenants_count}</h3>
          </div>
          <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl">
            <Building className="w-6 h-6" />
          </div>
        </div>

        <div className="premium-card p-6 bg-white flex items-center justify-between border border-gray-150 rounded-2xl shadow-sm">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase">إجمالي العروض التدريبية</p>
            <h3 className="text-3xl font-extrabold text-gray-900 mt-2">{stats.proposals_count}</h3>
          </div>
          <div className="p-3.5 bg-green-50 text-green-600 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="premium-card p-6 bg-white flex items-center justify-between border border-gray-150 rounded-2xl shadow-sm">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase">متوسط جودة المقيم (AI Judge)</p>
            <h3 className="text-3xl font-extrabold text-emerald-600 mt-2">{stats.avg_judge_score}%</h3>
          </div>
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="premium-card p-6 bg-white flex items-center justify-between border border-gray-150 rounded-2xl shadow-sm">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase">عروض مرجعية مخزنة (RAG)</p>
            <h3 className="text-3xl font-extrabold text-gray-900 mt-2">{stats.references_count}</h3>
          </div>
          <div className="p-3.5 bg-purple-50 text-purple-600 rounded-xl">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Tenants Management (2/3 Width) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-150 rounded-2xl p-6 shadow-sm">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
              <h3 className="font-bold text-gray-900 text-sm">مزودي خدمات التدريب (SaaS Tenants)</h3>
              <span className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md">إجمالي: {tenants.length}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 font-bold border-b border-gray-100">
                    <th className="p-3">اسم المنشأة / المعهد</th>
                    <th className="p-3 text-center">رقم ترخيص المؤسسة</th>
                    <th className="p-3 text-center">معلومات الاتصال</th>
                    <th className="p-3 text-center">العروض المولدة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {tenants.map((tenant: any) => (
                    <tr key={tenant.id} className="hover:bg-gray-50/50">
                      <td className="p-3 text-gray-900 font-bold">{tenant.name}</td>
                      <td className="p-3 text-center text-gray-600 font-mono">{tenant.license_number || "—"}</td>
                      <td className="p-3 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-0.5 text-[10px]">
                          {tenant.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-2.5 h-2.5" /> {tenant.phone}
                            </span>
                          )}
                          {tenant.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-2.5 h-2.5" /> {tenant.email}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center font-extrabold text-green-700 text-sm">{tenant.proposals_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Recent Generations + LLM Judge Output (1/3 Width) */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-900 text-sm border-b border-gray-100 pb-2">عمليات التوليد والتقييم الأخيرة</h3>

            <div className="space-y-3.5 divide-y divide-gray-100 text-xs">
              {recentProposals.map((prop: any, idx: number) => (
                <div key={prop.id} className={`pt-3 first:pt-0 space-y-1.5`}>
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-gray-950 font-bold truncate block max-w-[160px]">{prop.title}</span>
                    <Link
                      href={`/proposals/${prop.id}`}
                      className="text-green-600 hover:text-green-700 flex items-center gap-0.5 hover:underline flex-shrink-0"
                    >
                      <span>عرض</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-gray-400">
                    <span>بواسطة: {prop.tenant_name}</span>
                    <span>{new Date(prop.created_at).toLocaleDateString("ar-SA")}</span>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <span className="bg-blue-50 text-blue-700 border border-blue-100 text-[9px] px-2 py-0.5 rounded-full font-bold">
                      مطابقة الكراسة: {prop.compliance_score}%
                    </span>
                    {prop.judge_score !== null ? (
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
                        prop.judge_score >= 80 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                          : "bg-amber-50 text-amber-700 border-amber-100"
                      }`}>
                        مقيم الجودة: {prop.judge_score}%
                      </span>
                    ) : (
                      <span className="bg-gray-50 text-gray-500 border border-gray-100 text-[9px] px-2 py-0.5 rounded-full font-bold">
                        لم يتم تقييمه
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {recentProposals.length === 0 && (
                <p className="text-center text-gray-400 py-6">لا توجد مقترحات مولدة مؤخراً.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

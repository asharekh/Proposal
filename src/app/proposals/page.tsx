"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  FileText, 
  ArrowLeft, 
  Sparkles, 
  Download, 
  FileOutput, 
  Calendar, 
  Activity, 
  CheckCircle,
  HelpCircle,
  FileDown
} from "lucide-react";

export default function ProposalsList() {
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");

  const loadProposals = async () => {
    setLoading(true);
    try {
      const url = activeTab === "all" ? "/api/proposals" : `/api/proposals?status=${activeTab}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setProposals(json.data || []);
      }
    } catch (err) {
      console.error("Failed to load proposals list:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProposals();
  }, [activeTab]);

  const tabs = [
    { id: "all", name: "الكل" },
    { id: "draft", name: "مسودات" },
    { id: "in_review", name: "قيد المراجعة" },
    { id: "approved", name: "معتمدة" },
    { id: "exported", name: "مُصدَّرة" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">العروض التدريبية المولّدة</h1>
          <p className="text-sm text-gray-500">إدارة ومراجعة وتصدير العروض الفنية والمالية التي تم إنشاؤها.</p>
        </div>
        <Link 
          href="/requests/new"
          className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg shadow flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>توليد عرض جديد</span>
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3.5 border-b-2 font-semibold text-sm transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "border-green-600 text-green-700 font-bold"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="premium-card bg-white p-6 space-y-4 animate-pulse">
              <div className="h-4 w-32 bg-gray-200 rounded"></div>
              <div className="h-6 w-48 bg-gray-200 rounded"></div>
              <div className="h-3 w-full bg-gray-100 rounded"></div>
              <div className="h-8 w-full bg-gray-200 rounded-lg"></div>
            </div>
          ))}
        </div>
      ) : proposals.length === 0 ? (
        <div className="premium-card bg-white p-12 text-center text-gray-500">
          <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm">لا توجد عروض في هذا القسم حالياً.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {proposals.map((proposal) => {
            const statusMap: any = {
              draft: { text: "مسودة", bg: "bg-gray-100 text-gray-700 border-gray-200" },
              in_review: { text: "قيد المراجعة", bg: "bg-blue-50 text-blue-700 border-blue-200" },
              approved: { text: "معتمد", bg: "bg-green-50 text-green-700 border-green-200" },
              exported: { text: "مُصدَّر", bg: "bg-purple-50 text-purple-700 border-purple-200" },
            };
            const status = statusMap[proposal.review_status] || { text: proposal.review_status, bg: "bg-gray-50 text-gray-600 border-gray-100" };

            const typeMap: any = {
              technical: "فني فقط",
              financial: "مالي فقط",
              combined: "فني ومالي",
            };

            const isApproved = proposal.review_status === "approved" || proposal.review_status === "exported";
            const safeTitle = proposal.rfp_title ? proposal.rfp_title.replace(/[\s/\\?%*:|"<>\s]+/g, "_") : "Proposal";
            const safeClient = proposal.client_name ? proposal.client_name.replace(/[\s/\\?%*:|"<>\s]+/g, "_") : "";
            const downloadFileName = `عرض_تدريب_${safeTitle}${safeClient ? `_${safeClient}` : ""}`;

            return (
              <div key={proposal.id} className="premium-card bg-white p-6 flex flex-col justify-between space-y-6">
                
                {/* Header Row */}
                <div className="space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <span className={`inline-block px-2.5 py-0.5 border text-xs font-semibold rounded-full ${status.bg}`}>
                      {status.text}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                      {typeMap[proposal.proposal_type] || proposal.proposal_type}
                    </span>
                  </div>
                  
                  <h3 className="font-bold text-gray-900 text-base leading-snug line-clamp-2">
                    {proposal.rfp_title}
                  </h3>
                  <p className="text-xs text-gray-500">{proposal.client_name}</p>
                </div>

                {/* Info row */}
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  {/* Compliance Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-gray-600">
                      <span>نسبة المطابقة:</span>
                      <span className={`${
                        proposal.compliance_score >= 80 ? "text-green-700" : proposal.compliance_score >= 60 ? "text-yellow-600" : "text-red-600"
                      }`}>{proposal.compliance_score}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          proposal.compliance_score >= 80 ? "bg-green-600" : proposal.compliance_score >= 60 ? "bg-yellow-500" : "bg-red-500"
                        }`}
                        style={{ width: `${proposal.compliance_score}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>تاريخ التوليد: {new Date(proposal.created_at).toLocaleDateString("ar-SA")}</span>
                  </div>
                </div>

                {/* Actions row */}
                <div className="pt-4 border-t border-gray-100 flex gap-2">
                  <Link 
                    href={`/proposals/${proposal.id}`}
                    className="flex-1 text-center py-2 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-bold rounded-lg transition-colors border border-green-200"
                  >
                    مراجعة وتعديل
                  </Link>

                  {isApproved && (
                    <div className="flex gap-1.5 no-print">
                      {/* Word Export Button */}
                      <a 
                        href={`/api/export?id=${proposal.id}&format=docx`}
                        download={`${downloadFileName}.docx`}
                        title="تصدير كملف Word"
                        className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded-lg transition-all"
                      >
                        <FileDown className="w-4 h-4" />
                      </a>

                      {/* PowerPoint Export Button */}
                      <a 
                        href={`/api/export?id=${proposal.id}&format=pptx`}
                        download={`${downloadFileName}.pptx`}
                        title="تصدير كعرض PowerPoint"
                        className="p-2 bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all"
                      >
                        <FileOutput className="w-4 h-4" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

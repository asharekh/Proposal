"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  FileText, 
  ArrowRight, 
  CheckCircle, 
  FileDown, 
  FileOutput, 
  Printer, 
  Sparkles, 
  Loader2, 
  Edit3, 
  Check, 
  X, 
  DollarSign,
  AlertTriangle,
  Trophy,
  XCircle,
  Plus,
  Trash2
} from "lucide-react";
import { ProposalContent, GeneratedProposal, ComplianceItem, Phase, TimelineItem } from "@/types";

export default function ProposalReview({ params }: { params: { id: string } }) {
  const { id } = params;
  const [proposal, setProposal] = useState<GeneratedProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"content" | "compliance">("content");
  
  // Editing state
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [tempText, setTempText] = useState("");
  const [savingSection, setSavingSection] = useState(false);

  // Financial Editing State
  const [isEditingFinancial, setIsEditingFinancial] = useState(false);
  const [financialRows, setFinancialRows] = useState<any[]>([]);
  const [paymentTerms, setPaymentTerms] = useState("");
  const [validityDays, setValidityDays] = useState(30);

  // Status updates state
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  // AI generation retry state
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationStep, setGenerationStep] = useState(0);

  const loadingMessages = [
    "جاري استدعاء تفاصيل الطلب وتأمين البيانات...",
    "جاري استرجاع عينات الحقائب والمقترحات المماثلة (RAG)...",
    "جاري صياغة وكتابة العرض التدريبي بالذكاء الاصطناعي (Gemini)...",
    "جاري حساب درجة المطابقة وتحديث قائمة التحقق...",
    "اكتملت صياغة العرض التدريبي بنجاح!"
  ];

  const triggerAIGeneration = async () => {
    setGenerating(true);
    setGenerationError(null);
    setGenerationStep(0);

    const interval = setInterval(() => {
      setGenerationStep((prev) => {
        if (prev < 3) return prev + 1;
        return prev;
      });
    }, 4500);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_id: id }),
      });

      clearInterval(interval);
      const json = await res.json();

      if (json.success) {
        setGenerationStep(4);
        setTimeout(() => {
          setGenerating(false);
          fetchProposal(); // Refresh proposal data
        }, 1200);
      } else {
        setGenerationError(json.error || "فشل توليد العرض بالذكاء الاصطناعي.");
        setGenerating(false);
        alert(json.error || "فشل توليد العرض بالذكاء الاصطناعي.");
      }
    } catch (err) {
      clearInterval(interval);
      setGenerationError("حدث خطأ أثناء الاتصال بالخادم.");
      setGenerating(false);
      alert("حدث خطأ أثناء الاتصال بالخادم.");
    }
  };

  const fetchProposal = async () => {
    try {
      const res = await fetch(`/api/proposals/${id}`);
      const json = await res.json();
      if (json.success && json.data) {
        setProposal(json.data);
        if (json.data.draft_content?.financial?.breakdown) {
          setFinancialRows(json.data.draft_content.financial.breakdown);
          setPaymentTerms(json.data.draft_content.financial.payment_terms || "");
          setValidityDays(json.data.draft_content.financial.validity_days || 30);
        }
      }
    } catch (err) {
      console.error("Failed to load proposal details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposal();
  }, [id]);

  // Handle section text update (Executive Summary, About, Approach, Terms)
  const startEditing = (sectionKey: string, text: string) => {
    setEditingSection(sectionKey);
    setTempText(text);
  };

  const cancelEditing = () => {
    setEditingSection(null);
    setTempText("");
  };

  const saveTextSection = async (sectionKey: string) => {
    if (!proposal) return;
    setSavingSection(true);

    const updatedContent = { ...proposal.draft_content };

    if (sectionKey === "executive_summary") {
      updatedContent.executive_summary = tempText;
    } else if (sectionKey === "about_institute") {
      updatedContent.about_institute = tempText;
    } else if (sectionKey === "methodology.approach") {
      updatedContent.methodology.approach = tempText;
    } else if (sectionKey === "terms_and_conditions") {
      updatedContent.terms_and_conditions = tempText;
    }

    try {
      const res = await fetch("/api/proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: proposal.id,
          action: "update_content",
          draft_content: updatedContent,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setProposal((prev: any) => ({
          ...prev,
          draft_content: updatedContent,
          compliance_score: json.data.compliance_score,
          compliance_checklist: json.data.compliance_checklist,
          review_status: "in_review",
        }));
        setEditingSection(null);
      } else {
        alert(json.error || "فشل حفظ التعديلات.");
      }
    } catch (err) {
      alert("حدث خطأ أثناء حفظ التعديلات.");
    } finally {
      setSavingSection(false);
    }
  };

  // Financial Table handlers
  const handleFinancialCellChange = (index: number, field: string, value: any) => {
    const rows = [...financialRows];
    
    if (field === "quantity") {
      const qty = parseInt(value, 10) || 0;
      rows[index].quantity = qty;
      if (rows[index].unit_price !== null) {
        rows[index].total = qty * rows[index].unit_price;
      }
    } else if (field === "unit_price") {
      const price = value === "" ? null : parseFloat(value);
      rows[index].unit_price = price;
      if (price !== null) {
        rows[index].total = (rows[index].quantity || 0) * price;
      } else {
        rows[index].total = null;
      }
    } else {
      rows[index][field] = value;
    }
    setFinancialRows(rows);
  };

  const addFinancialRow = () => {
    setFinancialRows(prev => [
      ...prev,
      { item: "بند تدريبي جديد...", quantity: 1, unit_price: null, total: null }
    ]);
  };

  const removeFinancialRow = (index: number) => {
    setFinancialRows(prev => prev.filter((_, i) => i !== index));
  };

  const saveFinancialSection = async () => {
    if (!proposal) return;
    setSavingSection(true);

    // Calculate totals
    let totalBeforeVat: number | null = 0;
    let isAnyNull = false;

    financialRows.forEach((row) => {
      if (row.total === null) {
        isAnyNull = true;
      } else {
        totalBeforeVat = (totalBeforeVat || 0) + row.total;
      }
    });

    if (isAnyNull) {
      totalBeforeVat = null;
    }

    const vatAmount = totalBeforeVat !== null ? Math.round(totalBeforeVat * 0.15) : null;
    const totalAfterVat = totalBeforeVat !== null && vatAmount !== null ? totalBeforeVat + vatAmount : null;

    const updatedContent = {
      ...proposal.draft_content,
      financial: {
        breakdown: financialRows,
        total_before_vat: totalBeforeVat,
        vat_amount: vatAmount,
        total_after_vat: totalAfterVat,
        payment_terms: paymentTerms,
        validity_days: Number(validityDays),
      }
    };

    try {
      const res = await fetch("/api/proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: proposal.id,
          action: "update_content",
          draft_content: updatedContent,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setProposal((prev: any) => ({
          ...prev,
          draft_content: updatedContent,
          compliance_score: json.data.compliance_score,
          compliance_checklist: json.data.compliance_checklist,
          review_status: "in_review",
        }));
        setIsEditingFinancial(false);
      } else {
        alert(json.error || "فشل حفظ العرض المالي.");
      }
    } catch (err) {
      alert("حدث خطأ أثناء حفظ الجدول المالي.");
    } finally {
      setSavingSection(false);
    }
  };

  // Action status changes: approve, mark_won, mark_lost
  const updateProposalStatus = async (action: "approve" | "mark_won" | "mark_lost") => {
    if (!proposal) return;
    setUpdatingStatus(action);

    try {
      const res = await fetch("/api/proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: proposal.id,
          action: action,
        }),
      });

      const json = await res.json();
      if (json.success) {
        alert(json.message);
        fetchProposal(); // Refresh UI data
      } else {
        alert(json.error || "فشل تنفيذ الإجراء.");
      }
    } catch (err) {
      alert("حدث خطأ في الاتصال بالخادم.");
    } finally {
      setUpdatingStatus(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-green-600" />
        <p className="text-sm text-gray-500">جاري تحميل وثيقة العرض وتفاصيل المطابقة...</p>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="premium-card bg-white p-12 text-center text-gray-500 max-w-lg mx-auto">
        <AlertTriangle className="w-12 h-12 mx-auto text-red-500 mb-3" />
        <h3 className="font-bold text-gray-800 text-base">لم يتم العثور على العرض</h3>
        <p className="text-sm mt-1">المعرف المطلوب غير صحيح أو لا ينتمي لهذا المعهد.</p>
        <Link href="/proposals" className="text-green-600 font-semibold hover:underline mt-4 inline-block">
          عودة لقائمة العروض
        </Link>
      </div>
    );
  }

  const rfp = proposal.rfp_data;
  const content = proposal.draft_content;
  const isApproved = proposal.review_status === "approved" || proposal.review_status === "exported";
  const isContentEmpty = !content || (!content.executive_summary && !content.about_institute);

  return (
    <div className="space-y-8 animate-fade-in relative">
      {/* Back link */}
      <Link href="/proposals" className="text-xs font-semibold text-gray-500 hover:text-gray-900 flex items-center gap-1.5 no-print">
        <ArrowRight className="w-4 h-4" />
        <span>العودة لقائمة العروض التدريبية</span>
      </Link>

      {/* Header Panel */}
      <div className="premium-card bg-white p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 text-xs font-semibold border rounded-full ${
              proposal.review_status === "draft" ? "bg-gray-100 text-gray-700" :
              proposal.review_status === "in_review" ? "bg-blue-50 text-blue-700 border-blue-200" :
              proposal.review_status === "approved" ? "bg-green-50 text-green-700 border-green-200" :
              "bg-purple-50 text-purple-700 border-purple-200"
            }`}>
              {proposal.review_status === "draft" ? "مسودة" :
               proposal.review_status === "in_review" ? "قيد المراجعة" :
               proposal.review_status === "approved" ? "معتمد" : "مُصدَّر"}
            </span>
            <span className="text-xs text-gray-400 font-semibold bg-gray-50 px-2.5 py-0.5 border rounded">
              {rfp.proposal_type === "technical" ? "عرض فني فقط" : rfp.proposal_type === "financial" ? "عرض مالي فقط" : "فني ومالي متكامل"}
            </span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 leading-snug">{rfp.title}</h1>
          <p className="text-xs text-gray-500 font-semibold">موجّه إلى: {rfp.client_name} ({rfp.client_sector || "غير محدد"})</p>
        </div>

        {/* Action controls */}
        <div className="flex flex-wrap gap-2.5 no-print">
          {/* Approve button */}
          {proposal.review_status !== "approved" && proposal.review_status !== "exported" && (
            <button
              onClick={() => updateProposalStatus("approve")}
              disabled={updatingStatus !== null}
              className="px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {updatingStatus === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              <span>اعتماد العرض</span>
            </button>
          )}

          {/* Regenerate AI Button */}
          {proposal.review_status !== "approved" && proposal.review_status !== "exported" && !generating && (
            <button
              onClick={triggerAIGeneration}
              className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
              title="إعادة تشغيل الذكاء الاصطناعي لتوليد محتوى جديد للطلب"
            >
              <Sparkles className="w-4 h-4 text-blue-600 animate-pulse" />
              <span>إعادة توليد بالذكاء الاصطناعي</span>
            </button>
          )}

          {/* Export options (Unlock once approved) */}
          {isApproved ? (
            <div className="flex gap-2 border-l border-gray-100 pl-3">
              {/* Word */}
              <a
                href={`/api/export?id=${proposal.id}&format=docx`}
                download={`Proposal_${proposal.id}.docx`}
                className="px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
              >
                <FileDown className="w-4 h-4" />
                <span>Word (.docx)</span>
              </a>

              {/* PPT */}
              <a
                href={`/api/export?id=${proposal.id}&format=pptx`}
                download={`Presentation_${proposal.id}.pptx`}
                className="px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
              >
                <FileOutput className="w-4 h-4" />
                <span>PowerPoint (.pptx)</span>
              </a>

              {/* PDF */}
              <a
                href={`/api/export?id=${proposal.id}&format=pdf`}
                target="_blank"
                className="px-3.5 py-2.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة / تصدير PDF</span>
              </a>
            </div>
          ) : (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2.5 rounded-lg flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="w-4 h-4" />
              <span>قم باعتماد العرض أولاً لتفعيل خيارات التصدير (Word, PPT, PDF).</span>
            </div>
          )}

          {/* Learning Loop Feedbacks */}
          {isApproved && (
            <div className="flex gap-2">
              <button
                onClick={() => updateProposalStatus("mark_won")}
                disabled={updatingStatus !== null}
                className="px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-bold border border-green-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                title="تسجيل العرض كفائز لتضمينه كعرض مرجعي في المستقبل"
              >
                <Trophy className="w-4 h-4" />
                <span>فاز العرض</span>
              </button>
              <button
                onClick={() => updateProposalStatus("mark_lost")}
                disabled={updatingStatus !== null}
                className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold border border-red-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                title="تسجيل العرض كخاسر للتعلم منه"
              >
                <XCircle className="w-4 h-4" />
                <span>خسر العرض</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* RIGHT COLUMN: MAIN CONTENT & ACTIONS (3/4 Width) */}
        <div className="lg:col-span-3 space-y-8">
          
          {/* Warning Banner if empty */}
          {(!content || (!content.executive_summary && !content.about_institute)) && (
            <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-800 text-sm">محتوى العرض التدريبي فارغ</h4>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    تم حفظ بيانات طلب التدريب بنجاح، ولكن لم يتم توليد المحتوى بالذكاء الاصطناعي بعد (أو فشلت المحاولة السابقة). اضغط على الزر لتوليد العرض بالكامل تلقائياً.
                  </p>
                </div>
              </div>
              <button
                onClick={triggerAIGeneration}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow flex items-center justify-center gap-1.5 transition-colors cursor-pointer self-start md:self-auto"
              >
                <Sparkles className="w-4 h-4" />
                <span>توليد العرض بالذكاء الاصطناعي</span>
              </button>
            </div>
          )}

          {/* Tabs list & Compliance score bar */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 border-b border-gray-200 pb-px">
            {/* Tabs */}
            <div className="flex gap-6 no-print">
              <button
                onClick={() => setActiveTab("content")}
                className={`py-3.5 border-b-2 font-bold text-sm transition-all cursor-pointer ${
                  activeTab === "content" ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                محتوى العرض التدريبي
              </button>
              <button
                onClick={() => setActiveTab("compliance")}
                className={`py-3.5 border-b-2 font-bold text-sm transition-all cursor-pointer ${
                  activeTab === "compliance" ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                قائمة مطابقة الكراسة ({proposal.compliance_checklist.length})
              </button>
            </div>

            {/* Compliance Meter */}
            <div className="flex items-center gap-3 bg-white px-4 py-2 border border-gray-100 rounded-xl max-w-xs shadow-sm">
              <span className="text-xs font-bold text-gray-500">معدل المطابقة:</span>
              <div className="w-24 bg-gray-100 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${
                    proposal.compliance_score >= 80 ? "bg-green-600" : proposal.compliance_score >= 60 ? "bg-yellow-500" : "bg-red-500"
                  }`}
                  style={{ width: `${proposal.compliance_score}%` }}
                ></div>
              </div>
              <span className={`text-sm font-bold ${
                proposal.compliance_score >= 80 ? "text-green-700" : proposal.compliance_score >= 60 ? "text-yellow-600" : "text-red-600"
              }`}>
                {proposal.compliance_score}%
              </span>
            </div>
          </div>

          {/* TAB 1: Proposal Content */}
          {activeTab === "content" && (
            <div className="space-y-8">
              
              {/* Section 1: Executive Summary */}
              <div className="premium-card bg-white p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                  <h2 className="text-base font-bold text-gray-900">1. الملخص التنفيذي</h2>
                  {editingSection !== "executive_summary" ? (
                    <button
                      onClick={() => startEditing("executive_summary", content.executive_summary || "")}
                      className="text-xs font-bold text-green-600 hover:text-green-700 flex items-center gap-1 hover:underline"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                  ) : null}
                </div>

                {editingSection === "executive_summary" ? (
                  <div className="space-y-3">
                    <textarea
                      rows={6}
                      value={tempText}
                      onChange={(e) => setTempText(e.target.value)}
                      className="w-full text-sm p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-green-500 leading-relaxed"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveTextSection("executive_summary")}
                        disabled={savingSection}
                        className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded flex items-center gap-1.5"
                      >
                        {savingSection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>حفظ</span>
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="px-4 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {content.executive_summary || "لا يوجد محتوى. يرجى توليد العرض."}
                  </p>
                )}
              </div>

              {/* Section 2: About Institute */}
              <div className="premium-card bg-white p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                  <h2 className="text-base font-bold text-gray-900">2. نبذة عن المعهد</h2>
                  {editingSection !== "about_institute" ? (
                    <button
                      onClick={() => startEditing("about_institute", content.about_institute || "")}
                      className="text-xs font-bold text-green-600 hover:text-green-700 flex items-center gap-1 hover:underline"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                  ) : null}
                </div>

                {editingSection === "about_institute" ? (
                  <div className="space-y-3">
                    <textarea
                      rows={5}
                      value={tempText}
                      onChange={(e) => setTempText(e.target.value)}
                      className="w-full text-sm p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-green-500 leading-relaxed"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveTextSection("about_institute")}
                        disabled={savingSection}
                        className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded flex items-center gap-1.5"
                      >
                        {savingSection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>حفظ</span>
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="px-4 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {content.about_institute || "لا يوجد محتوى. يرجى توليد العرض."}
                  </p>
                )}
              </div>

              {/* Section 3: Methodology */}
              <div className="premium-card bg-white p-6 space-y-6">
                <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                  <h2 className="text-base font-bold text-gray-900">3. المنهجية وخطة العمل</h2>
                  {editingSection !== "methodology.approach" ? (
                    <button
                      onClick={() => startEditing("methodology.approach", content.methodology?.approach || "")}
                      className="text-xs font-bold text-green-600 hover:text-green-700 flex items-center gap-1 hover:underline"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تعديل التمهيد</span>
                    </button>
                  ) : null}
                </div>

                {editingSection === "methodology.approach" ? (
                  <div className="space-y-3">
                    <textarea
                      rows={4}
                      value={tempText}
                      onChange={(e) => setTempText(e.target.value)}
                      className="w-full text-sm p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-green-500 leading-relaxed"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveTextSection("methodology.approach")}
                        disabled={savingSection}
                        className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded flex items-center gap-1.5"
                      >
                        {savingSection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>حفظ</span>
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="px-4 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {content.methodology?.approach || "لا يوجد منهجية معرفة. يرجى توليد العرض."}
                  </p>
                )}

                {/* Methodology Phases List */}
                {content.methodology?.phases && content.methodology.phases.length > 0 && (
                  <div className="space-y-4 pt-4 border-t border-gray-50">
                    <h3 className="font-bold text-sm text-gray-800">مراحل التدريب الرئيسية:</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {content.methodology.phases.map((p) => (
                        <div key={p.number} className="bg-gray-50 p-4 border border-gray-150 rounded-xl space-y-2.5">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded">المرحلة {p.number}</span>
                            <span className="text-[10px] text-gray-400 font-bold">{p.duration}</span>
                          </div>
                          <h4 className="font-bold text-gray-900 text-sm">{p.title}</h4>
                          <p className="text-xs text-gray-500 leading-relaxed line-clamp-4">{p.description}</p>
                          <div className="pt-2 border-t border-gray-100">
                            <div className="text-[10px] font-bold text-gray-600 mb-1">المخرجات الأساسية:</div>
                            <ul className="text-[10px] text-gray-500 list-disc list-inside space-y-0.5">
                              {p.objectives.slice(0, 2).map((obj, i) => (
                                <li key={i} className="truncate">{obj}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Section 4: Timeline */}
              <div className="premium-card bg-white p-6 space-y-4">
                <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">4. الجدول الزمني لتوزيع المحاور</h2>
                
                {content.timeline && content.timeline.length > 0 ? (
                  <div className="overflow-x-auto border border-gray-150 rounded-lg">
                    <table className="w-full text-right border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600 font-bold border-b border-gray-150">
                          <th className="p-3 w-1/4 text-center">اليوم / الفترة</th>
                          <th className="p-3 w-3/4">المحاور والأنشطة التدريبية</th>
                        </tr>
                      </thead>
                      <tbody>
                        {content.timeline.map((t, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/50">
                            <td className="p-3 text-center text-gray-600 font-semibold">{t.week}</td>
                            <td className="p-3 text-gray-700">{t.activity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">لا يوجد جدول زمني بعد.</p>
                )}
              </div>

              {/* Section 5: Financial Offer */}
              {rfp.proposal_type !== "technical" && content.financial && (
                <div className="premium-card bg-white p-6 space-y-6">
                  <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                    <h2 className="text-base font-bold text-gray-900">5. العرض المالي وبنود التسعير</h2>
                    
                    {!isEditingFinancial ? (
                      <button
                        onClick={() => {
                          setIsEditingFinancial(true);
                          setFinancialRows(content.financial?.breakdown || []);
                        }}
                        className="text-xs font-bold text-green-600 hover:text-green-700 flex items-center gap-1 hover:underline"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>تعديل الأسعار والبنود</span>
                      </button>
                    ) : null}
                  </div>

                  {/* Price Warning if Null */}
                  {!isEditingFinancial && content.financial.breakdown.some((b) => b.unit_price === null) && (
                    <div className="flex items-start gap-3 p-4 rounded-xl text-amber-800 bg-amber-50 border border-amber-200 text-sm font-semibold">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600" />
                      <div>
                        <h4 className="font-bold">تنبيه: عوائد وأسعار غير محددة</h4>
                        <p className="text-xs text-amber-700 mt-1 font-normal leading-relaxed">
                          هذا العرض يحتوي على بنود تسعير قيمتها غير محددة (null). يرجى تعبئة الأسعار المناسبة بالضغط على "تعديل الأسعار والبنود" ليقوم النظام باحتساب المجاميع والضريبة تلقائياً قبل التصدير.
                        </p>
                      </div>
                    </div>
                  )}

                  {isEditingFinancial ? (
                    /* Editable Spreadsheet Grid */
                    <div className="space-y-6">
                      <div className="overflow-x-auto border border-gray-150 rounded-lg">
                        <table className="w-full text-right border-collapse text-sm">
                          <thead>
                            <tr className="bg-gray-50 text-gray-600 font-bold border-b border-gray-150">
                              <th className="p-3">البند التدريبي / الخدمة المقدمة</th>
                              <th className="p-3 text-center w-24">الكمية</th>
                              <th className="p-3 text-center w-36">سعر الوحدة (ريال)</th>
                              <th className="p-3 text-center w-36">الإجمالي (ريال)</th>
                              <th className="p-3 text-center w-16">إجراء</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {financialRows.map((row, idx) => (
                              <tr key={idx}>
                                <td className="p-2">
                                  <input 
                                    type="text"
                                    value={row.item}
                                    onChange={(e) => handleFinancialCellChange(idx, "item", e.target.value)}
                                    className="w-full p-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:border-emerald-500"
                                  />
                                </td>
                                <td className="p-2 text-center">
                                  <input 
                                    type="number"
                                    value={row.quantity}
                                    onChange={(e) => handleFinancialCellChange(idx, "quantity", e.target.value)}
                                    className="w-20 p-1.5 border border-gray-200 rounded text-xs text-center focus:outline-none"
                                    dir="ltr"
                                  />
                                </td>
                                <td className="p-2 text-center">
                                  <input 
                                    type="number"
                                    value={row.unit_price === null ? "" : row.unit_price}
                                    onChange={(e) => handleFinancialCellChange(idx, "unit_price", e.target.value)}
                                    className="w-32 p-1.5 border border-gray-200 rounded text-xs text-center focus:outline-none"
                                    placeholder="أدخل السعر..."
                                    dir="ltr"
                                  />
                                </td>
                                <td className="p-2 text-center font-bold text-gray-900">
                                  {row.total !== null ? `${row.total}` : "يحدد لاحقاً"}
                                </td>
                                <td className="p-2 text-center">
                                  <button
                                    onClick={() => removeFinancialRow(idx)}
                                    className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={addFinancialRow}
                          className="px-3.5 py-1.5 border border-dashed border-gray-300 hover:border-green-500 text-gray-600 hover:text-green-700 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>إضافة بند تدريبي</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-600">شروط الدفع</label>
                          <input 
                            type="text"
                            value={paymentTerms}
                            onChange={(e) => setPaymentTerms(e.target.value)}
                            className="w-full text-xs p-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-green-500"
                            placeholder="أدخل شروط الدفع المعتمدة..."
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-600">صلاحية العرض (بالأيام)</label>
                          <input 
                            type="number"
                            value={validityDays}
                            onChange={(e) => setValidityDays(Number(e.target.value))}
                            className="w-24 text-xs p-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-green-500 text-center"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={saveFinancialSection}
                          disabled={savingSection}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                        >
                          {savingSection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>حفظ العرض المالي</span>
                        </button>
                        <button
                          onClick={() => setIsEditingFinancial(false)}
                          className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Static view of financial data */
                    <div className="space-y-6">
                      <div className="overflow-x-auto border border-gray-150 rounded-lg">
                        <table className="w-full text-right border-collapse text-sm">
                          <thead>
                            <tr className="bg-gray-50 text-gray-600 font-bold border-b border-gray-150">
                              <th className="p-3">البند التدريبي / الخدمة</th>
                              <th className="p-3 text-center w-24">الكمية</th>
                              <th className="p-3 text-center w-36">سعر الوحدة</th>
                              <th className="p-3 text-center w-36">المجموع الكلي</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {content.financial.breakdown.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/50">
                                <td className="p-3 text-gray-700">{item.item}</td>
                                <td className="p-3 text-center text-gray-600">{item.quantity}</td>
                                <td className="p-3 text-center text-gray-600">
                                  {item.unit_price !== null ? `${item.unit_price} ريال` : "يحدد لاحقاً"}
                                </td>
                                <td className="p-3 text-center font-bold text-gray-900">
                                  {item.total !== null ? `${item.total} ريال` : "يحدد لاحقاً"}
                                </td>
                              </tr>
                            ))}

                            {/* Calculated totals row */}
                            {content.financial.total_before_vat !== null && (
                              <>
                                <tr className="bg-gray-50 font-bold text-gray-800 border-t border-gray-150">
                                  <td colSpan={3} className="p-3 text-left">المجموع الفرعي (غير شامل القيمة المضافة):</td>
                                  <td className="p-3 text-center">{content.financial.total_before_vat} ريال</td>
                                </tr>
                                <tr className="bg-gray-50 text-gray-500">
                                  <td colSpan={3} className="p-3 text-left">ضريبة القيمة المضافة (15%):</td>
                                  <td className="p-3 text-center">{content.financial.vat_amount} ريال</td>
                                </tr>
                                <tr className="bg-green-50 font-bold text-green-800">
                                  <td colSpan={3} className="p-3 text-left">المجموع النهائي (شامل ضريبة القيمة المضافة):</td>
                                  <td className="p-3 text-center text-lg">{content.financial.total_after_vat} ريال</td>
                                </tr>
                              </>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-bold text-xs text-gray-600">شروط وأحكام الدفع:</h4>
                        <p className="text-xs text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-150">
                          {content.financial.payment_terms}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Section 6: Terms and Conditions */}
              <div className="premium-card bg-white p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                  <h2 className="text-base font-bold text-gray-900">6. الشروط والأحكام العامة</h2>
                  {editingSection !== "terms_and_conditions" ? (
                    <button
                      onClick={() => startEditing("terms_and_conditions", content.terms_and_conditions || "")}
                      className="text-xs font-bold text-green-600 hover:text-green-700 flex items-center gap-1 hover:underline"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                  ) : null}
                </div>

                {editingSection === "terms_and_conditions" ? (
                  <div className="space-y-3">
                    <textarea
                      rows={5}
                      value={tempText}
                      onChange={(e) => setTempText(e.target.value)}
                      className="w-full text-sm p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-green-500 leading-relaxed font-mono"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveTextSection("terms_and_conditions")}
                        disabled={savingSection}
                        className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded flex items-center gap-1.5"
                      >
                        {savingSection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>حفظ</span>
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="px-4 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {content.terms_and_conditions || "لا يوجد شروط محددة. يرجى توليد العرض."}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Compliance Checklist */}
          {activeTab === "compliance" && (
            <div className="premium-card bg-white p-6 space-y-6">
              <div className="border-b border-gray-100 pb-3">
                <h2 className="text-base font-bold text-gray-900">قائمة بنود التحقق ومطابقة الكراسة</h2>
                <p className="text-xs text-gray-500 mt-1">يقوم النظام تلقائياً بتحليل توافق العرض الفني والمالي مع شروط ومواصفات الكراسة المطلوبة.</p>
              </div>

              <div className="space-y-4 divide-y divide-gray-100">
                {proposal.compliance_checklist.map((item: ComplianceItem, idx: number) => (
                  <div key={idx} className="pt-4 first:pt-0 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h4 className="font-bold text-sm text-gray-800 leading-snug">{item.requirement}</h4>
                      <p className="text-xs text-gray-500 leading-relaxed">{item.note}</p>
                    </div>

                    <div className="flex-shrink-0">
                      {item.covered ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                          <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                          <span>مطابق ومغطى</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                          <XCircle className="w-3.5 h-3.5 text-red-600" />
                          <span>غير متوفر بالعرض</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* LEFT COLUMN: SIDEBAR METADATA (1/4 Width) */}
        <div className="space-y-6 no-print">
          
          {/* Card: RFP Parameters Summary */}
          <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-900 text-sm border-b border-gray-100 pb-2">بيانات طلب التدريب (RFP)</h3>
            
            <div className="text-xs space-y-3 text-gray-600 divide-y divide-gray-100 font-medium">
              <div className="pt-2">
                <span className="font-bold text-gray-400 block mb-0.5">اسم الشركة:</span>
                <span className="text-gray-950 font-bold">{rfp.client_name}</span>
              </div>
              <div className="pt-2">
                <span className="font-bold text-gray-400 block mb-0.5">اسم المسؤول:</span>
                <span className="text-gray-900 font-semibold">{rfp.client_contact || "غير محدد"}</span>
              </div>
              <div className="pt-2">
                <span className="font-bold text-gray-400 block mb-0.5">ميزانية التدريب:</span>
                <span className="text-gray-900 font-semibold">{rfp.budget ? `${rfp.budget} ريال سعودي` : "غير محددة"}</span>
              </div>
              <div className="pt-2">
                <span className="font-bold text-gray-400 block mb-0.5">الفئة:</span>
                <span className="text-gray-900 font-semibold">{rfp.category || "غير محدد"}</span>
              </div>
              <div className="pt-2">
                <span className="font-bold text-gray-400 block mb-0.5">الفئة الفرعية:</span>
                <span className="text-gray-900 font-semibold">{rfp.subcategory || "غير محدد"}</span>
              </div>
              <div className="pt-2">
                <span className="font-bold text-gray-400 block mb-0.5">نوع التدريب:</span>
                <span className="text-gray-900 font-semibold">{rfp.training_type}</span>
              </div>
              <div className="pt-2">
                <span className="font-bold text-gray-400 block mb-0.5">نوع الشهادة:</span>
                <span className="text-gray-900 font-semibold">{rfp.certificate_type || "بدون شهادة"}</span>
              </div>
              <div className="pt-2">
                <span className="font-bold text-gray-400 block mb-0.5">اللغة المفضلة:</span>
                <span className="text-gray-900 font-semibold">{rfp.preferred_language}</span>
              </div>
              <div className="pt-2">
                <span className="font-bold text-gray-400 block mb-0.5">عدد المشاركين:</span>
                <span className="text-gray-900 font-bold">{rfp.trainees_count} متدرب</span>
              </div>
              <div className="pt-2">
                <span className="font-bold text-gray-400 block mb-0.5">الفترة التدريبية:</span>
                <span className="text-gray-900 font-semibold">
                  {rfp.start_date || rfp.end_date ? `من ${rfp.start_date || "—"} إلى ${rfp.end_date || "—"}` : "غير محددة"}
                </span>
              </div>
              {rfp.other_requirements && (
                <div className="pt-2">
                  <span className="font-bold text-gray-400 block mb-0.5">متطلبات أخرى:</span>
                  <span className="text-gray-700 font-medium block whitespace-pre-wrap max-h-32 overflow-y-auto bg-gray-50 p-2 rounded border border-gray-100">{rfp.other_requirements}</span>
                </div>
              )}
            </div>

            {/* Regenerate AI Button */}
            {!isContentEmpty && (
              <button
                onClick={triggerAIGeneration}
                disabled={generating}
                className="w-full mt-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 border border-emerald-200 transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
                <span>إعادة توليد بالذكاء الاصطناعي</span>
              </button>
            )}
          </div>

        </div>

      </div>

      {/* HIGH-FIDELITY AI GENERATION PROGRESS OVERLAY */}
      {generating && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-md w-full p-8 text-center space-y-6 shadow-2xl animate-scale-up">
            <div className="relative flex items-center justify-center w-20 h-20 mx-auto">
              <Loader2 className="w-16 h-16 animate-spin text-emerald-600" />
              <Sparkles className="w-6 h-6 text-emerald-500 absolute animate-pulse" />
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-gray-900 text-lg">جاري صياغة محتوى العرض التدريبي</h3>
              <p className="text-xs text-gray-500">يقوم محرك الذكاء الاصطناعي بكتابة وتدقيق الأقسام الفنية والمالية...</p>
            </div>

            <div className="space-y-2.5 text-right max-w-sm mx-auto bg-gray-50 p-4 rounded-xl border border-gray-150">
              {loadingMessages.map((msg, idx) => {
                const isCompleted = generationStep > idx;
                const isCurrent = generationStep === idx;

                return (
                  <div key={idx} className="flex items-center gap-2.5 text-xs font-semibold">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                      isCompleted 
                        ? "bg-emerald-600 text-white" 
                        : isCurrent 
                          ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500/10 animate-pulse" 
                          : "bg-gray-200 text-gray-400"
                    }`}>
                      {isCompleted ? "✓" : idx + 1}
                    </div>
                    <span className={`${isCurrent ? "text-emerald-700 font-bold" : isCompleted ? "text-gray-600" : "text-gray-400"}`}>
                      {msg}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

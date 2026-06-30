"use client";
 
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Sparkles, 
  Loader2, 
  AlertCircle, 
  Check, 
  Plus, 
  Undo2,
  ArrowRight,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon
} from "lucide-react";
 
export default function NewRequest() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousRequests, setPreviousRequests] = useState<any[]>([]);
  const [loadingPrevious, setLoadingPrevious] = useState(false);

  useEffect(() => {
    async function fetchPrevious() {
      try {
        const res = await fetch("/api/proposals");
        const json = await res.json();
        if (json.success) {
          setPreviousRequests(json.data || []);
        }
      } catch (err) {
        console.error("Failed to load previous requests:", err);
      }
    }
    fetchPrevious();
  }, []);
  
  // Modal state for adding a company
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");

  // Loading steps tracker
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingMessages = [
    "جاري حفظ طلب التدريب وتأمين البيانات المرفقة...",
    "جاري البحث في قاعدة المعرفة واستدعاء العروض المماثلة (RAG)...",
    "جاري صياغة وكتابة العرض التدريبي بالذكاء الاصطناعي (Gemini)...",
    "جاري حساب درجة المطابقة وصياغة قائمة التحقق والتأكد من جودة النص...",
    "تم التوليد بنجاح! جاري توجيهك إلى لوحة مراجعة العرض..."
  ];

  // Mock data lists
  const [companies, setCompanies] = useState([
    "شركة أرامكو السعودية",
    "شركة سابك (SABIC)",
    "وزارة الاتصالات وتقنية المعلومات",
    "البنك الأهلي السعودي",
    "شركة الاتصالات السعودية (STC)",
    "الشركة السعودية للكهرباء",
    "وزارة الصحة السعودية"
  ]);

  const categories = [
    "القيادة والإدارة",
    "التكنولوجيا والبرمجة",
    "الموارد البشرية والتطوير",
    "المالية والمحاسبة",
    "المبيعات والتسويق",
    "الصحة والسلامة المهنية",
    "تطوير الذات والمهارات الشخصية"
  ];

  const subcategories = [
    "إدارة المشاريع الاحترافية (PMP)",
    "الذكاء الاصطناعي وتحليل البيانات",
    "الأمن السيبراني وحماية المعلومات",
    "مهارات التواصل والتفاوض الفعال",
    "التطوير الذكي للمبيعات وخدمة العملاء",
    "إدارة سلاسل الإمداد والخدمات اللوجستية"
  ];

  const trainingTypes = ["حضوري", "عن بعد", "هجين"];
  const certificateTypes = [
    "شهادة حضور معتمدة من المؤسسة العامة للتدريب",
    "شهادة اجتياز واختبار تقييمي",
    "شهادة مهنية دولية معتمدة",
    "بدون شهادة"
  ];

  const languages = ["العربية", "الإنجليزية", "كلاهما (عربي/إنجليزي)"];
  
  const entitiesList = [
    "معهد التميز للتدريب",
    "أكاديمية التعلم الرقمي",
    "معهد رواد الغد",
    "مركز التدريب الوطني"
  ];

  const [formData, setFormData] = useState({
    // Left panel (Sidebar)
    client_name: "شركة سابك (SABIC)",
    client_contact: "م. أحمد الحربي",
    budget: "0",
    entity: "معهد التميز للتدريب",
    proposal_type: "combined", // technical | financial | combined

    // Right panel (Main form)
    title: "",
    category: "القيادة والإدارة",
    subcategory: "إدارة المشاريع الاحترافية (PMP)",
    training_type: "حضوري",
    certificate_type: "شهادة حضور معتمدة من المؤسسة العامة للتدريب",
    trainees_count: "1",
    preferred_language: "العربية",
    start_date: "",
    end_date: "",
    other_requirements: "",
    
    // Hidden config settings
    deadline: "",
    client_notes: "",
    rfp_text: ""
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCompanyName.trim()) {
      setCompanies(prev => [...prev, newCompanyName.trim()]);
      setFormData(prev => ({ ...prev, client_name: newCompanyName.trim() }));
      setNewCompanyName("");
      setShowAddCompanyModal(false);
    }
  };

  // Submit to API to save only (AI generation is done from details page)
  const handleGenerate = async () => {
    if (!formData.title.trim()) {
      alert("يرجى إدخال اسم الدورة أو البرنامج التدريبي.");
      return;
    }
    if (!formData.client_name) {
      alert("يرجى تحديد أو إضافة اسم الشركة.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        save_only: true,
        rfp: {
          title: formData.title,
          client_name: formData.client_name,
          client_contact: formData.client_contact || null,
          budget: formData.budget ? Number(formData.budget) : 0,
          category: formData.category || null,
          subcategory: formData.subcategory || null,
          training_type: formData.training_type,
          certificate_type: formData.certificate_type || null,
          preferred_language: formData.preferred_language,
          trainees_count: Number(formData.trainees_count),
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          other_requirements: formData.other_requirements || null,
          proposal_type: formData.proposal_type,
          deadline: formData.deadline || null,
          client_notes: formData.client_notes || null,
          rfp_text: formData.rfp_text || null,
        }
      };

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success) {
        setTimeout(() => {
          router.push(`/proposals/${json.proposal_id}`);
        }, 800);
      } else {
        setError(json.error || "حدث خطأ غير متوقع أثناء حفظ العرض.");
        setLoading(false);
      }
    } catch (err: any) {
      setError("فشل الاتصال بالخادم. يرجى التحقق من الشبكة وإعادة المحاولة.");
      setLoading(false);
    }
  };

  return (
    <>
      <div className="max-w-[1300px] mx-auto space-y-6 animate-fade-in relative pb-16">
      
      {/* Top Header / Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-semibold mb-1">
            <span>نظرة عامة</span>
            <span>&gt;</span>
            <span className="text-gray-900 font-bold">إنشاء</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">إضافة طلب تدريب</h1>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push("/dashboard")} 
            className="px-4 py-2 border border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-50 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>العودة إلى لوحة القيادة</span>
          </button>
        </div>
      </div>

      {/* Main Dual-Column Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* RIGHT COLUMN: MAIN FORM (3/4 Width) */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Main Form Fields Card */}
          <div className="bg-white border border-gray-150 rounded-2xl p-6 shadow-sm space-y-6">
            
            {/* Load Previous Request Data Option */}
            {previousRequests.length > 0 && (
              <div className="space-y-1.5 bg-green-50/20 border border-green-100 p-4 rounded-xl no-print">
                <label className="text-xs font-bold text-green-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-green-600 animate-pulse" />
                  <span>تعبئة تلقائية من عرض أو طلب سابق:</span>
                </label>
                <div className="flex gap-2">
                  <select
                    onChange={async (e) => {
                      const selectedId = e.target.value;
                      if (!selectedId) return;
                      setLoadingPrevious(true);
                      try {
                        const res = await fetch(`/api/proposals/${selectedId}`);
                        const json = await res.json();
                        if (json.success && json.data) {
                          const r = json.data.rfp_data;
                          setFormData({
                            client_name: r.client_name || "شركة سابك (SABIC)",
                            client_contact: r.client_contact || "",
                            budget: r.budget ? String(r.budget) : "0",
                            entity: json.data.tenant_name || "معهد التميز للتدريب",
                            proposal_type: r.proposal_type || "combined",
                            title: r.title || "",
                            category: r.category || "القيادة والإدارة",
                            subcategory: r.subcategory || "إدارة المشاريع الاحترافية (PMP)",
                            training_type: r.training_type || "حضوري",
                            certificate_type: r.certificate_type || "شهادة حضور معتمدة من المؤسسة العامة للتدريب",
                            trainees_count: r.trainees_count ? String(r.trainees_count) : "1",
                            preferred_language: r.preferred_language || "العربية",
                            start_date: r.start_date || "",
                            end_date: r.end_date || "",
                            other_requirements: r.other_requirements || "",
                            deadline: r.deadline || "",
                            client_notes: r.client_notes || "",
                            rfp_text: r.rfp_text || ""
                          });
                        }
                      } catch (err) {
                        console.error("Failed to load previous proposal fields:", err);
                        alert("فشل استيراد بيانات العرض المختار.");
                      } finally {
                        setLoadingPrevious(false);
                      }
                    }}
                    disabled={loadingPrevious}
                    className="w-full text-xs p-2.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-green-500 font-medium text-gray-700 cursor-pointer"
                  >
                    <option value="">-- اختر طلباً أو عرضاً سابقاً لنسخ تفاصيله --</option>
                    {previousRequests.map((req) => (
                      <option key={req.id} value={req.id}>
                        {req.rfp_title || req.client_name} - لجهة {req.client_name} ({new Date(req.created_at).toLocaleDateString("ar-SA")})
                      </option>
                    ))}
                  </select>
                  {loadingPrevious && (
                    <div className="flex items-center justify-center px-3 bg-gray-100 border rounded-lg">
                      <Loader2 className="w-4 h-4 animate-spin text-green-600" />
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Course Title (RTE Mockup) */}
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-gray-700">اسم الدورة *</label>
              <div className="border border-gray-200 rounded-xl overflow-hidden focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10 transition-all">
                {/* RTE Toolbar mockup */}
                <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex flex-wrap gap-2.5 text-gray-500">
                  <button type="button" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"><Bold className="w-3.5 h-3.5" /></button>
                  <button type="button" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"><Italic className="w-3.5 h-3.5" /></button>
                  <button type="button" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"><Underline className="w-3.5 h-3.5" /></button>
                  <div className="w-px bg-gray-200 my-1"></div>
                  <button type="button" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"><List className="w-3.5 h-3.5" /></button>
                  <button type="button" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"><ListOrdered className="w-3.5 h-3.5" /></button>
                  <div className="w-px bg-gray-200 my-1"></div>
                  <button type="button" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"><Link2 className="w-3.5 h-3.5" /></button>
                  <button type="button" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"><ImageIcon className="w-3.5 h-3.5" /></button>
                </div>
                <textarea 
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full text-sm p-4.5 border-0 focus:outline-none focus:ring-0 leading-relaxed placeholder-gray-400"
                  placeholder="أدخل اسم الدورة..."
                  required
                />
              </div>
            </div>

            {/* Grid of basic metadata */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Category */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600">الفئة</label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full text-sm p-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all text-gray-700 font-medium"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Sub-category */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600">الفئة الفرعية</label>
                <select
                  name="subcategory"
                  value={formData.subcategory}
                  onChange={handleInputChange}
                  className="w-full text-sm p-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all text-gray-700 font-medium"
                >
                  {subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Training Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600">نوع التدريب</label>
                <select
                  name="training_type"
                  value={formData.training_type}
                  onChange={handleInputChange}
                  className="w-full text-sm p-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all text-gray-700 font-medium"
                >
                  {trainingTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Certificate Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600">نوع الشهادة</label>
                <select
                  name="certificate_type"
                  value={formData.certificate_type}
                  onChange={handleInputChange}
                  className="w-full text-sm p-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all text-gray-700 font-medium"
                >
                  {certificateTypes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Participants count */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600">عدد المشاركين</label>
                <input 
                  type="number"
                  name="trainees_count"
                  value={formData.trainees_count}
                  onChange={handleInputChange}
                  min={1}
                  className="w-full text-sm p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 text-left transition-all text-gray-800 font-semibold"
                  dir="ltr"
                  required
                />
              </div>

              {/* Preferred Language */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600">اللغة المفضلة</label>
                <select
                  name="preferred_language"
                  value={formData.preferred_language}
                  onChange={handleInputChange}
                  className="w-full text-sm p-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all text-gray-700 font-medium"
                >
                  {languages.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              {/* Start Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600">تاريخ البدء</label>
                <input 
                  type="date"
                  name="start_date"
                  value={formData.start_date}
                  onChange={handleInputChange}
                  className="w-full text-sm p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 text-left transition-all text-gray-700 font-medium"
                  dir="ltr"
                />
              </div>

              {/* End Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600">تاريخ الانتهاء</label>
                <input 
                  type="date"
                  name="end_date"
                  value={formData.end_date}
                  onChange={handleInputChange}
                  className="w-full text-sm p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 text-left transition-all text-gray-700 font-medium"
                  dir="ltr"
                />
              </div>

            </div>

            {/* Other Requirements (RTE Mockup) */}
            <div className="space-y-1.5 pt-2">
              <label className="text-sm font-bold text-gray-700">متطلبات أخرى</label>
              <div className="border border-gray-200 rounded-xl overflow-hidden focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10 transition-all">
                {/* RTE Toolbar mockup */}
                <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex flex-wrap gap-2.5 text-gray-500">
                  <button type="button" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"><Bold className="w-3.5 h-3.5" /></button>
                  <button type="button" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"><Italic className="w-3.5 h-3.5" /></button>
                  <button type="button" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"><Underline className="w-3.5 h-3.5" /></button>
                  <div className="w-px bg-gray-200 my-1"></div>
                  <button type="button" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"><List className="w-3.5 h-3.5" /></button>
                  <button type="button" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"><ListOrdered className="w-3.5 h-3.5" /></button>
                  <div className="w-px bg-gray-200 my-1"></div>
                  <button type="button" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"><Link2 className="w-3.5 h-3.5" /></button>
                  <button type="button" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"><ImageIcon className="w-3.5 h-3.5" /></button>
                </div>
                <textarea 
                  name="other_requirements"
                  value={formData.other_requirements}
                  onChange={handleInputChange}
                  rows={4}
                  className="w-full text-sm p-4.5 border-0 focus:outline-none focus:ring-0 leading-relaxed placeholder-gray-400 font-medium"
                  placeholder="أدخل المتطلبات الأخرى..."
                />
              </div>
            </div>

          </div>

        </div>

        {/* LEFT COLUMN: SIDEBAR PARAMS (1/4 Width) */}
        <div className="space-y-6">
          
          {/* Card 1: Company Details */}
          <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-gray-700">اسم الشركة</label>
              <select
                name="client_name"
                value={formData.client_name}
                onChange={handleInputChange}
                className="w-full text-xs p-2.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/10 text-gray-800 font-semibold"
              >
                {companies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            
            <button 
              type="button"
              onClick={() => setShowAddCompanyModal(true)}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة شركة</span>
            </button>
          </div>

          {/* Card 2: Responsible Person */}
          <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-sm space-y-1.5">
            <label className="text-sm font-bold text-gray-700">اسم الشخص المسؤول</label>
            <input 
              type="text"
              name="client_contact"
              value={formData.client_contact}
              onChange={handleInputChange}
              className="w-full text-xs p-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 text-gray-800 font-medium"
              placeholder="اسم المنسق لدى العميل..."
            />
          </div>

          {/* Card 3: Training Budget */}
          <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-sm space-y-1.5">
            <label className="text-sm font-bold text-gray-700">ميزانية التدريب</label>
            <input 
              type="number"
              name="budget"
              value={formData.budget}
              onChange={handleInputChange}
              className="w-full text-xs p-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 text-left font-semibold text-gray-800"
              dir="ltr"
            />
          </div>

          {/* Card 4: Target Entities */}
          <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-gray-800">إرسال الطلب إلى الجهات</label>
              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">الجهات</label>
                <select
                  name="entity"
                  value={formData.entity}
                  onChange={handleInputChange}
                  className="w-full text-xs p-2.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500 text-gray-700 font-medium"
                >
                  {entitiesList.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Card 5: Proposal Engine Settings */}
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
              <span>إعدادات صياغة العرض الذكي</span>
            </h3>
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-emerald-700 block">نوع العرض التدريبي المطلوب</label>
              <div className="flex flex-col gap-2 bg-white/75 p-2.5 border border-emerald-100 rounded-xl">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input 
                    type="radio" 
                    name="proposal_type" 
                    value="combined" 
                    checked={formData.proposal_type === "combined"}
                    onChange={handleInputChange}
                    className="w-3.5 h-3.5 text-emerald-600 focus:ring-emerald-500 border-gray-300"
                  />
                  <span>عرض فني ومالي مشترك</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input 
                    type="radio" 
                    name="proposal_type" 
                    value="technical" 
                    checked={formData.proposal_type === "technical"}
                    onChange={handleInputChange}
                    className="w-3.5 h-3.5 text-emerald-600 focus:ring-emerald-500 border-gray-300"
                  />
                  <span>عرض فني فقط</span>
                </label>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* BOTTOM BUTTON BAR (Floating style footer) */}
      <div className="flex items-center gap-3 border-t border-gray-200 pt-6 mt-4">
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span>إضافة طلب تدريب</span>
        </button>

        <button
          onClick={() => router.push("/dashboard")}
          className="px-6 py-3 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-xl transition-colors cursor-pointer"
        >
          <span>إلغاء</span>
        </button>
      </div>

      {/* POPUP MODAL: ADD COMPANY */}
      {showAddCompanyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl animate-scale-up">
            <h3 className="font-bold text-gray-900 text-base">إضافة شركة جديدة</h3>
            <form onSubmit={handleAddCompany} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500">اسم المنشأة / العميل *</label>
                <input 
                  type="text"
                  required
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  className="w-full text-sm p-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  placeholder="مثال: شركة سابك، وزارة الداخلية..."
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  حفظ وإضافة
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setNewCompanyName("");
                    setShowAddCompanyModal(false);
                  }}
                  className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-600 text-xs font-bold rounded-lg cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HIGH-FIDELITY AI GENERATION PROGRESS OVERLAY */}
      {loading && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-md w-full p-8 text-center space-y-4 shadow-2xl animate-scale-up">
            {/* Loading Indicator */}
            <div className="relative flex items-center justify-center w-16 h-16 mx-auto">
              <Loader2 className="w-12 h-12 animate-spin text-emerald-600" />
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-gray-900 text-base">جاري حفظ طلب التدريب</h3>
              <p className="text-xs text-gray-500">يرجى الانتظار، يتم الآن تسجيل الطلب وتوجيهك لصفحة العرض التدريبي...</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Settings, Save, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function TenantSetup() {
  const [formData, setFormData] = useState({
    name: "",
    name_en: "",
    license_number: "",
    phone: "",
    email: "",
    address: "",
    writing_style: "",
    specializations: "",
    fixed_terms: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load existing tenant settings
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/tenants/profile");
        const json = await res.json();
        
        if (json.success && json.data) {
          const d = json.data;
          
          // Convert specializations array to comma-separated string
          const specsStr = Array.isArray(d.specializations) ? d.specializations.join("، ") : "";
          
          // Convert fixed_terms JSONB object to one-per-line text representation
          const termsLines: string[] = [];
          if (d.fixed_terms && typeof d.fixed_terms === "object") {
            for (const [key, val] of Object.entries(d.fixed_terms)) {
              if (key.startsWith("البند الثابت #")) {
                termsLines.push(String(val));
              } else {
                termsLines.push(`${key}: ${val}`);
              }
            }
          }
          const termsStr = termsLines.join("\n");

          setFormData({
            name: d.name || "",
            name_en: d.name_en || "",
            license_number: d.license_number || "",
            phone: d.phone || "",
            email: d.email || "",
            address: d.address || "",
            writing_style: d.writing_style || "",
            specializations: specsStr,
            fixed_terms: termsStr,
          });
        }
      } catch (err) {
        console.error("Failed to load tenant configurations:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    // 1. Process Specializations: Split by Arabic comma "،" or English comma ","
    const specsArray = formData.specializations
      .split(/,|،/)
      .map((s) => s.trim())
      .filter(Boolean);

    // 2. Process Fixed Terms: Convert newline string lines to JSONB object
    const termsLines = formData.fixed_terms.split("\n").map((l) => l.trim()).filter(Boolean);
    const fixedTermsObj: Record<string, string> = {};
    
    termsLines.forEach((line, index) => {
      const separatorIdx = line.indexOf(":");
      if (separatorIdx !== -1) {
        const key = line.substring(0, separatorIdx).trim();
        const val = line.substring(separatorIdx + 1).trim();
        fixedTermsObj[key] = val;
      } else {
        // Fallback key if user didn't write Key: Value
        fixedTermsObj[`البند الثابت #${index + 1}`] = line;
      }
    });

    try {
      const res = await fetch("/api/tenants/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          name_en: formData.name_en,
          license_number: formData.license_number,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          writing_style: formData.writing_style,
          specializations: specsArray,
          fixed_terms: fixedTermsObj,
        }),
      });

      const result = await res.json();
      if (result.success) {
        setMessage({ type: "success", text: result.message || "تم حفظ البيانات بنجاح" });
      } else {
        setMessage({ type: "error", text: result.error || "فشل حفظ البيانات." });
      }
    } catch (err) {
      setMessage({ type: "error", text: "حدث خطأ غير متوقع أثناء حفظ البيانات." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-green-600" />
        <p className="text-sm text-gray-500">جاري تحميل إعدادات المعهد...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">إعدادات المعهد</h1>
        <p className="text-sm text-gray-500">
          تخصيص البيانات الرسمية، الهوية التجارية، أسلوب صياغة العروض، والبنود القانونية الثابتة.
        </p>
      </div>

      {message && (
        <div className={`flex items-start gap-3 p-4 rounded-xl text-sm font-medium border ${
          message.type === "success" 
            ? "bg-green-50 text-green-800 border-green-200" 
            : "bg-red-50 text-red-800 border-red-200"
        }`}>
          {message.type === "success" ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Right Section: Contact details (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="premium-card bg-white p-6 space-y-6">
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center gap-2">
              <Settings className="w-4 h-4 text-gray-400" />
              <span>البيانات الأساسية للمعهد</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Arabic Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">اسم المعهد بالعربية *</label>
                <input 
                  type="text" 
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full text-sm p-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-green-500"
                  placeholder="مثال: معهد التميز للتدريب"
                />
              </div>

              {/* English Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">اسم المعهد بالإنجليزية</label>
                <input 
                  type="text" 
                  name="name_en"
                  value={formData.name_en}
                  onChange={handleChange}
                  className="w-full text-sm p-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-green-500 text-left"
                  placeholder="Example: Excellence Training Institute"
                  dir="ltr"
                />
              </div>

              {/* License Number */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">رقم ترخيص المؤسسة (TVTC / NELC)</label>
                <input 
                  type="text" 
                  name="license_number"
                  value={formData.license_number}
                  onChange={handleChange}
                  className="w-full text-sm p-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-green-500"
                  placeholder="مثال: TVTC-12345"
                />
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">رقم الهاتف</label>
                <input 
                  type="text" 
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full text-sm p-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-green-500 text-left"
                  placeholder="مثال: +966501234567"
                  dir="ltr"
                />
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">البريد الإلكتروني المعتمد</label>
                <input 
                  type="email" 
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full text-sm p-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-green-500 text-left"
                  placeholder="مثال: info@excellence.sa"
                  dir="ltr"
                />
              </div>

              {/* Address */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">العنوان الرسمي للمقر</label>
                <input 
                  type="text" 
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full text-sm p-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-green-500"
                  placeholder="مثال: الرياض، طريق الملك سلمان، حي الياسمين"
                />
              </div>
            </div>
          </div>

          <div className="premium-card bg-white p-6 space-y-6">
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">البنود والشروط الثابتة</h2>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-600">
                البنود الثابتة في نهاية العروض التدريبية (اكتب بنداً واحداً في كل سطر)
              </label>
              <textarea
                name="fixed_terms"
                rows={6}
                value={formData.fixed_terms}
                onChange={handleChange}
                className="w-full text-sm p-3 border border-gray-200 rounded-lg focus:outline-none focus:border-green-500 leading-relaxed font-mono"
                placeholder={`شروط الدفع: دفع 50% مقدم و50% بعد تقديم التقرير.
صلاحية العرض: هذا العرض ساري المفعول لمدة 30 يوماً من تاريخه.`}
              />
            </div>
          </div>
        </div>

        {/* Left Section: AI Learning profile (1/3 width) */}
        <div className="space-y-6">
          <div className="premium-card bg-white p-6 space-y-6">
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">هوية الصياغة الذكية (AI)</h2>
            
            {/* Writing Style */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-600">أسلوب وأحكام الصياغة التدريبية</label>
              <textarea
                name="writing_style"
                rows={5}
                value={formData.writing_style}
                onChange={handleChange}
                className="w-full text-sm p-3 border border-gray-200 rounded-lg focus:outline-none focus:border-green-500 leading-relaxed"
                placeholder="صف الأسلوب المفضل للمعهد (مثال: أسلوب فني فخم، استخدام جمل قصيرة ومباشرة، التركيز على ورش العمل والجانب العملي التطبيقي)."
              />
            </div>

            {/* Specializations */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-600">تخصصات التدريب الأساسية (مفصولة بفواصل)</label>
              <input
                type="text"
                name="specializations"
                value={formData.specializations}
                onChange={handleChange}
                className="w-full text-sm p-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-green-500"
                placeholder="مثال: القيادة، الأمن السيبراني، تحليل البيانات، الموارد البشرية"
              />
              <p className="text-[10px] text-gray-400">تساعد التخصصات على زيادة دقة ربط العروض المرجعية في الفهرس.</p>
            </div>
          </div>

          {/* Submit card */}
          <div className="premium-card bg-white p-6">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              <span>حفظ الإعدادات</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

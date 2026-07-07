"use client";

import { useState, useEffect } from "react";
import { 
  Upload, 
  FileText, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Clock, 
  Database 
} from "lucide-react";

interface PendingFile {
  id: string;
  file: File;
  title: string;
  trainingType: string;
  sector: string;
  status: "won" | "lost" | "pending";
  uploading: boolean;
  uploaded: boolean;
  error?: string;
  warning?: string;
  wordCount?: number;
}

export default function UploadPage() {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadedHistory, setUploadedHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [uploadAllActive, setUploadAllActive] = useState(false);

  // Load uploaded references history
  async function loadHistory() {
    try {
      const res = await fetch("/api/upload");
      const data = await res.json();
      if (data.success) {
        setUploadedHistory(data.data || []);
      }
    } catch (err) {
      console.error("Failed to load upload history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  // Handle Drag & Drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (files: File[]) => {
    const validFiles = files.filter(f => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext === "pdf" || ext === "docx" || ext === "doc" || ext === "pptx" || ext === "txt";
    });

    if (validFiles.length < files.length) {
      alert("يرجى رفع ملفات بصيغة PDF, DOCX, PPTX أو TXT فقط.");
    }

    const newPending: PendingFile[] = validFiles.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      title: f.name.substring(0, f.name.lastIndexOf(".")) || f.name,
      trainingType: "قيادة",
      sector: "حكومي",
      status: "won",
      uploading: false,
      uploaded: false,
    }));

    setPendingFiles(prev => [...prev, ...newPending]);
  };

  const removePending = (id: string) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id));
  };

  const updatePendingField = (id: string, field: keyof PendingFile, value: any) => {
    setPendingFiles(prev =>
      prev.map((f) => (f.id === id ? { ...f, [field]: value } : f))
    );
  };

  // Upload a single file
  const uploadSingle = async (id: string): Promise<boolean> => {
    const item = pendingFiles.find((f) => f.id === id);
    if (!item || item.uploaded || item.uploading) return false;

    updatePendingField(id, "uploading", true);
    updatePendingField(id, "error", undefined);

    const formData = new FormData();
    formData.append("file", item.file);
    formData.append("rfp_title", item.title);
    formData.append("training_type", item.trainingType);
    formData.append("sector", item.sector);
    formData.append("status", item.status);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      if (result.success) {
        setPendingFiles(prev =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  uploaded: true,
                  uploading: false,
                  wordCount: result.data.word_count,
                  warning: result.data.warning,
                }
              : f
          )
        );
        loadHistory();
        return true;
      } else {
        updatePendingField(id, "error", result.error || "فشل التحميل.");
        updatePendingField(id, "uploading", false);
        return false;
      }
    } catch (err: any) {
      updatePendingField(id, "error", "حدث خطأ أثناء الاتصال بالخادم.");
      updatePendingField(id, "uploading", false);
      return false;
    }
  };

  // Upload all pending files sequentially
  const uploadAll = async () => {
    const toUpload = pendingFiles.filter((f) => !f.uploaded && !f.uploading);
    if (toUpload.length === 0) return;

    setUploadAllActive(true);
    for (const item of toUpload) {
      await uploadSingle(item.id);
    }
    setUploadAllActive(false);
  };

  // Static Dropdown Data
  const trainingTypes = ["قيادة", "تقني", "سلامة", "تواصل", "مشاريع", "موارد بشرية", "مالية", "خدمة عملاء", "IT", "أخرى"];
  const sectors = ["نفط وغاز", "بنوك", "حكومي", "صحة", "تعليم", "تجزئة", "عقارات", "اتصالات", "أخرى"];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">رفع عروض مرجعية</h1>
        <p className="text-sm text-gray-500">
          تغذية النظام بالعروض الفائزة والخاسرة لتمكين محرك الذكاء الاصطناعي من مواءمة كتابة العروض وصياغتها.
        </p>
      </div>

      {/* Drag & Drop Box */}
      <div 
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`premium-card p-10 bg-white border-2 border-dashed text-center transition-all ${
          dragActive ? "border-green-500 bg-green-50/30" : "border-gray-300"
        }`}
      >
        <input 
          type="file" 
          id="file-upload-input" 
          multiple 
          accept=".pdf,.docx,.doc,.pptx,.txt"
          onChange={handleFileInput}
          className="hidden" 
        />
        <label htmlFor="file-upload-input" className="cursor-pointer">
          <Upload className="w-12 h-12 mx-auto text-gray-400 group-hover:text-green-600 mb-4 transition-colors" />
          <p className="font-bold text-gray-800 text-sm">اسحب الملفات وأفلتها هنا أو اضغط للتصفح</p>
          <p className="text-xs text-gray-500 mt-2">الملفات المدعومة: PDF, DOCX, PPTX, TXT (الحد الأقصى لحجم الملف: 20 ميجابايت)</p>
        </label>
      </div>

      {/* Pending Files List */}
      {pendingFiles.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900">ملفات جاهزة للرفع ({pendingFiles.filter(f => !f.uploaded).length})</h2>
            <button
              onClick={uploadAll}
              disabled={uploadAllActive || pendingFiles.every(f => f.uploaded)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-lg shadow-sm flex items-center gap-2 transition-colors"
            >
              {uploadAllActive && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>رفع الكل</span>
            </button>
          </div>

          <div className="space-y-4">
            {pendingFiles.map((item) => (
              <div 
                key={item.id} 
                className={`premium-card p-5 bg-white border ${
                  item.uploaded ? "border-green-200 bg-green-50/10" : item.error ? "border-red-200" : "border-gray-200"
                }`}
              >
                {/* Upper row: File info */}
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${item.uploaded ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{item.file.name}</div>
                      <div className="text-xs text-gray-500">الحجم: {(item.file.size / 1024 / 1024).toFixed(2)} ميجابايت</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.uploaded ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-lg">
                        <CheckCircle2 className="w-4 h-4" />
                        مكتمل {item.wordCount && `(${item.wordCount} كلمة)`}
                      </span>
                    ) : (
                      <button
                        onClick={() => removePending(item.id)}
                        disabled={item.uploading}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Form row (only shown if not yet uploaded) */}
                {!item.uploaded && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end border-t border-gray-100 pt-4">
                    {/* Title */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600">عنوان العرض التدريبي المرجعي</label>
                      <input 
                        type="text" 
                        value={item.title} 
                        onChange={(e) => updatePendingField(item.id, "title", e.target.value)}
                        className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:outline-none focus:border-green-500"
                        placeholder="أدخل عنواناً للملف..."
                      />
                    </div>

                    {/* Training Type */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600">نوع التدريب</label>
                      <select
                        value={item.trainingType}
                        onChange={(e) => updatePendingField(item.id, "trainingType", e.target.value)}
                        className="w-full text-xs p-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-green-500"
                      >
                        {trainingTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>

                    {/* Sector */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600">القطاع</label>
                      <select
                        value={item.sector}
                        onChange={(e) => updatePendingField(item.id, "sector", e.target.value)}
                        className="w-full text-xs p-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-green-500"
                      >
                        {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* Status & Upload button */}
                    <div className="flex gap-3 items-center">
                      <div className="space-y-1 flex-1">
                        <label className="text-xs font-bold text-gray-600">النتيجة التاريخية</label>
                        <select
                          value={item.status}
                          onChange={(e) => updatePendingField(item.id, "status", e.target.value)}
                          className="w-full text-xs p-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-green-500"
                        >
                          <option value="won">✅ فائز</option>
                          <option value="lost">❌ خاسر</option>
                          <option value="pending">⏳ معلق</option>
                        </select>
                      </div>

                      <button
                        onClick={() => uploadSingle(item.id)}
                        disabled={item.uploading || !item.title.trim()}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 h-[34px] transition-colors"
                      >
                        {item.uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        <span>رفع</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Error/Warning indicators */}
                {item.error && (
                  <div className="flex items-center gap-2 mt-3 text-red-700 bg-red-50 p-2.5 rounded-lg text-xs font-medium">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{item.error}</span>
                  </div>
                )}

                {item.warning && (
                  <div className="flex items-center gap-2 mt-3 text-amber-700 bg-amber-50 p-2.5 rounded-lg text-xs font-medium">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{item.warning}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload History list (History of references) */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Database className="w-5 h-5 text-gray-400" />
          <span>قاعدة المعارف الحالية ({uploadedHistory.length} عرض مرجعي)</span>
        </h2>

        <div className="premium-card bg-white overflow-hidden">
          {loadingHistory ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((n) => (
                <div key={n} className="flex items-center justify-between">
                  <div className="h-4 w-64 bg-gray-100 rounded animate-pulse"></div>
                  <div className="h-4 w-20 bg-gray-100 rounded animate-pulse"></div>
                </div>
              ))}
            </div>
          ) : uploadedHistory.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-sm">لم يتم رفع أي عروض مرجعية بعد.</p>
              <p className="text-xs text-gray-400 mt-1">ابدأ برفع عروضك السابقة أعلاه لزيادة دقة وذكاء صياغة النظام.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs font-semibold border-b border-gray-100">
                    <th className="p-4">عنوان العرض التدريبي المرجعي</th>
                    <th className="p-4 text-center">نوع التدريب</th>
                    <th className="p-4 text-center">القطاع</th>
                    <th className="p-4 text-center">النتيجة</th>
                    <th className="p-4 text-center">تاريخ الإضافة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {uploadedHistory.map((item) => {
                    const statusColors: any = {
                      won: "bg-green-50 text-green-700 border-green-200",
                      lost: "bg-red-50 text-red-700 border-red-200",
                      pending: "bg-amber-50 text-amber-700 border-amber-200",
                    };
                    const statusText: any = {
                      won: "فائز",
                      lost: "خاسر",
                      pending: "معلق",
                    };

                    return (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 font-semibold text-gray-900 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span>{item.rfp_title}</span>
                        </td>
                        <td className="p-4 text-center text-gray-600">{item.training_type}</td>
                        <td className="p-4 text-center text-gray-600">{item.sector}</td>
                        <td className="p-4 text-center">
                          <span className={`inline-block px-2.5 py-0.5 border rounded-full text-xs font-semibold ${statusColors[item.status] || "bg-gray-50"}`}>
                            {statusText[item.status] || item.status}
                          </span>
                        </td>
                        <td className="p-4 text-center text-gray-500 text-xs flex items-center justify-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span>{new Date(item.created_at).toLocaleDateString("ar-SA")}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

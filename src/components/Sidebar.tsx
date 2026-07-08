"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  FilePlus2, 
  FolderSearch, 
  FileText, 
  Upload, 
  Settings, 
  User,
  Shield
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: "نظرة عامة", href: "/dashboard", icon: LayoutDashboard },
    { name: "طلب عرض جديد", href: "/requests/new", icon: FilePlus2 },
    { name: "العروض المولّدة", href: "/proposals", icon: FileText },
    { name: "رفع عروض مرجعية", href: "/upload", icon: Upload },
    { name: "إعدادات المعهد", href: "/tenants/setup", icon: Settings },
    { name: "إدارة النظام (Superadmin)", href: "/superadmin", icon: Shield },
  ];

  return (
    <aside className="w-[220px] bg-white h-screen border-l border-gray-200 flex flex-col justify-between fixed right-0 top-0 z-20 no-print">
      {/* Top Section */}
      <div>
        {/* Brand Logo */}
        <div className="p-5 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold text-lg">
            ك
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-sm leading-tight">كورسيت</h1>
            <p className="text-[10px] text-gray-500 font-medium">محرك العروض الذكي</p>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-green-50 text-green-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-green-600" : "text-gray-400"}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User Section */}
      <div className="p-4 border-t border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700">
            <User className="w-4 h-4" />
          </div>
          <div className="overflow-hidden">
            <h2 className="font-semibold text-gray-800 text-xs truncate">عبدالعزيز الشارخ</h2>
            <p className="text-[10px] text-gray-500 truncate">abdulaziz@courseat.com</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

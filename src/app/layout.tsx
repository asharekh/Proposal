import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "محرك العروض الذكي — كورسيت",
  description: "منصة كورسيت الذكية لتوليد وتصميم المقترحات والعروض التدريبية الفنية والمالية تلقائياً",
};

export default function RootLayout({
  children,
  ...rest
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-gray-50 text-gray-900 antialiased min-h-screen">
        <div className="flex">
          {/* Main Content Area */}
          <main className="flex-1 pr-[220px] min-h-screen transition-all duration-200">
            <div className="p-8 max-w-6xl mx-auto">
              {children}
            </div>
          </main>

          {/* Sidebar (Right-aligned) */}
          <Sidebar />
        </div>
      </body>
    </html>
  );
}

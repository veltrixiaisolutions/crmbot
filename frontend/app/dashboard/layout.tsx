"use client";

import { useAuthGuard } from "@/lib/useAuthGuard";
import Sidebar from "./_components/Sidebar";
import Header from "./_components/Header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ready = useAuthGuard();

  if (!ready) return null;

  return (
    <div className="flex h-screen w-full bg-slate-50/70 overflow-hidden text-slate-900 font-sans">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}


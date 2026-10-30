"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ChevronRight, ShieldCheck, Globe, ArrowLeft } from "lucide-react";
import { getTimezoneOption, getCurrentTimeInTimezone, useSelectedTimezone, TIMEZONE_OPTIONS } from "@/lib/timezone";

const pageTitles: Record<string, { title: string; category: string }> = {
  "/dashboard": { title: "Overview", category: "Workspace" },
  "/dashboard/knowledge": { title: "Knowledge Base", category: "Workspace" },
  "/dashboard/settings": { title: "Settings", category: "Workspace" },
  "/dashboard/staff": { title: "Staff Management", category: "Team" },
  "/dashboard/monitor": { title: "Chat Monitor", category: "Operations" },
  "/dashboard/conversations": { title: "Leads Tracking", category: "Operations" },
  "/dashboard/analytics": { title: "Lead Analytics", category: "Operations" },
  "/dashboard/leads": { title: "My Leads", category: "Staff Workspace" },
};

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [businessName, setBusinessName] = useState<string>("Veltrix AI");
  const [timezone, setTimezone] = useSelectedTimezone("Asia/Kolkata");
  const [localTime, setLocalTime] = useState<string>("");

  useEffect(() => {
    api.get<{ business_name?: string; timezone?: string }>("/tenants/me")
      .then((t) => {
        if (t.business_name) setBusinessName(t.business_name);
        // If not customized locally yet, seed with tenant timezone
        if (t.timezone && typeof window !== "undefined" && !localStorage.getItem("veltrix_selected_timezone")) {
          setTimezone(t.timezone);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const update = () => setLocalTime(getCurrentTimeInTimezone(timezone));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [timezone]);

  const tzOpt = getTimezoneOption(timezone);

  const currentRoute = Object.entries(pageTitles).find(([route]) => {
    if (route === "/dashboard") return pathname === "/dashboard";
    return pathname === route || pathname.startsWith(route + "/");
  })?.[1] || { title: "Dashboard", category: "Workspace" };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/80 px-6 backdrop-blur-md lg:px-8">
      {/* Left: Back Option + Breadcrumb Context */}
      <div className="flex items-center gap-3">
        {pathname !== "/dashboard" && (
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 hover:text-slate-900 transition-all active:scale-95 shrink-0"
            title="Go back"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-slate-500" />
            <span className="hidden sm:inline">Back</span>
          </button>
        )}

        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-500">{currentRoute.category}</span>
          <ChevronRight className="h-4 w-4 text-slate-400" />
          <span className="font-semibold text-slate-900">{currentRoute.title}</span>
        </div>
      </div>

      {/* Right Status Actions */}
      <div className="flex items-center gap-3">
        {/* WhatsApp Service Status */}
        <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          <span>WhatsApp Engine Active</span>
        </div>

        {/* Tenant Business & Timezone Badge */}
        <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs">
          <span className="text-base select-none">{tzOpt.flag}</span>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-800">{businessName}</span>
              <select
                value={tzOpt.value}
                onChange={(e) => setTimezone(e.target.value)}
                className="rounded bg-slate-200/70 hover:bg-slate-300/70 px-1 py-0.2 text-[10px] font-bold text-slate-700 uppercase outline-none cursor-pointer transition-colors"
                title="Switch timezone between India and Toronto"
                aria-label="Switch timezone"
              >
                {TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.flag} {opt.short}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[10px] font-mono text-slate-500">{localTime}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

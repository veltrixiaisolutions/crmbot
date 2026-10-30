"use client";

import { useSelectedTimezone, TIMEZONE_OPTIONS, getTimezoneOption } from "@/lib/timezone";
import { Globe, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimezoneSelectorProps {
  className?: string;
  variant?: "pill" | "header" | "compact";
  showLabel?: boolean;
}

export function TimezoneSelector({
  className,
  variant = "pill",
  showLabel = true,
}: TimezoneSelectorProps) {
  const [currentTz, setTz] = useSelectedTimezone();
  const currentOpt = getTimezoneOption(currentTz);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-1.5 shadow-2xs hover:border-slate-300 transition-all",
        variant === "header" && "bg-slate-50/80 border-slate-200/80",
        className
      )}
      title="Select timezone for leads and timestamps"
    >
      <span className="text-base leading-none select-none">{currentOpt.flag}</span>
      {showLabel && (
        <span className="text-[11px] font-semibold text-slate-500 hidden sm:inline uppercase tracking-wider">
          Timezone:
        </span>
      )}
      <select
        value={currentOpt.value}
        onChange={(e) => setTz(e.target.value)}
        className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer pr-1"
        aria-label="Select display timezone"
      >
        {TIMEZONE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-white text-slate-900 font-medium">
            {opt.flag} {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

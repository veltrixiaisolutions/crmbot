"use client";

import { Check, CheckCheck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageStatusTickProps {
  status?: "sent" | "delivered" | "read" | "failed" | string | null;
  className?: string;
  showText?: boolean;
  failureReason?: string | null;
  title?: string;
}

export function MessageStatusTick({
  status = "sent",
  className,
  showText = false,
  failureReason,
  title,
}: MessageStatusTickProps) {
  const normStatus = (status || "sent").toLowerCase();

  if (normStatus === "read") {
    return (
      <span
        className={cn("inline-flex items-center gap-0.5 text-[#53bdeb] shrink-0 select-none", className)}
        title={title || "Read by customer"}
      >
        <CheckCheck className="h-3.5 w-3.5 stroke-[2.4]" />
        {showText && <span className="text-[10px] font-semibold text-[#53bdeb]">Read</span>}
      </span>
    );
  }

  if (normStatus === "delivered") {
    return (
      <span
        className={cn("inline-flex items-center gap-0.5 text-slate-400 shrink-0 select-none", className)}
        title={title || "Delivered to customer"}
      >
        <CheckCheck className="h-3.5 w-3.5 stroke-[2.2]" />
        {showText && <span className="text-[10px] font-medium text-slate-400">Delivered</span>}
      </span>
    );
  }

  if (normStatus === "failed") {
    const tooltipText = title || failureReason || "Message delivery failed: Meta 24-hour service window limit (Customer has not messaged your business number in the last 24h).";
    return (
      <span
        className={cn("inline-flex items-center gap-0.5 text-rose-500 shrink-0 select-none cursor-help", className)}
        title={tooltipText}
      >
        <AlertCircle className="h-3.5 w-3.5 stroke-[2.2]" />
        {showText && <span className="text-[10px] font-medium text-rose-500">Failed</span>}
      </span>
    );
  }

  // Default: "sent" (single grey check)
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-slate-400 shrink-0 select-none", className)}
      title="Sent to WhatsApp"
    >
      <Check className="h-3.5 w-3.5 stroke-[2.2]" />
      {showText && <span className="text-[10px] font-medium text-slate-400">Sent</span>}
    </span>
  );
}

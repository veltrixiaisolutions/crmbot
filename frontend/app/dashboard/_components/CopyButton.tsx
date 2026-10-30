"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  className?: string;
  iconClassName?: string;
  title?: string;
  showFeedbackText?: boolean;
}

export function CopyButton({
  text,
  className,
  iconClassName,
  title = "Copy phone number",
  showFeedbackText = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!text) return;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md p-1 transition-all text-slate-400 hover:text-slate-700 hover:bg-slate-100",
        copied && "text-emerald-600 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-700",
        className
      )}
    >
      {copied ? (
        <Check className={cn("h-3.5 w-3.5 text-emerald-600 shrink-0", iconClassName)} />
      ) : (
        <Copy className={cn("h-3.5 w-3.5 shrink-0", iconClassName)} />
      )}
      {showFeedbackText && copied && (
        <span className="text-[10px] font-semibold text-emerald-600 leading-none">Copied</span>
      )}
    </button>
  );
}

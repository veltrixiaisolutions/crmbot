"use client";

import React, { useState, useEffect } from "react";
import { 
  X, 
  Send, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Eye, 
  EyeOff, 
  RefreshCw,
  MessageSquare,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface BulkRecipientItem {
  id?: string;
  lead_name?: string | null;
  wa_user_phone: string;
}

interface BulkMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipients: BulkRecipientItem[];
  onSuccess?: () => void;
}

const QUICK_TEMPLATES = [
  {
    label: "Follow-up",
    text: "Hi {{name}}, just following up on your inquiry with us. Please let us know if you need any assistance or have any questions!",
  },
  {
    label: "Quick Check-in",
    text: "Hello {{name}}! We are checking in to see if you are available for a quick conversation regarding your requirements.",
  },
  {
    label: "Special Update",
    text: "Namaste {{name}}! We have an exciting update regarding our services. Let us know when would be a convenient time to connect.",
  },
  {
    label: "Support Assistance",
    text: "Hi {{name}}, our team noticed you reached out to us earlier. We are here to help you get started right away!",
  },
];

export function BulkMessageModal({
  isOpen,
  onClose,
  recipients,
  onSuccess,
}: BulkMessageModalProps) {
  const [message, setMessage] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showAllRecipients, setShowAllRecipients] = useState(false);
  const [resultsData, setResultsData] = useState<{
    success: boolean;
    total: number;
    sent_count: number;
    failed_count: number;
    message: string;
    results: Array<{
      phone: string;
      name?: string | null;
      status: string;
      error?: string | null;
      wa_message_id?: string | null;
    }>;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMessage("");
      setCampaignName(`Broadcast ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`);
      setIsSending(false);
      setErrorMsg(null);
      setResultsData(null);
      setShowPreview(false);
      setShowAllRecipients(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSending, onClose]);

  if (!isOpen) return null;

  const validRecipients = recipients.filter((r) => r.wa_user_phone && r.wa_user_phone.trim().length >= 7);

  const insertVariable = (tag: string) => {
    setMessage((prev) => prev ? `${prev} ${tag}` : tag);
  };

  const handleSend = async () => {
    if (!message.trim()) {
      setErrorMsg("Please enter a message before sending.");
      return;
    }
    if (validRecipients.length === 0) {
      setErrorMsg("No valid recipients selected.");
      return;
    }

    setErrorMsg(null);
    setIsSending(true);

    try {
      // Gather payload: if conversation IDs exist, send them; also send recipient records
      const convIds = validRecipients
        .map((r) => r.id)
        .filter((id): id is string => Boolean(id));

      const payload = {
        conversation_ids: convIds,
        recipients: validRecipients.map((r) => ({
          phone: r.wa_user_phone,
          name: r.lead_name || null,
          conversation_id: r.id || null,
        })),
        message: message.trim(),
        campaign_name: campaignName.trim() || undefined,
      };

      const res = await api.post<any>("/conversations/bulk-message", payload);
      setResultsData(res);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error("Bulk message failed:", err);
      setErrorMsg(err.message || "Failed to dispatch bulk messages");
    } finally {
      setIsSending(false);
    }
  };

  // Preview message with sample lead
  const sampleLead = validRecipients[0];
  const sampleName = sampleLead?.lead_name || "Alex";
  const previewText = message
    ? message.replace(/\{\{\s*name\s*\}\}|\{\s*name\s*\}/gi, sampleName)
    : "Your message preview will appear here...";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={() => !isSending && onClose()} 
      />

      {/* Modal Dialog */}
      <div 
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] z-10 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/30">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Send Bulk WhatsApp Message</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  <Users className="h-3 w-3" />
                  {validRecipients.length} Recipient{validRecipients.length === 1 ? "" : "s"}
                </span>
                <span className="text-[11px] text-slate-400">Direct WhatsApp Dispatch</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSending}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 animate-in fade-in">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <div className="flex-1">
                <span className="font-bold">Error:</span> {errorMsg}
              </div>
            </div>
          )}

          {/* Results Summary if already completed */}
          {resultsData ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-emerald-950">Broadcast Finished</h3>
                    <p className="text-xs text-emerald-800 mt-0.5">{resultsData.message}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-emerald-200/60 text-center">
                  <div className="rounded-lg bg-white/70 p-2 border border-emerald-100">
                    <div className="text-xs text-slate-500 font-medium">Total</div>
                    <div className="text-lg font-bold text-slate-900">{resultsData.total}</div>
                  </div>
                  <div className="rounded-lg bg-white/70 p-2 border border-emerald-100">
                    <div className="text-xs text-emerald-600 font-medium">Sent Successfully</div>
                    <div className="text-lg font-bold text-emerald-600">{resultsData.sent_count}</div>
                  </div>
                  <div className="rounded-lg bg-white/70 p-2 border border-emerald-100">
                    <div className="text-xs text-rose-600 font-medium">Failed</div>
                    <div className="text-lg font-bold text-rose-600">{resultsData.failed_count}</div>
                  </div>
                </div>
              </div>

              {/* Breakdown Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-700 flex justify-between">
                  <span>Recipient Delivery Report</span>
                  <span>{resultsData.results.length} contacts</span>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {resultsData.results.map((r, idx) => (
                    <div key={idx} className="flex items-center justify-between px-4 py-2 hover:bg-slate-50/60">
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-slate-900 truncate">
                          {r.name || "Unknown"}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {r.phone}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {r.status === "sent" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            Sent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800" title={r.error || "Failed"}>
                            <AlertCircle className="h-3 w-3 text-rose-600" />
                            {r.error ? (r.error.length > 25 ? r.error.slice(0, 25) + "..." : r.error) : "Failed"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Campaign Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Campaign / Broadcast Title <span className="text-slate-400 font-normal">(for tracking history)</span>
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. October Product Launch, Follow-up Broadcast"
                  disabled={isSending}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-all"
                />
              </div>

              {/* Recipient Audience Preview */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-slate-500" />
                    Selected Audience ({validRecipients.length})
                  </span>
                  {validRecipients.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setShowAllRecipients(!showAllRecipients)}
                      className="text-indigo-600 hover:text-indigo-700 font-medium text-[11px] flex items-center gap-0.5"
                    >
                      {showAllRecipients ? (
                        <>Show less <ChevronUp className="h-3 w-3" /></>
                      ) : (
                        <>View all {validRecipients.length} <ChevronDown className="h-3 w-3" /></>
                      )}
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {(showAllRecipients ? validRecipients : validRecipients.slice(0, 8)).map((r, i) => (
                    <span 
                      key={i} 
                      className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2 py-1 text-[11px] text-slate-700 shadow-2xs"
                    >
                      <span className="font-medium text-slate-900">{r.lead_name || "Lead"}</span>
                      <span className="text-slate-400 font-mono text-[10px]">({r.wa_user_phone})</span>
                    </span>
                  ))}
                  {!showAllRecipients && validRecipients.length > 8 && (
                    <span className="inline-flex items-center px-2 py-1 text-[11px] font-semibold text-slate-500">
                      +{validRecipients.length - 8} more
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Template Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-700">Quick Templates</span>
                  <button
                    type="button"
                    onClick={() => insertVariable("{{name}}")}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-200 transition-colors"
                  >
                    <Sparkles className="h-3 w-3" />
                    Insert Lead Name: &#123;&#123;name&#125;&#125;
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {QUICK_TEMPLATES.map((tmpl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={isSending}
                      onClick={() => setMessage(tmpl.text)}
                      className="text-left rounded-lg border border-slate-200 bg-white hover:bg-indigo-50/60 hover:border-indigo-300 px-2.5 py-1.5 text-xs text-slate-700 transition-all font-medium truncate"
                      title={tmpl.text}
                    >
                      ⚡ {tmpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Composer Area */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    WhatsApp Message Text <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                  >
                    {showPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {showPreview ? "Hide WhatsApp Preview" : "Show WhatsApp Preview"}
                  </button>
                </div>

                <textarea
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={isSending}
                  placeholder="Type your WhatsApp message here... You can use {{name}} to personalize each message with the contact's name!"
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-all resize-none font-sans"
                />

                <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400 px-1">
                  <span>Formatting: *bold*, _italic_, ~strike~</span>
                  <span>{message.length} characters</span>
                </div>
              </div>

              {/* WhatsApp Live Device Preview */}
              {showPreview && (
                <div className="rounded-xl border border-emerald-200 bg-[#EFEAE2] p-4 animate-in fade-in duration-150">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>WhatsApp Chat Preview (Sample: {sampleName})</span>
                    <span className="text-emerald-700 font-normal">Encrypted WhatsApp Message</span>
                  </div>
                  <div className="max-w-sm rounded-lg rounded-tl-none bg-[#DCF8C6] p-3 text-xs text-slate-800 shadow-sm whitespace-pre-wrap relative border border-[#c4eab0]">
                    <p className="leading-relaxed">{previewText}</p>
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-500">
                      <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="text-emerald-600 font-bold">✓✓</span>
                    </div>
                  </div>
                </div>
              )}

              {/* WhatsApp Notice Warning */}
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[11px] text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <div className="space-y-0.5">
                  <p className="font-semibold">WhatsApp Cloud API Delivery Notice</p>
                  <p className="text-amber-800 text-[10px] leading-relaxed">
                    Custom free-form text messages are delivered to customers who have interacted with your business within the standard 24h customer service window. Each contact receives an individual direct message.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/50 flex items-center justify-end gap-2.5 shrink-0">
          {resultsData ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 px-5 py-2.5 text-xs font-bold text-white transition-all shadow-sm shadow-slate-900/10 cursor-pointer"
            >
              Done & Refresh Leads
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isSending}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 transition-all disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={isSending || !message.trim() || validRecipients.length === 0}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2.5 text-xs font-bold text-white transition-all shadow-sm shadow-indigo-600/20 active:scale-[0.98] cursor-pointer"
              >
                {isSending ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Sending to {validRecipients.length} Contact{validRecipients.length === 1 ? "" : "s"}...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Send to {validRecipients.length} Recipient{validRecipients.length === 1 ? "" : "s"}</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

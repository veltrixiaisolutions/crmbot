"use client";

import { useState, useEffect } from "react";
import { X, Ban, ShieldCheck, AlertTriangle, MessageSquare, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";

const PRESET_REASONS = [
  "Customer sending vague / irrelevant messages",
  "Repeated spam or bot messages",
  "Abusive or inappropriate language",
  "Wrong number / Not a qualified lead",
  "Customer requested to stop messaging",
];

interface BlockChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  phone: string;
  leadName?: string | null;
  isBlocked?: boolean;
  currentReason?: string | null;
  onSuccess: (updatedConv: any) => void;
}

export function BlockChatModal({
  isOpen,
  onClose,
  conversationId,
  phone,
  leadName,
  isBlocked = false,
  currentReason,
  onSuccess,
}: BlockChatModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (currentReason && !PRESET_REASONS.includes(currentReason)) {
        setSelectedReason("custom");
        setCustomReason(currentReason);
      } else if (currentReason) {
        setSelectedReason(currentReason);
        setCustomReason("");
      } else {
        setSelectedReason(PRESET_REASONS[0]);
        setCustomReason("");
      }
    }
  }, [isOpen, currentReason]);

  if (!isOpen) return null;

  const finalReason = selectedReason === "custom" ? customReason.trim() || "Vague or spam messages" : selectedReason;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (isBlocked) {
        // Unblock
        const updated = await api.post(`/conversations/${conversationId}/unblock`);
        onSuccess(updated);
        onClose();
      } else {
        // Block
        const updated = await api.post(`/conversations/${conversationId}/block`, {
          reason: finalReason,
        });
        onSuccess(updated);
        onClose();
      }
    } catch (err: any) {
      console.error("Failed to update block status:", err);
      setError(err?.message || `Failed to ${isBlocked ? "unblock" : "block"} conversation`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isBlocked ? "bg-emerald-50/70 border-emerald-100" : "bg-rose-50/70 border-rose-100"
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              isBlocked ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            }`}>
              {isBlocked ? <ShieldCheck className="h-5 w-5" /> : <Ban className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isBlocked ? "Unblock Conversation" : "Block Conversation"}
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {leadName ? `${leadName} (${phone})` : phone}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-white/80 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
              {error}
            </div>
          )}

          {isBlocked ? (
            /* Unblock Info */
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-2">
                <p className="font-semibold text-slate-900">
                  Are you sure you want to unblock this contact?
                </p>
                <p>
                  Unblocking will restore normal operations. The contact will be eligible for AI bot replies, staff messaging, and new message notifications.
                </p>
                {currentReason && (
                  <p className="text-[11px] text-slate-500 border-t border-slate-200/60 pt-2 mt-2">
                    Originally blocked for: <span className="font-medium text-slate-700 italic">"{currentReason}"</span>
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* Block Options */
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-[11px] leading-relaxed">
                  <span className="font-bold text-amber-950 block text-xs">What happens when blocked?</span>
                  <ul className="list-disc pl-3.5 space-y-0.5 text-amber-900">
                    <li>AI bot will <strong>never reply</strong> to vague or unwanted messages.</li>
                    <li>Automatic staff assignment will be <strong>disabled</strong>.</li>
                    <li>Unread badges and notification sounds will be <strong>silenced</strong>.</li>
                    <li>Outgoing free-form messages are locked until unblocked.</li>
                  </ul>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Reason for blocking
                </label>
                <div className="space-y-1.5">
                  {PRESET_REASONS.map((reason) => (
                    <label
                      key={reason}
                      className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                        selectedReason === reason
                          ? "bg-rose-50/50 border-rose-300 text-rose-950 font-medium shadow-2xs"
                          : "border-slate-200/80 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="block_reason"
                        value={reason}
                        checked={selectedReason === reason}
                        onChange={() => setSelectedReason(reason)}
                        className="text-rose-600 focus:ring-rose-500 h-3.5 w-3.5"
                      />
                      <span>{reason}</span>
                    </label>
                  ))}

                  <label
                    className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                      selectedReason === "custom"
                        ? "bg-rose-50/50 border-rose-300 text-rose-950 font-medium shadow-2xs"
                        : "border-slate-200/80 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="block_reason"
                      value="custom"
                      checked={selectedReason === "custom"}
                      onChange={() => setSelectedReason("custom")}
                      className="text-rose-600 focus:ring-rose-500 h-3.5 w-3.5"
                    />
                    <span>Other custom reason...</span>
                  </label>
                </div>

                {selectedReason === "custom" && (
                  <div className="mt-2.5">
                    <input
                      type="text"
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="Specify reason (e.g. repeatedly asking for off-topic services)..."
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer ${
                isBlocked
                  ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
                  : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20"
              }`}
            >
              {isSubmitting ? (
                <span>Processing...</span>
              ) : isBlocked ? (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  <span>Confirm Unblock</span>
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4" />
                  <span>Block Conversation</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

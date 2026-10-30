"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  MessageSquarePlus, 
  X, 
  Send, 
  User, 
  Phone, 
  StickyNote, 
  RefreshCw, 
  AlertCircle, 
  Sparkles,
  Users,
  CheckCircle2
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface StaffUser {
  id: string;
  name?: string;
  email: string;
  staff_type: "general" | "setter" | "closer";
  status?: "offline" | "online" | "break" | "in_meet";
  is_active?: boolean;
}

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (conv: any) => void;
  staffList?: StaffUser[];
}

const QUICK_TEMPLATES = [
  "Hi! How can we help you today?",
  "Hello, following up on your inquiry with us.",
  "Namaste! Thank you for reaching out to us.",
  "Hi! We are available now to assist you with your requirements.",
];

const EMPTY_STAFF: StaffUser[] = [];

export function NewChatModal({
  isOpen,
  onClose,
  onSuccess,
  staffList = EMPTY_STAFF,
}: NewChatModalProps) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [initialMessage, setInitialMessage] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>(staffList || EMPTY_STAFF);

  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    // Only reset state when modal opens (transitioning from closed to open)
    if (isOpen && !prevIsOpenRef.current) {
      setPhone("");
      setName("");
      setInitialMessage("");
      setNotes("");
      setAssignedTo("");
      setErrorMsg(null);

      if (!staffList || staffList.length === 0) {
        api.get<StaffUser[]>("/users/staff")
          .then((res) => {
            if (Array.isArray(res)) setStaffUsers(res);
          })
          .catch(() => {});
      } else {
        setStaffUsers(staffList);
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanDigits = phone.replace(/[^\d]/g, "");
    if (!cleanDigits || cleanDigits.length < 7) {
      setErrorMsg("Please enter a valid phone number with country code (e.g. +91 9876543210 or 14165551234).");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.post<any>("/conversations", {
        wa_user_phone: phone.trim(),
        lead_name: name.trim() || null,
        initial_message: initialMessage.trim() || null,
        notes: notes.trim() || null,
        assigned_to: assignedTo || null,
      });

      onClose();

      if (onSuccess) {
        onSuccess(res);
      } else if (res?.id) {
        // Automatically navigate to conversation thread
        router.push(`/dashboard/conversations/${res.id}`);
      }
    } catch (err: any) {
      console.error("Failed to start new chat:", err);
      setErrorMsg(err.message || "Failed to start new chat. Please check the phone number and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4.5 bg-gradient-to-r from-emerald-50/80 via-white to-slate-50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
              <MessageSquarePlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Start New Chat</span>
                <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 tracking-wider uppercase">
                  Manual
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Initiate a conversation with a new or existing lead
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4.5">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold animate-in fade-in">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* WhatsApp Phone Number */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700">
                WhatsApp Phone Number <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">Include country code</span>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute left-3 top-2.5 text-slate-400 flex items-center gap-1 z-10">
                <Phone className="h-4 w-4 text-emerald-600" />
              </div>
              <input
                type="tel"
                required
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 9876543210"
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="text-[10px] text-slate-400 font-medium">Quick country code:</span>
              <button
                type="button"
                onClick={() => setPhone((p) => {
                  const cleaned = p.replace(/^\+?\d{1,3}\s*/, "");
                  return `+91 ${cleaned}`.trim();
                })}
                className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors cursor-pointer"
              >
                🇮🇳 +91 (IN)
              </button>
              <button
                type="button"
                onClick={() => setPhone((p) => {
                  const cleaned = p.replace(/^\+?\d{1,3}\s*/, "");
                  return `+1 ${cleaned}`.trim();
                })}
                className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors cursor-pointer"
              >
                🇨🇦/🇺🇸 +1 (US/CA)
              </button>
              <button
                type="button"
                onClick={() => setPhone((p) => {
                  const cleaned = p.replace(/^\+?\d{1,3}\s*/, "");
                  return `+44 ${cleaned}`.trim();
                })}
                className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors cursor-pointer"
              >
                🇬🇧 +44 (UK)
              </button>
              <button
                type="button"
                onClick={() => setPhone((p) => {
                  const cleaned = p.replace(/^\+?\d{1,3}\s*/, "");
                  return `+971 ${cleaned}`.trim();
                })}
                className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors cursor-pointer"
              >
                🇦🇪 +971 (UAE)
              </button>
            </div>
          </div>

          {/* Lead Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Lead / Customer Name <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Assign To (Staff) */}
          {staffUsers.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Assign Conversation To <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                >
                  <option value="">Auto-assign or Unassigned</option>
                  {staffUsers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name || s.email.split("@")[0]} ({s.staff_type}) {s.is_active ? "● Online" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Initial Message */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Initial Outbound Message <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <span className="text-[11px] text-slate-400">Sent immediately via WhatsApp</span>
            </div>
            <textarea
              rows={3}
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              placeholder="Type the message you want to send to this lead right away..."
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400 resize-none font-medium leading-relaxed"
            />
            {/* Quick Templates */}
            <div className="mt-1.5 space-y-1">
              <span className="text-[10px] text-slate-400 font-medium">Quick message templates:</span>
              <div className="flex flex-col gap-1">
                {QUICK_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl}
                    type="button"
                    onClick={() => setInitialMessage(tmpl)}
                    className={cn(
                      "text-left text-[11px] px-2.5 py-1.5 rounded-lg border transition-all truncate",
                      initialMessage === tmpl
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    "{tmpl}"
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Internal Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Internal Lead Notes <span className="text-slate-400 font-normal">(Only visible to your team)</span>
            </label>
            <div className="relative">
              <StickyNote className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Lead from seminar, interested in package A..."
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-200 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Starting Chat...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Start Chat</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

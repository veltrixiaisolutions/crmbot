"use client";

import React, { useState, useEffect } from "react";
import { CreditCard, DollarSign, X, Check, RefreshCw, AlertCircle, Sparkles } from "lucide-react";

export type PaymentDetails = {
  total_payment?: number | null;
  advance_payment?: number | null;
  remaining_payment?: number | null;
  purpose?: string | null;
  notes?: string | null;
  recorded_at?: string | null;
  recorded_by_name?: string | null;
  recorded_by_email?: string | null;
};

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payment: PaymentDetails) => Promise<void>;
  leadName?: string | null;
  leadPhone: string;
  initialData?: PaymentDetails | null;
  initialNotes?: string | null;
}

const COMMON_PURPOSES = [
  "Consultation Fee",
  "Strategy Call",
  "Advance Booking",
  "Package Service",
  "Course / Training",
  "Full Project",
];

export function PaymentModal({
  isOpen,
  onClose,
  onSave,
  leadName,
  leadPhone,
  initialData,
  initialNotes,
}: PaymentModalProps) {
  const [totalPayment, setTotalPayment] = useState<string>("");
  const [advancePayment, setAdvancePayment] = useState<string>("");
  const [remainingPayment, setRemainingPayment] = useState<string>("");
  const [purpose, setPurpose] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync initial data when modal opens
  useEffect(() => {
    if (isOpen) {
      const tot = initialData?.total_payment != null ? String(initialData.total_payment) : "";
      const adv = initialData?.advance_payment != null ? String(initialData.advance_payment) : "";
      const rem = initialData?.remaining_payment != null ? String(initialData.remaining_payment) : "";

      setTotalPayment(tot);
      setAdvancePayment(adv);
      setRemainingPayment(rem);
      setPurpose(initialData?.purpose || "");
      setNotes(initialData?.notes || initialNotes || "");
      setErrorMsg(null);
    }
  }, [isOpen, initialData, initialNotes]);

  // Auto-calculate remaining payment when total or advance changes
  const handleTotalChange = (val: string) => {
    setTotalPayment(val);
    const totNum = parseFloat(val) || 0;
    const advNum = parseFloat(advancePayment) || 0;
    if (!isNaN(totNum)) {
      setRemainingPayment(String(Math.max(0, totNum - advNum)));
    }
  };

  const handleAdvanceChange = (val: string) => {
    setAdvancePayment(val);
    const totNum = parseFloat(totalPayment) || 0;
    const advNum = parseFloat(val) || 0;
    if (!isNaN(totNum)) {
      setRemainingPayment(String(Math.max(0, totNum - advNum)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const tot = totalPayment !== "" ? parseFloat(totalPayment) : null;
    const adv = advancePayment !== "" ? parseFloat(advancePayment) : null;
    const rem = remainingPayment !== "" ? parseFloat(remainingPayment) : null;

    if (tot === null && adv === null) {
      setErrorMsg("Please enter at least the total payment or advance payment amount.");
      return;
    }

    try {
      setIsSaving(true);
      await onSave({
        total_payment: tot,
        advance_payment: adv,
        remaining_payment: rem,
        purpose: purpose.trim() || null,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err: any) {
      console.error("Failed to save payment details:", err);
      setErrorMsg(err.message || "Failed to save payment details");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const totNum = parseFloat(totalPayment) || 0;
  const advNum = parseFloat(advancePayment) || 0;
  const remNum = parseFloat(remainingPayment) || 0;
  const isFullyPaid = totNum > 0 && advNum >= totNum;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4.5 bg-gradient-to-r from-emerald-50/70 via-white to-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Paid Lead Details</span>
                <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 tracking-wider uppercase">
                  Payment Record
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Lead: <strong className="text-slate-700">{leadName || "Customer"}</strong> ({leadPhone})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Payment Summary Bar */}
          <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-center">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total</span>
              <p className="text-sm font-extrabold text-slate-900 mt-0.5">
                {totNum > 0 ? `$${totNum.toLocaleString()}` : "—"}
              </p>
            </div>
            <div className="border-x border-slate-200">
              <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Advance</span>
              <p className="text-sm font-extrabold text-emerald-700 mt-0.5">
                {advNum > 0 ? `$${advNum.toLocaleString()}` : "—"}
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">Remaining</span>
              <p className={`text-sm font-extrabold mt-0.5 ${isFullyPaid ? "text-emerald-600" : "text-amber-700"}`}>
                {isFullyPaid ? "Paid in Full ✓" : remNum > 0 ? `$${remNum.toLocaleString()}` : "—"}
              </p>
            </div>
          </div>

          {/* Payment Amounts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Total Payment */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Total Payment Amount <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">$</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={totalPayment}
                  onChange={(e) => handleTotalChange(e.target.value)}
                  placeholder="e.g. 500"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white pl-7 pr-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Full agreed price for the consultation or deal</p>
            </div>

            {/* Advance Payment */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Advance Payment Received
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-emerald-600">$</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={advancePayment}
                  onChange={(e) => handleAdvanceChange(e.target.value)}
                  placeholder="e.g. 200"
                  className="w-full rounded-xl border border-slate-200 bg-white pl-7 pr-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Amount client has already transferred</p>
            </div>
          </div>

          {/* Remaining Payment */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Remaining Payment Balance
              </label>
              <span className="text-[11px] font-semibold text-slate-400">
                (Auto-calculated: Total − Advance)
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-amber-600">$</span>
              <input
                type="number"
                step="any"
                min="0"
                value={remainingPayment}
                onChange={(e) => setRemainingPayment(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-7 pr-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Purpose */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Purpose / Service Description
            </label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. 1-on-1 Consultation, Package Onboarding, Advance Booking..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
            />
            {/* Quick chips */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] font-semibold text-slate-400">Quick suggestions:</span>
              {COMMON_PURPOSES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPurpose(p)}
                  className={`text-[10px] px-2 py-0.5 rounded-lg border font-medium transition-colors ${
                    purpose === p
                      ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-bold"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Notes & Remarks */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Payment & Lead Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add payment method (UPI / Bank Transfer / Stripe), transaction ID, balance due date, or customer expectations..."
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400 resize-none font-medium leading-relaxed"
            />
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-200 disabled:opacity-50 transition-all"
            >
              {isSaving ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              <span>{isSaving ? "Saving..." : "Save Paid Lead Details"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

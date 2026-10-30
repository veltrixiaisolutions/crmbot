"use client";

import React, { useEffect, useState } from "react";
import { 
  X, 
  History, 
  Clock, 
  ArrowRight, 
  User, 
  ShieldCheck, 
  Calendar, 
  RefreshCw,
  Globe,
  FileText
} from "lucide-react";
import { LeadStatusLog, getLeadStatusBadgeStyle, getLeadStatusLabel } from "@/lib/leadStatus";
import { 
  formatInTimezone, 
  useSelectedTimezone, 
  TIMEZONE_OPTIONS 
} from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface LeadStatusLogsModalProps {
  conversationId: string;
  leadName?: string | null;
  phone: string;
  currentStatus?: string | null;
  initialLogs?: LeadStatusLog[];
  onClose: () => void;
}

export function LeadStatusLogsModal({
  conversationId,
  leadName,
  phone,
  currentStatus,
  initialLogs,
  onClose,
}: LeadStatusLogsModalProps) {
  const [logs, setLogs] = useState<LeadStatusLog[]>(initialLogs || []);
  const [loading, setLoading] = useState<boolean>(!initialLogs || initialLogs.length === 0);
  const [selectedTimezone, setSelectedTimezone] = useSelectedTimezone("Asia/Kolkata");

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await api.get<LeadStatusLog[]>(`/conversations/${conversationId}/status-logs`);
      if (Array.isArray(res)) {
        setLogs(res);
      }
    } catch (err) {
      console.error("Failed to load status logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // If not provided or to ensure freshest logs
    fetchLogs();
  }, [conversationId]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const getRoleBadge = (role?: string | null) => {
    const r = (role || "staff").toLowerCase();
    if (r === "admin" || r === "superadmin") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <ShieldCheck className="h-3 w-3 text-amber-600" />
          Admin
        </span>
      );
    }
    if (r === "closer") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-800 border border-purple-200">
          <User className="h-3 w-3 text-purple-600" />
          Closer
        </span>
      );
    }
    if (r === "setter") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
          <User className="h-3 w-3 text-blue-600" />
          Setter
        </span>
      );
    }
    if (r === "system") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          <Globe className="h-3 w-3 text-slate-500" />
          System
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        <User className="h-3 w-3 text-slate-500" />
        {role || "Staff"}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-slate-50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 shadow-2xs">
              <History className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Lead Status Logs</h3>
                {currentStatus && (
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border",
                    getLeadStatusBadgeStyle(currentStatus)
                  )}>
                    {getLeadStatusLabel(currentStatus)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>{leadName ? leadName : "Lead"} ({phone})</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Timezone Switcher inside modal */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              {TIMEZONE_OPTIONS.map((tz) => (
                <button
                  key={tz.value}
                  type="button"
                  onClick={() => setSelectedTimezone(tz.value)}
                  className={cn(
                    "px-2 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1",
                    selectedTimezone === tz.value
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                  title={tz.label}
                >
                  <span>{tz.flag}</span>
                  <span>{tz.short}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Refresh logs"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin text-emerald-600")} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading && logs.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin text-emerald-500" />
              <p className="text-sm font-medium">Loading status change logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Clock className="h-10 w-10 mx-auto text-slate-300" />
              <p className="text-sm font-medium text-slate-600">No status change logs found</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Status changes made will be automatically recorded here with date, time, and staff details.
              </p>
            </div>
          ) : (
            <div className="relative pl-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200 space-y-6">
              {logs.map((log, index) => {
                const formattedTime = formatInTimezone(log.changed_at, selectedTimezone, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: true,
                  timeZoneName: "short",
                });

                return (
                  <div key={log.id || index} className="relative group">
                    {/* Timeline bullet */}
                    <div className="absolute -left-[27px] top-1.5 h-4 w-4 rounded-full border-2 border-white bg-emerald-500 shadow-2xs group-first:bg-emerald-600 group-first:ring-4 group-first:ring-emerald-100" />

                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 transition-all hover:bg-slate-50/80 hover:border-slate-300 hover:shadow-2xs">
                      {/* Top row: Status Transition + Date & Time */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {log.from_status ? (
                            <>
                              <span className={cn(
                                "text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border shadow-2xs",
                                getLeadStatusBadgeStyle(log.from_status)
                              )}>
                                {getLeadStatusLabel(log.from_status)}
                              </span>
                              <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className={cn(
                                "text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border shadow-2xs",
                                getLeadStatusBadgeStyle(log.to_status)
                              )}>
                                {getLeadStatusLabel(log.to_status)}
                              </span>
                            </>
                          ) : (
                            <span className={cn(
                              "text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border shadow-2xs",
                              getLeadStatusBadgeStyle(log.to_status)
                            )}>
                              {getLeadStatusLabel(log.to_status)}
                            </span>
                          )}
                          {!log.from_status && (
                            <span className="text-[11px] font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-md">
                              Lead Created
                            </span>
                          )}
                        </div>

                        {/* Date and Time */}
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                          <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                          <span>{formattedTime}</span>
                        </div>
                      </div>

                      {/* Middle row: Changed by */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 text-xs text-slate-600">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Changed by:</span>
                          <span className="font-semibold text-slate-800">
                            {log.changed_by_name || log.changed_by_email || "System"}
                          </span>
                          {log.changed_by_email && log.changed_by_email !== log.changed_by_name && (
                            <span className="text-slate-400 text-[11px]">({log.changed_by_email})</span>
                          )}
                        </div>
                        <div>
                          {getRoleBadge(log.changed_by_role)}
                        </div>
                      </div>

                      {/* Notes (if any) */}
                      {log.notes && (
                        <div className="mt-2.5 p-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 flex items-start gap-2">
                          <FileText className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                          <p className="italic">{log.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-[11px] text-slate-500">
            Total {logs.length} status change log{logs.length === 1 ? "" : "s"} recorded
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

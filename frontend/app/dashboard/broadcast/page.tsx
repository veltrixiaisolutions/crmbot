"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Send, 
  Users, 
  FileText, 
  Upload, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  History, 
  Calendar, 
  Check, 
  X, 
  Filter, 
  Search, 
  AlertTriangle,
  Eye,
  EyeOff,
  ChevronRight,
  TrendingUp,
  Inbox,
  UserCheck,
  PhoneCall
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LEAD_STATUS_OPTIONS, normalizeLeadStatus, getLeadStatusBadgeStyle } from "@/lib/leadStatus";
import { TimezoneSelector } from "@/components/TimezoneSelector";
import { CopyButton } from "../_components/CopyButton";

interface StaffUser {
  id: string;
  name?: string;
  email: string;
  role: string;
  staff_type?: string;
}

interface ConversationItem {
  id: string;
  wa_user_phone: string;
  lead_name?: string | null;
  lead_status?: string;
  status: "bot" | "human";
  assigned_to?: string | null;
  assigned_name?: string | null;
  assigned_email?: string | null;
  last_message_at?: string;
}

interface ParsedContact {
  phone: string;
  name?: string;
  isValid: boolean;
  error?: string;
}

interface BroadcastSummary {
  id: string;
  campaign_name: string;
  message: string;
  created_by_name?: string | null;
  created_at: string;
  total: number;
  sent_count: number;
  failed_count: number;
}

interface BroadcastDetail extends BroadcastSummary {
  results: Array<{
    phone: string;
    name?: string | null;
    status: string;
    error?: string | null;
    wa_message_id?: string | null;
  }>;
}

const QUICK_TEMPLATES = [
  {
    label: "Follow-up",
    text: "Hi {{name}}, just following up on your inquiry with us. Please let us know if you have any questions or if you'd like to schedule a quick call!",
  },
  {
    label: "Special Offer",
    text: "Hello {{name}}! We are currently running an exclusive offer on our services. Reply to this message to claim your priority discount today.",
  },
  {
    label: "Re-engagement",
    text: "Namaste {{name}}! We noticed it's been a little while since we last spoke. We'd love to know how we can best support your requirements.",
  },
  {
    label: "Check-in",
    text: "Hi {{name}}, our team is available right now. Are you free for a 5-minute chat to discuss your project?",
  },
];

export default function BulkBroadcastPage() {
  const [activeTab, setActiveTab] = useState<"compose" | "history">("compose");
  const [audienceSource, setAudienceSource] = useState<"crm" | "manual">("crm");

  // CRM Leads Audience State
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(true);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  // CRM Filters
  const [filterStage, setFilterStage] = useState<string>("all");
  const [filterStaff, setFilterStaff] = useState<string>("all");
  const [filterMode, setFilterMode] = useState<string>("all");
  const [searchLeadQuery, setSearchLeadQuery] = useState("");

  // Manual / CSV Audience State
  const [rawContactsText, setRawContactsText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Message Composer State
  const [campaignName, setCampaignName] = useState("");
  const [messageText, setMessageText] = useState("");
  const [showPhonePreview, setShowPhonePreview] = useState(true);

  // Execution & Progress State
  const [isSending, setIsSending] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [lastBroadcastResult, setLastBroadcastResult] = useState<any | null>(null);

  // History State
  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastSummary[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [viewDetailModal, setViewDetailModal] = useState<BroadcastDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Load CRM leads and staff
  const loadLeadsAndStaff = async () => {
    try {
      setIsLoadingLeads(true);
      const [convs, staffs] = await Promise.all([
        api.get<ConversationItem[]>("/conversations").catch(() => []),
        api.get<StaffUser[]>("/users/staff").catch(() => []),
      ]);
      setConversations(convs);
      setStaffList(staffs);

      // Default select all loaded leads
      const allIds = new Set(convs.map((c) => c.id));
      setSelectedLeadIds(allIds);
    } catch (err: any) {
      console.error("Failed to load leads data:", err);
    } finally {
      setIsLoadingLeads(false);
    }
  };

  // Load Broadcast History
  const loadHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const res = await api.get<BroadcastSummary[]>("/conversations/broadcasts");
      setBroadcastHistory(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error("Failed to load broadcast history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadLeadsAndStaff();
    loadHistory();
    setCampaignName(`Broadcast ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  }, []);

  // Filtered CRM Leads
  const filteredCrmLeads = useMemo(() => {
    return conversations.filter((c) => {
      const q = searchLeadQuery.toLowerCase().trim();
      if (q) {
        const matchesPhone = c.wa_user_phone.toLowerCase().includes(q);
        const matchesName = (c.lead_name || "").toLowerCase().includes(q);
        const matchesAssigned = (c.assigned_name || c.assigned_email || "").toLowerCase().includes(q);
        if (!matchesPhone && !matchesName && !matchesAssigned) return false;
      }

      if (filterStage !== "all" && normalizeLeadStatus(c.lead_status) !== filterStage) return false;
      if (filterMode !== "all" && c.status !== filterMode) return false;
      if (filterStaff !== "all") {
        if (filterStaff === "unassigned" && c.assigned_to) return false;
        if (filterStaff !== "unassigned" && c.assigned_to !== filterStaff) return false;
      }

      return true;
    });
  }, [conversations, searchLeadQuery, filterStage, filterMode, filterStaff]);

  // Parsed Manual Contacts
  const parsedManualContacts = useMemo<ParsedContact[]>(() => {
    if (!rawContactsText.trim()) return [];
    const lines = rawContactsText.split(/[\r\n]+/);
    const results: ParsedContact[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Check if format is "phone, name" or "phone\tname" or just "phone"
      let phonePart = line;
      let namePart: string | undefined = undefined;

      if (line.includes(",")) {
        const parts = line.split(",");
        phonePart = parts[0].trim();
        namePart = parts.slice(1).join(",").trim();
      } else if (line.includes("\t")) {
        const parts = line.split("\t");
        phonePart = parts[0].trim();
        namePart = parts.slice(1).join(" ").trim();
      }

      const cleanDigits = phonePart.replace(/[^\d]/g, "");
      const isValid = cleanDigits.length >= 7;

      results.push({
        phone: cleanDigits,
        name: namePart || undefined,
        isValid,
        error: !isValid ? "Must contain at least 7 digits" : undefined,
      });
    }

    return results;
  }, [rawContactsText]);

  // Final Target Recipients
  const targetRecipients = useMemo(() => {
    if (audienceSource === "crm") {
      return filteredCrmLeads
        .filter((c) => selectedLeadIds.has(c.id))
        .map((c) => ({
          phone: c.wa_user_phone.replace(/[^\d]/g, ""),
          name: c.lead_name || null,
          conversation_id: c.id,
        }));
    } else {
      return parsedManualContacts
        .filter((c) => c.isValid)
        .map((c) => ({
          phone: c.phone,
          name: c.name || null,
          conversation_id: null,
        }));
    }
  }, [audienceSource, filteredCrmLeads, selectedLeadIds, parsedManualContacts]);

  // CSV File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const lines = text.split(/[\r\n]+/);
      const parsedLines: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Skip CSV headers like "Phone,Name"
        if (i === 0 && (line.toLowerCase().includes("phone") || line.toLowerCase().includes("number"))) {
          continue;
        }
        parsedLines.push(line);
      }

      setRawContactsText((prev) => (prev ? `${prev}\n${parsedLines.join("\n")}` : parsedLines.join("\n")));
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Toggle selection
  const toggleSelectLead = (id: string) => {
    const next = new Set(selectedLeadIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLeadIds(next);
  };

  const selectAllFilteredLeads = () => {
    const next = new Set(selectedLeadIds);
    filteredCrmLeads.forEach((c) => next.add(c.id));
    setSelectedLeadIds(next);
  };

  const deselectAllFilteredLeads = () => {
    const next = new Set(selectedLeadIds);
    filteredCrmLeads.forEach((c) => next.delete(c.id));
    setSelectedLeadIds(next);
  };

  // Handle Dispatch
  const handleLaunchBroadcast = async () => {
    if (!messageText.trim()) {
      setGeneralError("Please enter a message before launching the broadcast.");
      return;
    }
    if (targetRecipients.length === 0) {
      setGeneralError("No valid recipients selected. Please configure your audience.");
      return;
    }

    setGeneralError(null);
    setIsSending(true);

    try {
      const payload = {
        conversation_ids: targetRecipients
          .map((r) => r.conversation_id)
          .filter((id): id is string => Boolean(id)),
        recipients: targetRecipients.map((r) => ({
          phone: r.phone,
          name: r.name,
          conversation_id: r.conversation_id,
        })),
        message: messageText.trim(),
        campaign_name: campaignName.trim() || undefined,
      };

      const res = await api.post<any>("/conversations/bulk-message", payload);
      setLastBroadcastResult(res);
      loadHistory();
      loadLeadsAndStaff();
    } catch (err: any) {
      console.error("Broadcast failed:", err);
      setGeneralError(err.message || "Failed to launch bulk broadcast");
    } finally {
      setIsSending(false);
    }
  };

  // View specific broadcast detail
  const handleOpenBroadcastDetail = async (id: string) => {
    try {
      setIsLoadingDetail(true);
      const detail = await api.get<BroadcastDetail>(`/conversations/broadcasts/${id}`);
      setViewDetailModal(detail);
    } catch (err) {
      console.error("Failed to load broadcast detail:", err);
      alert("Could not load broadcast details");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Preview sample
  const sampleRecipient = targetRecipients[0];
  const sampleName = sampleRecipient?.name || "Rahul Sharma";
  const previewText = messageText
    ? messageText.replace(/\{\{\s*name\s*\}\}|\{\s*name\s*\}/gi, sampleName)
    : "Your WhatsApp message text will appear here...";

  // Stats calculation
  const totalCampaignsCount = broadcastHistory.length;
  const totalDeliveredCount = broadcastHistory.reduce((acc, b) => acc + (b.sent_count || 0), 0);
  const totalTargetedCount = broadcastHistory.reduce((acc, b) => acc + (b.total || 0), 0);
  const overallSuccessRate = totalTargetedCount > 0 ? Math.round((totalDeliveredCount / totalTargetedCount) * 100) : 100;

  return (
    <div className="space-y-8 pb-16">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bulk WhatsApp Broadcasts</h1>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
              Active Service
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Launch personalized bulk WhatsApp outreach campaigns to your CRM pipeline or import contact lists.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setActiveTab("compose");
              setLastBroadcastResult(null);
            }}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer shadow-xs",
              activeTab === "compose"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            )}
          >
            <Send className="h-3.5 w-3.5" />
            <span>New Campaign</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("history");
              loadHistory();
            }}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer shadow-xs",
              activeTab === "history"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            )}
          >
            <History className="h-3.5 w-3.5" />
            <span>Campaign History ({totalCampaignsCount})</span>
          </button>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Total Broadcasts</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Send className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{totalCampaignsCount}</div>
          <span className="text-[11px] text-slate-400">Executed campaigns</span>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Messages Delivered</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600">{totalDeliveredCount}</div>
          <span className="text-[11px] text-slate-400">Successfully sent</span>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Overall Success Rate</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{overallSuccessRate}%</div>
          <span className="text-[11px] text-slate-400">Across all dispatches</span>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <span>CRM Total Leads</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Users className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{conversations.length}</div>
          <span className="text-[11px] text-slate-400">Available in database</span>
        </div>
      </div>

      {/* Main Container */}
      {activeTab === "compose" ? (
        <div className="space-y-6">
          {/* General Error Banner */}
          {generalError && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-bold">Error Launching Campaign</p>
                <p className="mt-0.5 text-rose-700">{generalError}</p>
              </div>
            </div>
          )}

          {/* Last Broadcast Success Summary Modal/Card */}
          {lastBroadcastResult && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-emerald-950">Broadcast Successfully Launched!</h3>
                    <p className="text-xs text-emerald-800 mt-0.5">{lastBroadcastResult.message}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white px-3 py-1.5 border border-emerald-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Sent</span>
                    <span className="text-base font-bold text-emerald-600">{lastBroadcastResult.sent_count}</span>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-1.5 border border-emerald-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Failed</span>
                    <span className="text-base font-bold text-rose-600">{lastBroadcastResult.failed_count}</span>
                  </div>
                  <button
                    onClick={() => setLastBroadcastResult(null)}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-emerald-100/50"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Delivery Details Table */}
              {lastBroadcastResult.results && lastBroadcastResult.results.length > 0 && (
                <div className="mt-4 rounded-xl border border-emerald-200/80 bg-white overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase text-slate-400 font-bold">
                      <tr>
                        <th className="px-4 py-2">Contact</th>
                        <th className="px-4 py-2">Phone</th>
                        <th className="px-4 py-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {lastBroadcastResult.results.map((r: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-1.5 font-sans font-semibold text-slate-800">{r.name || "Unknown"}</td>
                          <td className="px-4 py-1.5 text-slate-600">{r.phone}</td>
                          <td className="px-4 py-1.5 text-right font-sans">
                            {r.status === "sent" ? (
                              <span className="text-emerald-600 font-bold">✓ Delivered</span>
                            ) : (
                              <span className="text-rose-600 font-bold" title={r.error || ""}>
                                ✕ {r.error ? (r.error.length > 25 ? r.error.slice(0, 25) + "..." : r.error) : "Failed"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 2-Column Layout: Left (Audience + Message) & Right (Live Preview + Summary) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column (8 cols): Audience Selector + Message Composer */}
            <div className="lg:col-span-7 space-y-6">
              {/* Card 1: Campaign Details */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-white text-xs font-bold">
                    1
                  </div>
                  <h2 className="text-sm font-bold text-slate-900">Campaign Details</h2>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Campaign Name <span className="text-slate-400 font-normal">(for reporting and tracking)</span>
                  </label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g. VIP Client Follow-up, Product Announcement"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
              </div>

              {/* Card 2: Select Audience */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-white text-xs font-bold">
                      2
                    </div>
                    <h2 className="text-sm font-bold text-slate-900">Select Target Audience</h2>
                  </div>

                  {/* Mode switcher */}
                  <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setAudienceSource("crm")}
                      className={cn(
                        "rounded-lg px-3 py-1.5 transition-all cursor-pointer",
                        audienceSource === "crm"
                          ? "bg-white text-slate-900 shadow-2xs font-bold"
                          : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      CRM Pipeline ({filteredCrmLeads.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudienceSource("manual")}
                      className={cn(
                        "rounded-lg px-3 py-1.5 transition-all cursor-pointer",
                        audienceSource === "manual"
                          ? "bg-white text-slate-900 shadow-2xs font-bold"
                          : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      Paste / CSV Upload
                    </button>
                  </div>
                </div>

                {audienceSource === "crm" ? (
                  <div className="space-y-3">
                    {/* Filter controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                          Pipeline Stage
                        </label>
                        <select
                          value={filterStage}
                          onChange={(e) => setFilterStage(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-600"
                        >
                          <option value="all">All Pipeline Stages</option>
                          {LEAD_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                          Assigned Staff
                        </label>
                        <select
                          value={filterStaff}
                          onChange={(e) => setFilterStaff(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-600"
                        >
                          <option value="all">All Team Members</option>
                          <option value="unassigned">Unassigned Leads Only</option>
                          {staffList.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name || s.email}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                          Handling Mode
                        </label>
                        <select
                          value={filterMode}
                          onChange={(e) => setFilterMode(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-600"
                        >
                          <option value="all">All Modes</option>
                          <option value="human">Human Agent</option>
                          <option value="bot">AI Bot</option>
                        </select>
                      </div>
                    </div>

                    {/* Search & Bulk Select Toolbar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
                      <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={searchLeadQuery}
                          onChange={(e) => setSearchLeadQuery(e.target.value)}
                          placeholder="Search lead name or phone..."
                          className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-600"
                        />
                      </div>

                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={selectAllFilteredLeads}
                          className="text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg border border-indigo-200"
                        >
                          Select All ({filteredCrmLeads.length})
                        </button>
                        <button
                          type="button"
                          onClick={deselectAllFilteredLeads}
                          className="text-slate-500 hover:text-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>

                    {/* Leads Selection Table */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden max-h-56 overflow-y-auto">
                      {filteredCrmLeads.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          No leads match the selected filters
                        </div>
                      ) : (
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-400 font-bold sticky top-0">
                            <tr>
                              <th className="px-3 py-2 w-8">
                                <input
                                  type="checkbox"
                                  checked={
                                    filteredCrmLeads.length > 0 &&
                                    filteredCrmLeads.every((c) => selectedLeadIds.has(c.id))
                                  }
                                  onChange={(e) => {
                                    if (e.target.checked) selectAllFilteredLeads();
                                    else deselectAllFilteredLeads();
                                  }}
                                  className="h-3.5 w-3.5 rounded text-indigo-600 cursor-pointer"
                                />
                              </th>
                              <th className="px-2 py-2">Lead Contact</th>
                              <th className="px-2 py-2">Stage</th>
                              <th className="px-2 py-2">Assigned Staff</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredCrmLeads.map((c) => {
                              const isChecked = selectedLeadIds.has(c.id);
                              return (
                                <tr
                                  key={c.id}
                                  onClick={() => toggleSelectLead(c.id)}
                                  className={cn(
                                    "cursor-pointer transition-colors",
                                    isChecked ? "bg-indigo-50/40 hover:bg-indigo-50/60" : "hover:bg-slate-50/70"
                                  )}
                                >
                                  <td className="px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {}}
                                      className="h-3.5 w-3.5 rounded text-indigo-600 cursor-pointer"
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <span className="font-bold text-slate-900 block truncate max-w-[140px]">
                                      {c.lead_name || "Unknown Lead"}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-mono">{c.wa_user_phone}</span>
                                  </td>
                                  <td className="px-2 py-2">
                                    <span
                                      className={cn(
                                        "inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                                        getLeadStatusBadgeStyle(c.lead_status)
                                      )}
                                    >
                                      {c.lead_status || "not contacted"}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-slate-500 text-[11px] truncate max-w-[120px]">
                                    {c.assigned_name || c.assigned_email || "Unassigned"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Manual & CSV Upload Area */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700">
                        Paste Phone Numbers or Upload CSV
                      </label>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer"
                      >
                        <Upload className="h-3.5 w-3.5 text-slate-500" />
                        <span>Upload .CSV / .TXT</span>
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.txt"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </div>

                    <textarea
                      rows={5}
                      value={rawContactsText}
                      onChange={(e) => setRawContactsText(e.target.value)}
                      placeholder={`Enter phone numbers (one per line or comma separated):
+91 98765 43210, Priya Patel
919876543211, Ramesh Kumar
9876543212`}
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs font-mono text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 resize-none"
                    />

                    {/* Parsing feedback */}
                    {parsedManualContacts.length > 0 && (
                      <div className="flex items-center justify-between text-xs px-1 text-slate-500">
                        <span className="font-semibold text-emerald-600">
                          ✓ {parsedManualContacts.filter((c) => c.isValid).length} Valid Contacts Parsed
                        </span>
                        {parsedManualContacts.filter((c) => !c.isValid).length > 0 && (
                          <span className="text-rose-500 font-semibold">
                            ✕ {parsedManualContacts.filter((c) => !c.isValid).length} Invalid Phone Numbers
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card 3: Compose WhatsApp Message */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-white text-xs font-bold">
                      3
                    </div>
                    <h2 className="text-sm font-bold text-slate-900">Compose Message</h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMessageText((prev) => (prev ? `${prev} {{name}}` : "{{name}}"))}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-md border border-indigo-200 transition-colors"
                  >
                    <Sparkles className="h-3 w-3" />
                    Insert Variable: &#123;&#123;name&#125;&#125;
                  </button>
                </div>

                {/* Templates Bar */}
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Pre-made Templates:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {QUICK_TEMPLATES.map((tmpl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setMessageText(tmpl.text)}
                        className="rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-indigo-50/60 hover:border-indigo-300 p-2 text-left text-xs text-slate-700 transition-all font-medium truncate"
                        title={tmpl.text}
                      >
                        ⚡ {tmpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message text area */}
                <div>
                  <textarea
                    rows={6}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type your WhatsApp message text here... E.g. Hi {{name}}, we have a special announcement for you!"
                    className="w-full rounded-xl border border-slate-200 p-3.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-all resize-none font-sans"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 px-1">
                    <span>*bold*, _italic_, ~strikethrough~ supported</span>
                    <span>{messageText.length} characters</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column (5 cols): Preview + Dispatch Execution Card */}
            <div className="lg:col-span-5 space-y-6">
              {/* WhatsApp Device Preview Box */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-white text-xs font-bold">
                      4
                    </div>
                    <h2 className="text-sm font-bold text-slate-900">WhatsApp Live Preview</h2>
                  </div>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                    Sample: {sampleName}
                  </span>
                </div>

                {/* Realistic Phone Screen */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm bg-[#EFEAE2]">
                  {/* WhatsApp chat top bar */}
                  <div className="bg-[#075E54] text-white px-3.5 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-800 font-bold text-xs">
                        {sampleName.charAt(0)}
                      </div>
                      <div className="leading-tight">
                        <div className="text-xs font-bold">{sampleName}</div>
                        <div className="text-[9px] text-emerald-100 font-mono">
                          {sampleRecipient?.phone || "+91 98765 43210"}
                        </div>
                      </div>
                    </div>
                    <span className="text-[9px] bg-emerald-800 px-1.5 py-0.5 rounded text-emerald-100">Verified</span>
                  </div>

                  {/* Chat bubble background */}
                  <div className="p-4 min-h-[170px] flex flex-col justify-end">
                    <div className="max-w-[85%] rounded-xl rounded-tl-none bg-[#DCF8C6] p-3 text-xs text-slate-900 shadow-sm whitespace-pre-wrap border border-[#c4eab0] relative ml-auto sm:ml-0">
                      <p className="leading-relaxed">{previewText}</p>
                      <div className="flex items-center justify-end gap-1 mt-1.5 text-[9px] text-slate-500 font-mono">
                        <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        <span className="text-emerald-600 font-bold">✓✓</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Meta API disclaimer */}
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 border border-amber-200/80 text-[11px] text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <p className="leading-relaxed">
                    Custom text messages are sent directly from your WhatsApp Cloud API business number. Personalization tags like <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">&#123;&#123;name&#125;&#125;</code> will automatically adapt to each lead.
                  </p>
                </div>
              </div>

              {/* Action / Launch Card */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Launch Summary</h3>

                <div className="space-y-2 text-xs divide-y divide-slate-100">
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Audience Source:</span>
                    <span className="font-semibold text-slate-900">
                      {audienceSource === "crm" ? "CRM Leads Pipeline" : "Manual / CSV Import"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Target Recipients:</span>
                    <span className="font-bold text-indigo-600 text-sm">
                      {targetRecipients.length} contact{targetRecipients.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Message Size:</span>
                    <span className="font-semibold text-slate-900">{messageText.length} characters</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isSending || targetRecipients.length === 0 || !messageText.trim()}
                  onClick={handleLaunchBroadcast}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 text-sm shadow-md shadow-emerald-600/20 active:scale-[0.98] transition-all cursor-pointer"
                >
                  {isSending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Sending Broadcast ({targetRecipients.length})...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>Launch WhatsApp Broadcast ({targetRecipients.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* History Tab */
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/60">
            <div>
              <h2 className="text-base font-bold text-slate-900">Past Broadcast Campaigns</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Review previous bulk message runs, success statistics, and delivery reports.
              </p>
            </div>
            <button
              onClick={loadHistory}
              disabled={isLoadingHistory}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoadingHistory && "animate-spin text-indigo-600")} />
              <span>Refresh History</span>
            </button>
          </div>

          {isLoadingHistory ? (
            <div className="flex h-64 items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : broadcastHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3">
                <Send className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">No campaigns launched yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Compose your first bulk WhatsApp message campaign to reach your leads simultaneously.
              </p>
              <button
                onClick={() => setActiveTab("compose")}
                className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Create First Campaign
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                  <tr>
                    <th className="px-6 py-3.5">Campaign Name</th>
                    <th className="px-4 py-3.5">Sent Date</th>
                    <th className="px-4 py-3.5">Message Snippet</th>
                    <th className="px-4 py-3.5">Recipients</th>
                    <th className="px-4 py-3.5">Delivery Status</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {broadcastHistory.map((b) => {
                    const rate = b.total > 0 ? Math.round((b.sent_count / b.total) * 100) : 0;
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900 block">{b.campaign_name}</span>
                          <span className="text-[11px] text-slate-400">By {b.created_by_name || "Admin"}</span>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-500 font-medium">
                          {new Date(b.created_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-4 max-w-xs truncate text-xs text-slate-600">
                          {b.message}
                        </td>
                        <td className="px-4 py-4 text-xs font-semibold text-slate-800">
                          {b.total} contact{b.total === 1 ? "" : "s"}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                              ✓ {b.sent_count} sent
                            </span>
                            {b.failed_count > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200">
                                ✕ {b.failed_count} failed
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenBroadcastDetail(b.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs"
                          >
                            <span>View Report</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Broadcast Detailed Logs Modal */}
      {viewDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setViewDetailModal(null)} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh] z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/70">
              <div>
                <h3 className="text-base font-bold text-slate-900">{viewDetailModal.campaign_name}</h3>
                <span className="text-xs text-slate-400">
                  {new Date(viewDetailModal.created_at).toLocaleString()} • Dispatched by {viewDetailModal.created_by_name || "Admin"}
                </span>
              </div>
              <button
                onClick={() => setViewDetailModal(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Message Content */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Message Dispatched:
                </span>
                <p className="text-xs text-slate-800 whitespace-pre-wrap">{viewDetailModal.message}</p>
              </div>

              {/* Stats overview */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-slate-200 p-2.5">
                  <span className="text-xs text-slate-500">Total Audience</span>
                  <div className="text-lg font-bold text-slate-900">{viewDetailModal.total}</div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5">
                  <span className="text-xs text-emerald-700 font-semibold">Delivered</span>
                  <div className="text-lg font-bold text-emerald-700">{viewDetailModal.sent_count}</div>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-2.5">
                  <span className="text-xs text-rose-700 font-semibold">Failed</span>
                  <div className="text-lg font-bold text-rose-700">{viewDetailModal.failed_count}</div>
                </div>
              </div>

              {/* Contact Breakdown */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-700 flex justify-between">
                  <span>Recipient Log</span>
                  <span>{viewDetailModal.results.length} contacts</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto text-xs">
                  {viewDetailModal.results.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2 hover:bg-slate-50/50">
                      <div>
                        <span className="font-bold text-slate-900 block">{r.name || "Unknown"}</span>
                        <span className="text-[10px] font-mono text-slate-400">{r.phone}</span>
                      </div>
                      <div>
                        {r.status === "sent" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                            ✓ Delivered
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200" title={r.error || ""}>
                            ✕ {r.error ? (r.error.length > 25 ? r.error.slice(0, 25) + "..." : r.error) : "Failed"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 px-6 py-3.5 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setViewDetailModal(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

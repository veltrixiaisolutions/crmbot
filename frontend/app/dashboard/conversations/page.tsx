"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { 
  Inbox, 
  User, 
  MessageCircle, 
  Clock, 
  ShieldCheck, 
  ChevronRight, 
  ChevronLeft,
  UserPlus, 
  Handshake, 
  Search, 
  Filter, 
  RefreshCw,
  ExternalLink,
  Target,
  CheckCircle2,
  TrendingUp,
  Bot,
  StickyNote,
  UserCheck,
  CheckSquare,
  Users,
  Check,
  X,
  Sparkles,
  Edit3,
  CreditCard,
  History,
  MessageSquarePlus,
  Send,
  Ban
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "../_components/CopyButton";
import { 
  LEAD_STATUS_OPTIONS, 
  normalizeLeadStatus, 
  getLeadStatusBadgeStyle,
  LeadStatusLog
} from "@/lib/leadStatus";
import { formatInTimezone, useSelectedTimezone } from "@/lib/timezone";
import { TimezoneSelector } from "@/components/TimezoneSelector";
import { PaymentModal, PaymentDetails } from "@/components/PaymentModal";
import { MessageStatusTick } from "@/components/MessageStatusTick";
import { LeadStatusLogsModal } from "@/components/LeadStatusLogsModal";
import { NewChatModal } from "@/components/NewChatModal";
import { BulkMessageModal } from "@/components/BulkMessageModal";
import { BlockChatModal } from "@/components/BlockChatModal";


type Conversation = {
  id: string;
  wa_user_phone: string;
  status: "bot" | "human";
  lead_status: string;
  lead_name?: string;
  assigned_to?: string | null;
  assigned_name?: string;
  assigned_email?: string;
  setter_name?: string;
  setter_email?: string;
  closer_name?: string;
  closer_email?: string;
  notes?: string | null;
  payment?: PaymentDetails | null;
  lead_status_logs?: LeadStatusLog[];
  last_message_at: string;
  created_at?: string;
  last_message_text?: string | null;
  last_message_direction?: "in" | "out" | null;
  last_message_status?: string | null;
  has_unread?: boolean;
  unread_count?: number;
  is_blocked?: boolean;
  blocked_at?: string | null;
  blocked_by_name?: string | null;
  blocked_reason?: string | null;
};

type StaffUser = {
  id: string;
  name?: string;
  email: string;
  staff_type: "general" | "setter" | "closer";
  status?: "offline" | "online" | "break" | "in_meet";
  is_active?: boolean;
};

const isStaffOnline = (u: StaffUser) => {
  if (u.is_active !== undefined) return Boolean(u.is_active);
  return u.status === "online" || u.status === "in_meet";
};

const staffLabel = (u: StaffUser, extra: string) =>
  `${u.name || u.email.split("@")[0]} (${extra})${isStaffOnline(u) ? "" : " (offline)"}`;

// In-memory cache to prevent flashing loading spinner on back navigation
let cachedAdminConvsData: {
  conversations: Conversation[];
  staff: StaffUser[];
  tenantTimezone: string;
} | null = null;

export default function AdminLeadsTrackingPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>(() => cachedAdminConvsData?.conversations || []);
  const [staff, setStaff] = useState<StaffUser[]>(() => cachedAdminConvsData?.staff || []);
  const [tenantTimezone, setTenantTimezone] = useSelectedTimezone("Asia/Kolkata");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(() => !cachedAdminConvsData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("veltrix_admin_convs_search") || "";
    }
    return "";
  });
  const [stageFilter, setStageFilter] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("veltrix_admin_convs_stage") || "all";
    }
    return "all";
  });
  const [modeFilter, setModeFilter] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("veltrix_admin_convs_mode") || "all";
    }
    return "all";
  });
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);

  const unreadTotalCount = useMemo(() => {
    return conversations.filter(c => Boolean(c.has_unread || (c.unread_count && c.unread_count > 0))).length;
  }, [conversations]);
  
  // Bulk Assignment & Messaging State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStaffId, setBulkStaffId] = useState<string>("");
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);
  const [isBulkMessageModalOpen, setIsBulkMessageModalOpen] = useState(false);

  const selectedRecipients = useMemo(() => {
    return conversations
      .filter((c) => selectedIds.includes(c.id))
      .map((c) => ({
        id: c.id,
        lead_name: c.lead_name,
        wa_user_phone: c.wa_user_phone,
      }));
  }, [conversations, selectedIds]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window !== "undefined") {
      const p = sessionStorage.getItem("veltrix_admin_convs_page");
      return p ? parseInt(p, 10) : 1;
    }
    return 1;
  });
  const [pageSize, setPageSize] = useState(10);

  // Rename Lead State
  const [editingNameConvId, setEditingNameConvId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [paymentModalConv, setPaymentModalConv] = useState<Conversation | null>(null);
  const [statusLogsModalConv, setStatusLogsModalConv] = useState<Conversation | null>(null);
  const [blockingConv, setBlockingConv] = useState<Conversation | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("veltrix_admin_convs_page", String(currentPage));
    }
  }, [currentPage]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("veltrix_admin_convs_search", searchQuery);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("veltrix_admin_convs_stage", stageFilter);
    }
  }, [stageFilter]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("veltrix_admin_convs_mode", modeFilter);
    }
  }, [modeFilter]);

  const handleSaveLeadName = async (convId: string) => {
    try {
      setIsSavingName(true);
      const trimmed = nameInput.trim();
      const updated = await api.patch<Conversation>(`/conversations/${convId}/status`, {
        lead_name: trimmed || null,
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, lead_name: updated.lead_name } : c))
      );
      setEditingNameConvId(null);
    } catch (err: any) {
      console.error("Failed to rename lead:", err);
      alert(err.message || "Failed to rename lead");
    } finally {
      setIsSavingName(false);
    }
  };

  const fetchData = async (isManual = false) => {
    try {
      if (isManual) setIsRefreshing(true);
      const [convsData, staffData, tenantData] = await Promise.all([
        api.get<Conversation[]>("/conversations"),
        api.get<StaffUser[]>("/users/staff"),
        api.get<{ timezone?: string }>("/tenants/me").catch(() => ({ timezone: "America/New_York" }))
      ]);
      setConversations(convsData);
      setStaff(staffData);
      if (tenantData.timezone) setTenantTimezone(tenantData.timezone);
      cachedAdminConvsData = {
        conversations: convsData,
        staff: staffData,
        tenantTimezone: tenantData.timezone || "America/New_York",
      };
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setIsLoading(false);
      if (isManual) setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  useEffect(() => {
    fetchData(!cachedAdminConvsData);
    const interval = setInterval(() => {
      fetchData(false);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleTransferLead(convId: string, newStaffId: string) {
    try {
      const updated = await api.patch<Conversation>(`/conversations/${convId}/status`, {
        assigned_to: newStaffId === "unassigned" ? null : newStaffId,
      });
      setConversations(prev => prev.map(c => c.id === convId ? updated : c));
    } catch (err: any) {
      alert("Failed to transfer lead: " + err.message);
    }
  }

  async function handleUpdateStage(convId: string, newStage: string) {
    if (newStage === "paid lead") {
      const conv = conversations.find(c => c.id === convId);
      if (conv) {
        setPaymentModalConv(conv);
        return;
      }
    }

    try {
      const updated = await api.patch<Conversation>(`/conversations/${convId}/status`, {
        lead_status: newStage,
      });
      setConversations(prev => prev.map(c => c.id === convId ? updated : c));
    } catch (err: any) {
      alert("Failed to update stage: " + err.message);
    }
  }

  const handleSavePayment = async (paymentData: PaymentDetails) => {
    if (!paymentModalConv) return;
    const convId = paymentModalConv.id;
    try {
      const updated = await api.patch<Conversation>(`/conversations/${convId}/status`, {
        lead_status: "paid lead",
        payment: paymentData,
        notes: paymentData.notes || paymentModalConv.notes || null,
      });
      setConversations(prev => prev.map(c => c.id === convId ? updated : c));
      setPaymentModalConv(null);
    } catch (err: any) {
      console.error("Failed to save payment details:", err);
      alert(err.message || "Failed to save payment details");
      throw err;
    }
  };

  // Filtered dataset
  const filteredConversations = useMemo(() => {
    return conversations
      .filter(c => {
        const q = searchQuery.toLowerCase();
        const matchesSearch = 
          c.wa_user_phone.toLowerCase().includes(q) ||
          (c.lead_name && c.lead_name.toLowerCase().includes(q)) ||
          (c.assigned_email && c.assigned_email.toLowerCase().includes(q)) ||
          (c.assigned_name && c.assigned_name.toLowerCase().includes(q)) ||
          (c.setter_email && c.setter_email.toLowerCase().includes(q)) ||
          (c.setter_name && c.setter_name.toLowerCase().includes(q)) ||
          (c.closer_email && c.closer_email.toLowerCase().includes(q)) ||
          (c.closer_name && c.closer_name.toLowerCase().includes(q));
        if (!matchesSearch) return false;

        if (stageFilter === "blocked") {
          if (!c.is_blocked) return false;
        } else if (stageFilter !== "all" && normalizeLeadStatus(c.lead_status) !== stageFilter) {
          return false;
        }
        if (modeFilter !== "all" && c.status !== modeFilter) return false;

        if (unreadOnly) {
          const isUnread = Boolean(c.has_unread || (c.unread_count && c.unread_count > 0));
          if (!isUnread) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const timeB = new Date(b.last_message_at || b.created_at || 0).getTime();
        const timeA = new Date(a.last_message_at || a.created_at || 0).getTime();
        return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
      });
  }, [conversations, searchQuery, stageFilter, modeFilter, unreadOnly]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredConversations.length / pageSize));
  const paginatedConversations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredConversations.slice(start, start + pageSize);
  }, [filteredConversations, currentPage, pageSize]);

  // Bulk Selection Handlers
  const isAllCurrentPageSelected = useMemo(() => {
    return paginatedConversations.length > 0 && 
      paginatedConversations.every(c => selectedIds.includes(c.id));
  }, [paginatedConversations, selectedIds]);

  const toggleSelectAllCurrentPage = () => {
    if (isAllCurrentPageSelected) {
      const pageIds = new Set(paginatedConversations.map(c => c.id));
      setSelectedIds(prev => prev.filter(id => !pageIds.has(id)));
    } else {
      const pageIds = paginatedConversations.map(c => c.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const selectAllFiltered = () => {
    setSelectedIds(filteredConversations.map(c => c.id));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBulkAssign = async () => {
    if (selectedIds.length === 0 || !bulkStaffId) return;
    setIsBulkAssigning(true);
    setBulkSuccessMsg(null);
    try {
      const res = await api.post<{ success: boolean; modified_count: number; message: string }>(
        "/conversations/bulk-assign",
        {
          conversation_ids: selectedIds,
          assigned_to: bulkStaffId,
        }
      );
      setBulkSuccessMsg(res.message);
      setSelectedIds([]);
      setBulkStaffId("");
      fetchData();
      setTimeout(() => setBulkSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(err.message || "Failed to bulk assign leads");
    } finally {
      setIsBulkAssigning(false);
    }
  };

  const setters = useMemo(() => staff.filter(s => s.staff_type === "setter"), [staff]);
  const closers = useMemo(() => staff.filter(s => s.staff_type === "closer"), [staff]);
  const generalStaff = useMemo(() => staff.filter(s => s.staff_type === "general"), [staff]);
  const onlineStaffCount = useMemo(() => staff.filter(s => isStaffOnline(s)).length, [staff]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  // Pipeline Metric Counts
  const totalLeads = conversations.length;
  const notContactedCount = conversations.filter(c => normalizeLeadStatus(c.lead_status) === "not contacted").length;
  const contactedCount = conversations.filter(c => normalizeLeadStatus(c.lead_status) === "contacted").length;
  const negotiableCount = conversations.filter(c => normalizeLeadStatus(c.lead_status) === "negotiable").length;
  const convertedCount = conversations.filter(c => normalizeLeadStatus(c.lead_status) === "converted").length;
  const blockedCount = conversations.filter(c => Boolean(c.is_blocked)).length;

  return (
    <div className="space-y-8 pb-12">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Leads & Pipeline Tracking</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor incoming leads, qualify opportunities with Setters, and advance high-intent prospects to Closers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <TimezoneSelector />
          <button
            onClick={() => {
              if (selectedIds.length === 0) {
                setSelectedIds(filteredConversations.map(c => c.id));
              }
              setIsBulkMessageModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all cursor-pointer"
            title="Send bulk WhatsApp message to leads"
          >
            <Send className="h-4 w-4" />
            <span>Bulk Message</span>
          </button>
          <button
            onClick={() => setIsNewChatOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-bold shadow-sm shadow-emerald-200 transition-all cursor-pointer"
          >
            <MessageSquarePlus className="h-4 w-4" />
            <span>New Chat</span>
          </button>
          <button
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 text-slate-500", isRefreshing && "animate-spin text-indigo-600")} />
            <span>Refresh Leads</span>
          </button>
        </div>
      </div>

      {/* Pipeline Metric Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {/* Total Leads */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Leads</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Inbox className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">{totalLeads}</span>
          </div>
        </div>

        {/* Not Contacted */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Not Contacted</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Target className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">{notContactedCount}</span>
            <span className="text-xs font-medium text-slate-500">pending</span>
          </div>
        </div>

        {/* Contacted */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Contacted</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <UserPlus className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">{contactedCount}</span>
            <span className="text-xs font-medium text-blue-600">reached out</span>
          </div>
        </div>

        {/* Negotiable */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Negotiable</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">{negotiableCount}</span>
            <span className="text-xs font-medium text-amber-600">in discussion</span>
          </div>
        </div>

        {/* Converted */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Converted</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Handshake className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">{convertedCount}</span>
            <span className="text-xs font-medium text-emerald-600">won</span>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden space-y-4 p-6">
        {/* Table Toolbar: Search, Filters, Rows per Page */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Search phone, lead name, staff..."
                className="w-56 sm:w-64 rounded-xl border border-slate-200 bg-slate-50/50 pl-8.5 pr-3 py-1.5 text-xs text-slate-900 outline-none transition-all focus:border-slate-400 focus:bg-white"
              />
            </div>

            {/* Stage Filter Tabs */}
            <div className="flex items-center rounded-xl border border-slate-200/80 p-0.5 bg-slate-50/50 flex-wrap">
              {[
                { id: "all", label: "All" },
                { id: "not contacted", label: "Not Contacted" },
                { id: "contacted", label: "Contacted" },
                { id: "not answering", label: "Not Answering" },
                { id: "follow up", label: "Follow up" },
                { id: "ready to showup", label: "Ready to Showup" },
                { id: "negotiable", label: "Negotiable" },
                { id: "sales close", label: "Sales close" },
                { id: "converted", label: "Converted" },
                { id: "paid lead", label: "Paid Lead" },
                { id: "unpaid lead", label: "Unpaid Lead" },
                { id: "not interested", label: "Not Interested" },
                { id: "lead lost", label: "Lead Lost" },
                { id: "junk leads", label: "Junk Leads" },
                { id: "blocked", label: `Blocked${blockedCount > 0 ? ` (${blockedCount})` : ""}` },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => { setStageFilter(f.id); setCurrentPage(1); }}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all",
                    stageFilter === f.id ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Mode Filter */}
            <div className="flex items-center rounded-xl border border-slate-200/80 p-0.5 bg-slate-50/50">
              <button
                onClick={() => { setModeFilter("all"); setCurrentPage(1); }}
                className={cn("px-2.5 py-1 text-[11px] font-semibold rounded-lg", modeFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500")}
              >
                All Modes
              </button>
              <button
                onClick={() => { setModeFilter("bot"); setCurrentPage(1); }}
                className={cn("px-2.5 py-1 text-[11px] font-semibold rounded-lg", modeFilter === "bot" ? "bg-white text-emerald-700 shadow-xs" : "text-slate-500")}
              >
                Bot
              </button>
              <button
                onClick={() => { setModeFilter("human"); setCurrentPage(1); }}
                className={cn("px-2.5 py-1 text-[11px] font-semibold rounded-lg", modeFilter === "human" ? "bg-white text-amber-700 shadow-xs" : "text-slate-500")}
              >
                Human
              </button>
            </div>

            {/* Unread Only Filter */}
            <button
              onClick={() => {
                setUnreadOnly((prev) => !prev);
                setCurrentPage(1);
              }}
              className={cn(
                "px-2.5 py-1 text-[11px] font-semibold rounded-xl border transition-all flex items-center gap-1.5 select-none",
                unreadOnly
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              )}
              title={unreadOnly ? "Showing unread leads only. Click to show all." : "Filter unread chats"}
            >
              <span className={cn(
                "h-1.5 w-1.5 rounded-full",
                unreadOnly ? "bg-white" : (unreadTotalCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-300")
              )} />
              <span>Unread</span>
              {unreadTotalCount > 0 && (
                <span className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-bold leading-none",
                  unreadOnly ? "bg-white text-emerald-700" : "bg-emerald-500 text-white"
                )}>
                  {unreadTotalCount}
                </span>
              )}
            </button>
          </div>

          {/* Rows Per Page */}
          <div className="flex items-center gap-2 text-xs text-slate-500 self-end lg:self-auto">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {/* Bulk Success Banner */}
        {bulkSuccessMsg && (
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{bulkSuccessMsg}</span>
            </div>
            <button onClick={() => setBulkSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-800">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Bulk Action Toolbar */}
        {selectedIds.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900 text-white shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-xs">
                {selectedIds.length}
              </div>
              <div className="text-xs">
                <span className="font-bold text-white">
                  {selectedIds.length} lead{selectedIds.length > 1 ? "s" : ""} selected
                </span>
                {selectedIds.length < filteredConversations.length && (
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="ml-2 text-indigo-300 hover:text-white underline underline-offset-2"
                  >
                    Select all {filteredConversations.length} matching
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={bulkStaffId}
                onChange={(e) => setBulkStaffId(e.target.value)}
                className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="">Choose Assignee...</option>
                <option value="round_robin">⚡ Split Evenly (Online staff only)</option>
                <option value="unassigned">Remove Assignment (Unassigned)</option>
                {setters.length > 0 && (
                  <optgroup label="Setters">
                    {setters.map(u => (
                      <option key={u.id} value={u.id}>
                        {staffLabel(u, u.email)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {closers.length > 0 && (
                  <optgroup label="Closers">
                    {closers.map(u => (
                      <option key={u.id} value={u.id}>
                        {staffLabel(u, u.email)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {generalStaff.length > 0 && (
                  <optgroup label="General Staff">
                    {generalStaff.map(u => (
                      <option key={u.id} value={u.id}>
                        {staffLabel(u, u.email)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              <button
                type="button"
                disabled={!bulkStaffId || isBulkAssigning}
                onClick={handleBulkAssign}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3.5 py-1.5 text-xs font-bold text-white transition-all shadow-xs"
              >
                {isBulkAssigning ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserCheck className="h-3.5 w-3.5" />
                )}
                <span>Assign Selected</span>
              </button>

              <div className="h-4 w-[1px] bg-slate-700 hidden sm:block mx-1" />

              <button
                type="button"
                onClick={() => setIsBulkMessageModalOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-white transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send Bulk Message ({selectedIds.length})</span>
              </button>

              <button
                type="button"
                onClick={clearSelection}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
                title="Cancel Selection"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Table Content */}
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center text-center p-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <Inbox className="h-9 w-9 text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-600">No leads match your criteria</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Try resetting your search or filter tags</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pl-3 w-8">
                    <input
                      type="checkbox"
                      checked={isAllCurrentPageSelected}
                      onChange={toggleSelectAllCurrentPage}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      title={isAllCurrentPageSelected ? "Deselect page" : "Select entire page"}
                    />
                  </th>
                  <th className="pb-3 pl-2">Lead Contact</th>
                  <th className="pb-3">Pipeline Stage</th>
                  <th className="pb-3">Setter / Closer</th>
                  <th className="pb-3">Assigned Staff</th>
                  <th className="pb-3">Handling Mode</th>
                  <th className="pb-3">Last Activity</th>
                  <th className="pb-3 pr-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedConversations.map((conv) => {
                  const initial = (conv.lead_name || conv.wa_user_phone).charAt(0).toUpperCase();
                  const isSelected = selectedIds.includes(conv.id);

                  return (
                    <tr 
                      key={conv.id} 
                      className={cn(
                        "group transition-colors",
                        isSelected ? "bg-indigo-50/50 hover:bg-indigo-50/70" : "hover:bg-slate-50/70"
                      )}
                    >
                      {/* Selection Checkbox */}
                      <td className="py-3.5 pl-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(conv.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* Lead Contact */}
                      <td className="py-3.5 pl-2">
                        <div className="flex items-center gap-3">
                          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white shadow-xs">
                            {initial}
                            {(conv.has_unread || (conv.unread_count && conv.unread_count > 0)) && (
                              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white"></span>
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 max-w-xs">
                            <div className="flex items-center gap-2">
                              {editingNameConvId === conv.id ? (
                                <div className="flex items-center gap-1.5 my-0.5" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    value={nameInput}
                                    onChange={(e) => setNameInput(e.target.value)}
                                    placeholder="Lead name..."
                                    className="h-7 w-36 sm:w-44 rounded-lg border border-slate-300 px-2 text-xs font-semibold text-slate-900 outline-none focus:border-slate-900"
                                    autoFocus
                                    disabled={isSavingName}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleSaveLeadName(conv.id);
                                      if (e.key === "Escape") setEditingNameConvId(null);
                                    }}
                                  />
                                  <button
                                    onClick={() => handleSaveLeadName(conv.id)}
                                    disabled={isSavingName}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                                    title="Save name"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setEditingNameConvId(null)}
                                    disabled={isSavingName}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                                    title="Cancel"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <p className={cn("text-sm leading-tight truncate", conv.has_unread ? "font-extrabold text-slate-950" : "font-bold text-slate-900")}>
                                    {conv.lead_name || "Unknown Lead"}
                                  </p>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingNameConvId(conv.id);
                                      setNameInput(conv.lead_name || "");
                                    }}
                                    className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
                                    title="Rename lead"
                                  >
                                    <Edit3 className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                              {(conv.unread_count && conv.unread_count > 0) ? (
                                <span className="rounded-full bg-emerald-500 px-1.5 py-0.2 text-[9px] font-bold text-white uppercase tracking-wider animate-pulse">
                                  {conv.unread_count} new
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-xs text-slate-500 font-mono">
                                {conv.wa_user_phone}
                              </span>
                              <CopyButton text={conv.wa_user_phone} title="Copy phone number" />
                              {conv.is_blocked && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  <Ban className="h-2.5 w-2.5 text-rose-600" />
                                  Blocked
                                </span>
                              )}
                            </div>
                            {conv.last_message_text && (
                              <p className="mt-1 text-[11px] text-slate-500 truncate max-w-[220px] flex items-center gap-1">
                                {conv.last_message_direction === "out" ? (
                                  <span className="inline-flex items-center gap-1 shrink-0">
                                    <MessageStatusTick status={conv.last_message_status} />
                                    <span className="text-slate-400 font-medium">You:</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-500 font-medium shrink-0">Customer:</span>
                                )}
                                <span className={cn("truncate", conv.has_unread ? "font-semibold text-emerald-800" : "text-slate-500 font-normal")}>
                                  {conv.last_message_text}
                                </span>
                              </p>
                            )}
                            {conv.notes && (
                              <div className="flex items-center gap-1 text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/70 mt-1 max-w-[200px]" title={conv.notes}>
                                <StickyNote className="h-3 w-3 shrink-0 text-amber-600" />
                                <span className="truncate font-medium">{conv.notes}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Pipeline Stage Dropdown */}
                      <td className="py-3.5">
                        <div className="flex flex-col gap-1 items-start">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={normalizeLeadStatus(conv.lead_status)}
                              onChange={(e) => handleUpdateStage(conv.id, e.target.value)}
                              className={cn(
                                "rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider border outline-none cursor-pointer transition-all",
                                getLeadStatusBadgeStyle(conv.lead_status)
                              )}
                            >
                              {LEAD_STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value} className="bg-white text-slate-900 font-medium normal-case">
                                  {opt.label}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={() => setStatusLogsModalConv(conv)}
                              className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 bg-slate-50 hover:border-emerald-200 border border-slate-200 rounded-lg transition-all shadow-2xs"
                              title="View Status Change History Logs"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Payment Badge/Button if Paid Lead or Payment recorded */}
                          {(conv.payment || normalizeLeadStatus(conv.lead_status) === "paid lead") && (
                            <button
                              type="button"
                              onClick={() => setPaymentModalConv(conv)}
                              className={cn(
                                "flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border transition-colors shadow-2xs",
                                conv.payment?.total_payment != null
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                                  : "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500"
                              )}
                              title="View or update payment details"
                            >
                              <CreditCard className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[150px]">
                                {conv.payment?.total_payment != null
                                  ? `$${conv.payment.advance_payment ?? 0} / $${conv.payment.total_payment}${
                                      conv.payment.remaining_payment != null && conv.payment.remaining_payment > 0
                                        ? ` (Rem: $${conv.payment.remaining_payment})`
                                        : " (Paid)"
                                    }`
                                  : "Fill Payment"}
                              </span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Setter / Closer Pills */}
                      <td className="py-3.5">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <span className="font-semibold text-[11px] text-slate-400">Setter:</span>
                            {conv.setter_email ? (
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900 text-xs">
                                  {conv.setter_name || conv.setter_email.split('@')[0]}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {conv.setter_email}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">None</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <span className="font-semibold text-[11px] text-slate-400">Closer:</span>
                            {conv.closer_email ? (
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900 text-xs">
                                  {conv.closer_name || conv.closer_email.split('@')[0]}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {conv.closer_email}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">None</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Assigned Staff Selector */}
                      <td className="py-3.5">
                        <div className="space-y-1">
                          <select
                            value={conv.assigned_to || "unassigned"}
                            onChange={(e) => handleTransferLead(conv.id, e.target.value)}
                            className={cn(
                              "rounded-xl border px-3 py-1.5 text-xs font-semibold outline-none cursor-pointer transition-all w-full max-w-[200px]",
                              conv.assigned_to
                                ? "bg-slate-50 border-slate-300 text-slate-900"
                                : "bg-slate-100 border-slate-200 text-slate-400 italic"
                            )}
                          >
                            <option value="unassigned" className="italic">Unassigned</option>
                            {staff.map(user => (
                              <option key={user.id} value={user.id} className="not-italic text-slate-900">
                                {staffLabel(user, user.staff_type)}
                              </option>
                            ))}
                          </select>
                          {conv.assigned_email && (
                            <p className="text-[11px] text-slate-400 font-medium pl-1 truncate max-w-[190px]">
                              {conv.assigned_email}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Automation Mode */}
                      <td className="py-3.5">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          conv.status === "bot"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                            : "bg-amber-50 text-amber-700 border border-amber-200/60"
                        )}>
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            conv.status === "bot" ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                          )} />
                          {conv.status === "bot" ? "Bot AI" : "Human"}
                        </span>
                      </td>

                      {/* Last Activity */}
                      <td className="py-3.5 text-xs text-slate-500 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>{formatInTimezone(conv.last_message_at, tenantTimezone)}</span>
                        </div>
                      </td>

                      {/* Action: Open in Chat & Status Logs */}
                      <td className="py-3.5 pr-2 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setBlockingConv(conv)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold shadow-xs transition-all cursor-pointer",
                              conv.is_blocked
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50 hover:border-rose-300"
                            )}
                            title={conv.is_blocked ? "Unblock this conversation" : "Block this contact from AI bot replies and notifications"}
                          >
                            {conv.is_blocked ? (
                              <>
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                                <span>Unblock</span>
                              </>
                            ) : (
                              <>
                                <Ban className="h-3.5 w-3.5 text-rose-600" />
                                <span>Block</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatusLogsModalConv(conv)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-all"
                            title="View Status Change History Logs"
                          >
                            <History className="h-3.5 w-3.5 text-slate-500" />
                            <span>Logs</span>
                          </button>
                          <Link
                            href={`/dashboard/conversations/${conv.id}`}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 transition-all"
                          >
                            <span>Open Chat</span>
                            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Proper Pagination Controls Footer */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
          <div>
            Showing{" "}
            <strong className="text-slate-900">
              {filteredConversations.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}
            </strong>{" "}
            to{" "}
            <strong className="text-slate-900">
              {Math.min(currentPage * pageSize, filteredConversations.length)}
            </strong>{" "}
            of <strong className="text-slate-900">{filteredConversations.length}</strong> leads
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>

            {/* Page number buttons */}
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                // Show first, last, and window around current page
                if (totalPages > 6 && Math.abs(pageNum - currentPage) > 2 && pageNum !== 1 && pageNum !== totalPages) {
                  if (pageNum === 2 || pageNum === totalPages - 1) {
                    return <span key={pageNum} className="px-1 text-slate-400">...</span>;
                  }
                  return null;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      "h-7 w-7 rounded-lg text-xs font-bold transition-all",
                      currentPage === pageNum
                        ? "bg-slate-900 text-white shadow-xs"
                        : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Paid Lead Details Modal */}
      <PaymentModal
        isOpen={!!paymentModalConv}
        onClose={() => setPaymentModalConv(null)}
        onSave={handleSavePayment}
        leadName={paymentModalConv?.lead_name}
        leadPhone={paymentModalConv?.wa_user_phone || ""}
        initialData={paymentModalConv?.payment}
        initialNotes={paymentModalConv?.notes}
      />

      {/* Lead Status Logs History Modal */}
      {statusLogsModalConv && (
        <LeadStatusLogsModal
          conversationId={statusLogsModalConv.id}
          leadName={statusLogsModalConv.lead_name}
          phone={statusLogsModalConv.wa_user_phone}
          currentStatus={statusLogsModalConv.lead_status}
          initialLogs={statusLogsModalConv.lead_status_logs}
          onClose={() => setStatusLogsModalConv(null)}
        />
      )}

      {/* Manual New Chat Modal */}
      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        staffList={staff}
        onSuccess={(newConv) => {
          fetchData(true);
          if (newConv?.id) {
            router.push(`/dashboard/conversations/${newConv.id}`);
          }
        }}
      />

      {/* Bulk WhatsApp Message Modal */}
      <BulkMessageModal
        isOpen={isBulkMessageModalOpen}
        onClose={() => setIsBulkMessageModalOpen(false)}
        recipients={selectedRecipients}
        onSuccess={() => {
          fetchData(true);
          setSelectedIds([]);
        }}
      />

      {/* Block / Unblock Chat Modal */}
      {blockingConv && (
        <BlockChatModal
          isOpen={Boolean(blockingConv)}
          onClose={() => setBlockingConv(null)}
          conversationId={blockingConv.id}
          phone={blockingConv.wa_user_phone}
          leadName={blockingConv.lead_name}
          isBlocked={Boolean(blockingConv.is_blocked)}
          currentReason={blockingConv.blocked_reason}
          onSuccess={(updatedConv) => {
            if (updatedConv) {
              setConversations((prev) =>
                prev.map((c) => (c.id === updatedConv.id ? { ...c, ...updatedConv } : c))
              );
            }
          }}
        />
      )}
    </div>
  );
}

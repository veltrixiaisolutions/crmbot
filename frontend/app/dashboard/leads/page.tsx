"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { 
  Inbox, 
  User, 
  MessageCircle, 
  Search, 
  RefreshCw, 
  Clock, 
  ChevronRight,
  Handshake,
  UserCheck,
  StickyNote,
  Edit3,
  X,
  Check,
  Volume2,
  VolumeX,
  Bell,
  BellRing,
  Calendar,
  CreditCard,
  History,
  MessageSquarePlus,
  Ban,
  ShieldCheck
} from "lucide-react";
import { CopyButton } from "../_components/CopyButton";
import { 
  LEAD_STATUS_OPTIONS, 
  normalizeLeadStatus, 
  getLeadStatusBadgeStyle,
  getLeadStatusOptionsForRole,
  LeadStatusLog
} from "@/lib/leadStatus";
import { formatInTimezone, useSelectedTimezone } from "@/lib/timezone";
import { TimezoneSelector } from "@/components/TimezoneSelector";
import { MessageStatusTick } from "@/components/MessageStatusTick";
import { cn } from "@/lib/utils";
import { PaymentModal, PaymentDetails } from "@/components/PaymentModal";
import { LeadStatusLogsModal } from "@/components/LeadStatusLogsModal";
import { NewChatModal } from "@/components/NewChatModal";
import { BlockChatModal } from "@/components/BlockChatModal";

function playNotificationChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.start(now);
    osc.stop(now + 0.45);
  } catch (e) {
    console.warn("Could not play audio chime:", e);
  }
}

type Conversation = {
  id: string;
  wa_user_phone: string;
  status: "bot" | "human";
  lead_status?: string;
  lead_name?: string | null;
  assigned_to?: string | null;
  assigned_name?: string | null;
  setter_name?: string | null;
  closer_name?: string | null;
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

type CurrentUser = {
  id: string;
  name?: string;
  email: string;
  role: "admin" | "staff";
  staff_type?: "general" | "setter" | "closer";
  timezone?: string;
};

// In-memory cache to prevent flashing loading spinner on back navigation
let cachedLeadsData: {
  leads: Conversation[];
  currentUser: CurrentUser | null;
  timeframe: "today" | "yesterday" | "weekly" | "monthly" | "all";
} | null = null;

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Conversation[]>(() => cachedLeadsData?.leads || []);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => cachedLeadsData?.currentUser || null);
  const [displayTimezone] = useSelectedTimezone("Asia/Kolkata");
  const [timeframe, setTimeframe] = useState<"today" | "yesterday" | "weekly" | "monthly" | "all">(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("veltrix_staff_leads_timeframe");
      if (saved) return saved as any;
    }
    return cachedLeadsData?.timeframe || "today";
  });
  const [loading, setLoading] = useState(() => !cachedLeadsData);
  const [refreshing, setRefreshing] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("veltrix_staff_leads_search") || "";
    }
    return "";
  });
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("veltrix_staff_leads_filter") || "all";
    }
    return "all";
  });
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);

  const unreadTotalCount = useMemo(() => {
    return leads.filter(c => Boolean(c.has_unread || (c.unread_count && c.unread_count > 0))).length;
  }, [leads]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingNotesConv, setEditingNotesConv] = useState<Conversation | null>(null);
  const [paymentModalConv, setPaymentModalConv] = useState<Conversation | null>(null);
  const [statusLogsModalConv, setStatusLogsModalConv] = useState<Conversation | null>(null);
  const [blockingConv, setBlockingConv] = useState<Conversation | null>(null);
  const [notesText, setNotesText] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [editingNameConvId, setEditingNameConvId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  // Notification & Audio alert states
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserNotifPermission, setBrowserNotifPermission] = useState<NotificationPermission>("default");
  const [latestAlert, setLatestAlert] = useState<{
    convId: string;
    phone: string;
    name?: string;
    text: string;
  } | null>(null);

  const prevLeadsRef = useRef<Record<string, string>>({});
  const isFirstLoadRef = useRef(true);

  // Check notification permissions and load sound settings on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserNotifPermission(Notification.permission);
    }
    const savedSound = localStorage.getItem("veltrix_sound_enabled");
    if (savedSound !== null) {
      setSoundEnabled(savedSound === "true");
    }
  }, []);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("veltrix_sound_enabled", String(next));
      if (next) playNotificationChime();
      return next;
    });
  };

  const requestBrowserNotification = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const perm = await Notification.requestPermission();
        setBrowserNotifPermission(perm);
        if (perm === "granted") {
          new Notification("🔔 WhatsApp Alerts Enabled", {
            body: "You will now receive desktop alerts whenever previous or new customers send a message.",
          });
        }
      } catch (err) {
        console.error("Failed to request notification permission:", err);
      }
    }
  };

  const fetchLeads = async (isManual = false, tf = timeframe) => {
    if (isManual) setRefreshing(true);
    try {
      const data = await api.get<Conversation[]>(`/conversations/leads?timeframe=${tf}`);

      // Detect incoming customer messages from previous or new leads
      let newlyArrived: Conversation | null = null;
      const nextMap: Record<string, string> = {};

      data.forEach((c) => {
        nextMap[c.id] = c.last_message_at;
        const prevAt = prevLeadsRef.current[c.id];
        // If not first load and timestamp changed on incoming customer message
        if (!isFirstLoadRef.current && prevAt && prevAt !== c.last_message_at) {
          if (c.last_message_direction === "in" || c.has_unread) {
            newlyArrived = c;
          }
        }
      });

      if (newlyArrived) {
        if (soundEnabled) {
          playNotificationChime();
        }
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification(`💬 New WhatsApp message from ${(newlyArrived as Conversation).lead_name || (newlyArrived as Conversation).wa_user_phone}`, {
              body: (newlyArrived as Conversation).last_message_text || "Sent a message",
            });
          } catch (e) {
            console.error("Browser notification error:", e);
          }
        }
        setLatestAlert({
          convId: (newlyArrived as Conversation).id,
          phone: (newlyArrived as Conversation).wa_user_phone,
          name: (newlyArrived as Conversation).lead_name || undefined,
          text: (newlyArrived as Conversation).last_message_text || "Sent a new message",
        });
        setTimeout(() => setLatestAlert(null), 10000);
      }

      prevLeadsRef.current = nextMap;
      isFirstLoadRef.current = false;

      // Update page title if unread count > 0
      const totalUnread = data.filter((c) => c.has_unread || (c.unread_count && c.unread_count > 0)).length;
      if (typeof document !== "undefined") {
        document.title = totalUnread > 0 ? `(${totalUnread}) 💬 New Message - Staff Leads` : "Staff Leads Tracking";
      }

      setLeads(data);
      cachedLeadsData = {
        leads: data,
        currentUser: currentUser,
        timeframe: tf,
      };
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load leads");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleTimeframeChange = (newTf: "today" | "yesterday" | "weekly" | "monthly" | "all") => {
    setTimeframe(newTf);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("veltrix_staff_leads_timeframe", newTf);
    }
    fetchLeads(false, newTf);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("veltrix_staff_leads_search", query);
    }
  };

  const handleStatusFilterChange = (filter: string) => {
    setStatusFilter(filter);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("veltrix_staff_leads_filter", filter);
    }
  };

  useEffect(() => {
    api.get<CurrentUser>("/users/me")
      .then((u) => {
        setCurrentUser(u);
        if (cachedLeadsData) cachedLeadsData.currentUser = u;
      })
      .catch(console.error);
    fetchLeads(false, timeframe);
    const interval = setInterval(() => {
      fetchLeads(false, timeframe);
    }, 5000);
    return () => clearInterval(interval);
  }, [timeframe, soundEnabled]);

  const handleUpdateStatus = async (convId: string, newStatus: string) => {
    if (newStatus === "paid lead") {
      const conv = leads.find((c) => c.id === convId);
      if (conv) {
        setPaymentModalConv(conv);
        return;
      }
    }

    setUpdatingId(convId);
    // Optimistic update
    setLeads((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, lead_status: newStatus } : c))
    );

    try {
      const updated = await api.patch<Conversation>(`/conversations/${convId}/status`, { lead_status: newStatus });
      setLeads((prev) =>
        prev.map((c) => (c.id === convId ? updated : c))
      );
    } catch (err: any) {
      console.error("Failed to update status:", err);
      await fetchLeads();
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSavePayment = async (paymentData: PaymentDetails) => {
    if (!paymentModalConv) return;
    const convId = paymentModalConv.id;
    setUpdatingId(convId);
    try {
      const updated = await api.patch<Conversation>(`/conversations/${convId}/status`, {
        lead_status: "paid lead",
        payment: paymentData,
        notes: paymentData.notes || paymentModalConv.notes || null,
      });
      setLeads((prev) =>
        prev.map((c) => (c.id === convId ? updated : c))
      );
      setPaymentModalConv(null);
    } catch (err: any) {
      console.error("Failed to save payment details:", err);
      alert(err.message || "Failed to save payment details");
      throw err;
    } finally {
      setUpdatingId(null);
    }
  };

  const openNotesModal = (conv: Conversation) => {
    setEditingNotesConv(conv);
    setNotesText(conv.notes || "");
  };

  const handleSaveNotes = async () => {
    if (!editingNotesConv) return;
    setIsSavingNotes(true);
    try {
      const updated = await api.patch<Conversation>(`/conversations/${editingNotesConv.id}/status`, {
        notes: notesText.trim() || null,
      });
      setLeads((prev) =>
        prev.map((c) => (c.id === editingNotesConv.id ? { ...c, notes: updated.notes } : c))
      );
      setEditingNotesConv(null);
    } catch (err: any) {
      console.error("Failed to save comments:", err);
      alert(err.message || "Failed to save comment");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleSaveLeadName = async (convId: string) => {
    try {
      setIsSavingName(true);
      const trimmed = nameInput.trim();
      const updated = await api.patch<Conversation>(`/conversations/${convId}/status`, {
        lead_name: trimmed || null,
      });
      setLeads((prev) =>
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

  // Status counts
  const counts = useMemo(() => {
    const res: Record<string, number> = {
      all: leads.length,
      "not contacted": 0,
      contacted: 0,
      "not answering": 0,
      "follow up": 0,
      "ready to showup": 0,
      "no showup": 0,
      negotiable: 0,
      "sales close": 0,
      converted: 0,
      "paid lead": 0,
      "unpaid lead": 0,
      "not interested": 0,
      "lead lost": 0,
      "junk leads": 0,
      blocked: leads.filter((l) => Boolean(l.is_blocked)).length,
    };
    leads.forEach((l) => {
      const norm = normalizeLeadStatus(l.lead_status);
      if (res[norm] !== undefined) {
        res[norm] += 1;
      }
    });
    return res;
  }, [leads]);

  // Filtered leads
  const filteredLeads = useMemo(() => {
    return leads
      .filter((c) => {
        if (statusFilter === "blocked") {
          if (!c.is_blocked) return false;
        } else {
          const norm = normalizeLeadStatus(c.lead_status);
          if (statusFilter !== "all" && norm !== statusFilter) {
            return false;
          }
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const phoneMatch = c.wa_user_phone.toLowerCase().includes(q);
          const nameMatch = c.lead_name ? c.lead_name.toLowerCase().includes(q) : false;
          if (!phoneMatch && !nameMatch) return false;
        }
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
  }, [leads, statusFilter, searchQuery, unreadOnly]);

  const roleLabel = currentUser?.staff_type === "setter" 
    ? "Setter Workbench" 
    : currentUser?.staff_type === "closer" 
    ? "Closer Workbench" 
    : "Staff Leads Tracking";

  const roleDescription = currentUser?.staff_type === "setter"
    ? "Leads assigned to you to qualify. Changing status to 'Ready to Showup' automatically transfers the lead to an available Closer while keeping it in your tracking view."
    : currentUser?.staff_type === "closer"
    ? "Leads diversified directly to your pipeline or transferred from Setters. Manage initial contact, qualification, negotiations, or conversions."
    : "Track and manage customer leads assigned to your pipeline.";

  const roleTabs = useMemo(() => {
    return getLeadStatusOptionsForRole(currentUser?.staff_type);
  }, [currentUser?.staff_type]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200">
            {currentUser?.staff_type === "closer" ? <Handshake className="h-5 w-5" /> : <Inbox className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{roleLabel}</h1>
              {currentUser?.staff_type && (
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase tracking-wider border border-indigo-200">
                  {currentUser.staff_type}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 max-w-xl">{roleDescription}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-xs transition-all",
              soundEnabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            )}
            title={soundEnabled ? "Sound Alerts are ON (click to mute)" : "Sound Alerts are MUTED (click to enable)"}
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5 text-emerald-600" /> : <VolumeX className="h-3.5 w-3.5 text-slate-400" />}
            <span className="hidden sm:inline">{soundEnabled ? "Sound On" : "Muted"}</span>
          </button>

          {/* Desktop Alerts Permission Button */}
          {browserNotifPermission === "granted" ? (
            <div 
              className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs font-semibold text-emerald-800 shadow-xs"
              title="Desktop notifications are enabled and active"
            >
              <BellRing className="h-3.5 w-3.5 text-emerald-600" />
              <span>Alerts Active</span>
            </div>
          ) : browserNotifPermission === "denied" ? (
            <div 
              className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-xs"
              title="Browser blocked notifications. Enable notifications in your browser URL bar settings."
            >
              <Bell className="h-3.5 w-3.5 text-rose-500" />
              <span className="hidden sm:inline">Alerts Blocked</span>
            </div>
          ) : (
            <button
              onClick={requestBrowserNotification}
              className="flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-all animate-pulse"
              title="Click to enable desktop notifications for incoming messages"
            >
              <Bell className="h-3.5 w-3.5" />
              <span>Enable Alerts</span>
            </button>
          )}

          {/* Timezone Selector */}
          <TimezoneSelector />

          {/* New Chat Button */}
          <button
            onClick={() => setIsNewChatOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-bold shadow-sm shadow-emerald-200 transition-all cursor-pointer"
          >
            <MessageSquarePlus className="h-4 w-4" />
            <span>New Chat</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => fetchLeads(true, timeframe)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 text-slate-500", refreshing && "animate-spin text-indigo-600")} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Floating Alert Toast for Newly Arrived Messages */}
      {latestAlert && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white shrink-0">
              <BellRing className="h-4 w-4 animate-bounce" />
            </div>
            <div className="min-w-0 text-xs">
              <p className="font-bold truncate">
                New Message from {latestAlert.name || latestAlert.phone}
              </p>
              <p className="text-emerald-100 truncate max-w-lg mt-0.5 font-mono text-[11px]">
                "{latestAlert.text}"
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/dashboard/conversations/${latestAlert.convId}`}
              className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 transition-colors shadow-xs"
            >
              Open Chat
            </Link>
            <button
              onClick={() => setLatestAlert(null)}
              className="p-1 rounded-lg text-white/70 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Timeframe & Search Control Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Timeframe Tabs (Today / Weekly / Monthly / All Leads) */}
        <div className="flex items-center gap-1 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xs">
          <div className="flex items-center gap-1.5 pl-2 pr-1 text-slate-400">
            <Calendar className="h-3.5 w-3.5" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Leads:</span>
          </div>
          {[
            { id: "today", label: "Today" },
            { id: "yesterday", label: "Yesterday" },
            { id: "weekly", label: "Weekly" },
            { id: "monthly", label: "Monthly" },
            { id: "all", label: "All Leads" },
          ].map((tf) => {
            const isSelected = timeframe === tf.id;
            return (
              <button
                key={tf.id}
                onClick={() => handleTimeframeChange(tf.id as any)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5",
                  isSelected
                    ? "bg-slate-900 text-white shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                )}
              >
                <span>{tf.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search phone or name..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-800 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xs">
        <button
          onClick={() => handleStatusFilterChange("all")}
          className={cn(
            "px-3 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5",
            statusFilter === "all"
              ? "bg-indigo-600 text-white shadow-xs font-bold"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          )}
        >
          <span>All Stages</span>
          <span className={cn(
            "rounded-full px-1.5 py-0.2 text-[10px]",
            statusFilter === "all" ? "bg-indigo-700 text-indigo-100" : "bg-slate-100 text-slate-600"
          )}>
            {counts.all}
          </span>
        </button>

        {/* Unread Chats Filter Tab */}
        <button
          onClick={() => setUnreadOnly((prev) => !prev)}
          className={cn(
            "px-3 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 select-none",
            unreadOnly
              ? "bg-emerald-600 text-white shadow-xs font-bold"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          )}
          title={unreadOnly ? "Showing unread leads only. Click to show all." : "Filter unread leads"}
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

        {roleTabs.map((opt) => {
          const isSelected = statusFilter === opt.value;
          const count = counts[opt.value] || 0;
          return (
            <button
              key={opt.value}
              onClick={() => handleStatusFilterChange(opt.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5",
                isSelected
                  ? "bg-slate-900 text-white shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              <span>{opt.label}</span>
              <span className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px]",
                isSelected ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-600"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Leads List */}
      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-center shadow-xs">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <MessageCircle className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {leads.length === 0 
              ? (timeframe === "today" 
                  ? "No leads active today" 
                  : timeframe === "yesterday"
                  ? "No leads active yesterday"
                  : timeframe === "weekly"
                  ? "No leads active this week"
                  : timeframe === "monthly"
                  ? "No leads active this month"
                  : "No leads assigned to you")
              : "No leads match this filter"}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            {leads.length === 0 
              ? (timeframe !== "all"
                  ? `No leads were received or updated ${timeframe === "today" ? "today" : timeframe === "yesterday" ? "yesterday" : timeframe === "weekly" ? "this week" : "this month"}. Switch to Weekly, Monthly, or All Leads to review earlier conversations.`
                  : "New customer inquiries automatically assigned to you will appear here.") 
              : "Try switching the status tab or clearing your search query."}
          </p>
          {leads.length === 0 && timeframe !== "all" && (
            <div className="mt-4 flex items-center gap-2">
              {timeframe === "today" && (
                <button
                  type="button"
                  onClick={() => handleTimeframeChange("weekly")}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs"
                >
                  View Weekly Leads
                </button>
              )}
              <button
                type="button"
                onClick={() => handleTimeframeChange("all")}
                className="rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shadow-2xs"
              >
                View All Leads
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {filteredLeads.map((conv) => {
            const initial = (conv.lead_name || conv.wa_user_phone || "L").charAt(0).toUpperCase();
            const currentStatus = normalizeLeadStatus(conv.lead_status);
            const isSaving = updatingId === conv.id;

            return (
              <div
                key={conv.id}
                className={cn(
                  "flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 transition-colors",
                  (conv.has_unread || (conv.unread_count && conv.unread_count > 0))
                    ? "bg-emerald-50/40 border-l-4 border-l-emerald-500 hover:bg-emerald-50/70"
                    : "hover:bg-slate-50/80"
                )}
              >
                {/* Contact Information & Roles */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white shadow-xs">
                    {initial}
                    {(conv.has_unread || (conv.unread_count && conv.unread_count > 0)) && (
                      <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white"></span>
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {editingNameConvId === conv.id ? (
                        <div className="flex items-center gap-1.5 my-0.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            placeholder="Lead name..."
                            className="h-7 w-36 sm:w-48 rounded-lg border border-slate-300 px-2 text-xs font-semibold text-slate-900 outline-none focus:border-slate-900"
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
                            {conv.lead_name || "Lead"}
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
                    <div className="flex items-center gap-1.5 mt-0.5">
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
                      <p className="mt-1 text-xs text-slate-500 truncate max-w-md flex items-center gap-1">
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

                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1 flex-wrap">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-300" />
                        <span>{formatInTimezone(conv.last_message_at, displayTimezone)}</span>
                      </div>
                      {conv.setter_name && (
                        <>
                          <span>•</span>
                          <span className="text-slate-600 font-medium">Setter: <strong className="text-slate-800">{conv.setter_name}</strong></span>
                        </>
                      )}
                      {conv.closer_name && (
                        <>
                          <span>•</span>
                          <span className="text-purple-700 font-semibold bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200/70 inline-flex items-center gap-1">
                            <Handshake className="h-3 w-3 text-purple-600" />
                            <span>Closer: <strong>{conv.closer_name}</strong></span>
                          </span>
                        </>
                      )}
                      {conv.notes && (
                        <div 
                          onClick={() => openNotesModal(conv)}
                          className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50/80 hover:bg-amber-100/80 border border-amber-200/70 p-2.5 text-xs text-amber-950 cursor-pointer transition-colors max-w-xl group shadow-2xs"
                          title="Click to view/edit comments"
                        >
                          <StickyNote className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-amber-800 text-[10px] uppercase tracking-wider mr-1.5">Comments / Notes:</span>
                            <span className="text-slate-800 font-medium whitespace-pre-wrap">{conv.notes}</span>
                          </div>
                          <Edit3 className="h-3 w-3 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Dropdown + Actions */}
                <div className="flex flex-wrap items-center gap-3 self-end sm:self-center">
                  {/* Mode badge */}
                  <span
                    className={cn(
                      "rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
                      conv.status === "human"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    )}
                  >
                    {conv.status === "human" ? "Human" : "Bot"}
                  </span>

                  {/* Status Dropdown */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status:</span>
                    <select
                      value={currentStatus}
                      disabled={isSaving}
                      onChange={(e) => handleUpdateStatus(conv.id, e.target.value)}
                      className={cn(
                        "rounded-xl px-3 py-1.5 text-xs font-bold uppercase tracking-wider border outline-none cursor-pointer transition-all shadow-2xs",
                        getLeadStatusBadgeStyle(conv.lead_status),
                        isSaving && "opacity-50 cursor-wait"
                      )}
                    >
                      {getLeadStatusOptionsForRole(currentUser?.staff_type, conv.lead_status).map((opt) => (
                        <option
                          key={opt.value}
                          value={opt.value}
                          className="bg-white text-slate-900 font-medium normal-case py-1"
                        >
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    {/* View Status Change History Logs */}
                    <button
                      type="button"
                      onClick={() => setStatusLogsModalConv(conv)}
                      className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 bg-slate-100/80 hover:border-emerald-200 border border-slate-200/80 rounded-xl transition-all shadow-2xs flex items-center gap-1 text-xs font-semibold"
                      title="View Lead Status Logs & Timeline"
                    >
                      <History className="h-3.5 w-3.5 text-slate-500 hover:text-emerald-600" />
                    </button>

                    {/* Block / Unblock Lead Button */}
                    <button
                      type="button"
                      onClick={() => setBlockingConv(conv)}
                      className={cn(
                        "p-1.5 rounded-xl border transition-all shadow-2xs flex items-center gap-1 text-xs font-semibold cursor-pointer",
                        conv.is_blocked
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                          : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50 hover:border-rose-300"
                      )}
                      title={conv.is_blocked ? "Unblock this conversation" : "Block this contact from AI bot replies and notifications"}
                    >
                      {conv.is_blocked ? (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="hidden sm:inline">Unblock</span>
                        </>
                      ) : (
                        <>
                          <Ban className="h-3.5 w-3.5 text-rose-600" />
                          <span className="hidden sm:inline">Block</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Payment Details Button (if paid lead or payment recorded) */}
                  {(conv.payment || normalizeLeadStatus(conv.lead_status) === "paid lead") && (
                    <button
                      type="button"
                      onClick={() => setPaymentModalConv(conv)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold border transition-all shadow-2xs",
                        conv.payment?.total_payment
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                          : "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500"
                      )}
                      title="View or update payment details"
                    >
                      <CreditCard className={cn("h-3.5 w-3.5", conv.payment?.total_payment ? "text-emerald-600" : "text-white")} />
                      <span>
                        {conv.payment?.total_payment != null
                          ? `$${conv.payment.advance_payment ?? 0} / $${conv.payment.total_payment}${
                              conv.payment.remaining_payment != null && conv.payment.remaining_payment > 0
                                ? ` (Rem: $${conv.payment.remaining_payment})`
                                : " (Paid)"
                            }`
                          : "Fill Payment Details"}
                      </span>
                    </button>
                  )}

                  {/* Additional Comments Button */}
                  <button
                    type="button"
                    onClick={() => openNotesModal(conv)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all shadow-2xs",
                      conv.notes
                        ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                    )}
                    title="Add or edit comments for Setter & Closer"
                  >
                    <StickyNote className="h-3.5 w-3.5 text-amber-600" />
                    <span>{conv.notes ? "Edit Note" : "+ Comment"}</span>
                  </button>

                  {/* Open Chat Link */}
                  <Link
                    href={`/dashboard/conversations/${conv.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors"
                  >
                    <span>Open Chat</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Additional Comments Modal */}
      {editingNotesConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setEditingNotesConv(null)}
              className="absolute right-4 top-4 rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60 shadow-2xs">
                <StickyNote className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Additional Comments & Notes</h3>
                <p className="text-xs text-slate-500">
                  Lead: <strong className="text-slate-700">{editingNotesConv.lead_name || "Customer"}</strong> ({editingNotesConv.wa_user_phone})
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-500 mb-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              💡 <strong>Setter & Closer Shared Notes:</strong> Use this to record handover details, pricing quotes, deal objections, or appointment callback times.
            </div>

            <textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              rows={5}
              placeholder="Type comments or notes here... (e.g. 'Customer wants pricing for package B. Ready to buy once discount confirmed. Callback tomorrow 3 PM.')"
              className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-all placeholder:text-slate-400 resize-none font-medium leading-relaxed bg-slate-50/50 focus:bg-white"
            />

            <div className="mt-4 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setEditingNotesConv(null)}
                disabled={isSavingNotes}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={isSavingNotes}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 transition-all"
              >
                {isSavingNotes && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>{isSavingNotes ? "Saving..." : "Save Comment"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
        onSuccess={(newConv) => {
          fetchLeads(true, timeframe);
          if (newConv?.id) {
            router.push(`/dashboard/conversations/${newConv.id}`);
          }
        }}
      />

      {/* Block / Unblock Lead Modal */}
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
              setLeads((prev) =>
                prev.map((c) => (c.id === updatedConv.id ? { ...c, ...updatedConv } : c))
              );
            }
          }}
        />
      )}
    </div>
  );
}

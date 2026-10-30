"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api, getMediaUrl } from "@/lib/api";
import { 
  Bot, 
  User, 
  Send, 
  Phone, 
  Clock, 
  RefreshCw, 
  Search, 
  Filter, 
  ShieldCheck, 
  UserPlus, 
  Handshake, 
  ChevronLeft, 
  ChevronRight, 
  MessageSquare, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  MoreVertical,
  Edit2,
  Check,
  Paperclip,
  FileText,
  Image as ImageIcon,
  X,
  Download,
  StickyNote,
  Volume2,
  VolumeX,
  Bell,
  BellRing,
  Mic,
  ChevronDown,
  CreditCard,
  Film,
  Pencil,
  Trash2,
  History,
  MessageSquarePlus,
  Video
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { CopyButton } from "../_components/CopyButton";
import { 
  LEAD_STATUS_OPTIONS, 
  normalizeLeadStatus, 
  getLeadStatusBadgeStyle,
  getLeadStatusLabel,
  LeadStatusLog
} from "@/lib/leadStatus";
import { formatTimeOnly, useSelectedTimezone } from "@/lib/timezone";
import { PaymentModal, PaymentDetails } from "@/components/PaymentModal";
import { MessageStatusTick } from "@/components/MessageStatusTick";
import { LeadStatusLogsModal } from "@/components/LeadStatusLogsModal";
import { NewChatModal } from "@/components/NewChatModal";

interface Conversation {
  id: string;
  wa_user_phone: string;
  status: "bot" | "human";
  lead_status?: string;
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
  last_customer_read_at?: string | null;
  last_message_at: string;
  created_at?: string;
  last_message_text?: string | null;
  last_message_direction?: string | null;
  last_message_status?: string | null;
  has_unread?: boolean;
  unread_count?: number;
}

interface Message {
  id: string;
  direction: "in" | "out";
  text: string;
  media_url?: string | null;
  media_type?: string | null;
  media_filename?: string | null;
  status?: "sent" | "delivered" | "read" | "failed" | string | null;
  status_updated_at?: string | null;
  timestamp: string;
  is_edited?: boolean;
  edited_at?: string | null;
}

interface StaffUser {
  id: string;
  name?: string;
  email: string;
  staff_type: "general" | "setter" | "closer";
}

let cachedMonitorData: {
  conversations: Conversation[];
  staff: StaffUser[];
  tenantTimezone: string;
} | null = null;

// Pleasant notification chime using Web Audio API (no external asset required)
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    
    // Note 1: E5
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Note 2: A5
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);
  } catch (e) {
    console.warn("Could not play audio chime:", e);
  }
}

export default function ChatMonitorPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>(() => cachedMonitorData?.conversations || []);
  const [staff, setStaff] = useState<StaffUser[]>(() => cachedMonitorData?.staff || []);
  const [tenantTimezone, setTenantTimezone] = useSelectedTimezone("Asia/Kolkata");
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notesInput, setNotesInput] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isStatusLogsOpen, setIsStatusLogsOpen] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Notification states
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserNotifPermission, setBrowserNotifPermission] = useState<NotificationPermission>("default");
  const [latestAlert, setLatestAlert] = useState<{
    convId: string;
    phone: string;
    name?: string;
    text: string;
  } | null>(null);

  // Search, filter & pagination state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "bot" | "human">("all");
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>("all");
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const unreadTotalCount = useMemo(() => {
    return conversations.filter(c => Boolean(c.has_unread || (c.unread_count && c.unread_count > 0))).length;
  }, [conversations]);

  // Editing lead name
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  // Message edit & delete state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [isDeletingMsg, setIsDeletingMsg] = useState(false);

  const handleStartEdit = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditingText(msg.text);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const handleSaveEdit = async (msgId: string) => {
    if (!selectedConv?.id || !editingText.trim()) return;
    setIsSavingEdit(true);
    try {
      const updated = await api.patch<Message>(`/conversations/${selectedConv.id}/messages/${msgId}`, {
        text: editingText.trim(),
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, text: updated.text, is_edited: true, edited_at: updated.edited_at } : m))
      );
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedConv.id ? { ...c, last_message_text: updated.text.slice(0, 150) } : c))
      );
      setEditingMessageId(null);
      setEditingText("");
    } catch (err: any) {
      alert(err?.message || "Failed to update message");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!selectedConv?.id) return;
    setIsDeletingMsg(true);
    try {
      await api.delete(`/conversations/${selectedConv.id}/messages/${msgId}`);
      setMessages((prev) => {
        const remaining = prev.filter((m) => m.id !== msgId);
        if (prev[prev.length - 1]?.id === msgId && remaining.length > 0) {
          const newLast = remaining[remaining.length - 1];
          setConversations((clist) =>
            clist.map((c) =>
              c.id === selectedConv.id
                ? {
                    ...c,
                    last_message_text: newLast.text || newLast.media_filename || "Attachment",
                    last_message_direction: newLast.direction,
                    last_message_status: newLast.status,
                  }
                : c
            )
          );
        }
        return remaining;
      });
      setDeletingMessageId(null);
    } catch (err: any) {
      alert(err?.message || "Failed to delete message");
    } finally {
      setIsDeletingMsg(false);
    }
  };

  const customerActivityStatus = useMemo(() => {
    if (!messages || messages.length === 0) return null;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.direction === "in") {
      return { active: true, text: "Customer Active", color: "text-emerald-700 bg-emerald-50 border-emerald-200/80" };
    }
    if (lastMsg.status === "read") {
      return { active: true, text: "Read by customer", color: "text-[#0284c7] bg-sky-50 border-sky-200/80" };
    }
    if (lastMsg.status === "delivered") {
      return { active: false, text: "Delivered", color: "text-slate-600 bg-slate-100 border-slate-200/80" };
    }
    if (lastMsg.status === "failed") {
      return { active: false, text: "Delivery failed", color: "text-rose-700 bg-rose-50 border-rose-200/80" };
    }
    return { active: false, text: "Message sent", color: "text-slate-500 bg-slate-50 border-slate-200/80" };
  }, [messages]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const initialLoadDoneRef = useRef(false);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [enterToSend, setEnterToSend] = useState(false);
  const prevConvsRef = useRef<Record<string, string>>({});
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    const saved = localStorage.getItem("veltrix_chat_enter_to_send");
    if (saved !== null) {
      setEnterToSend(saved === "true");
    }
  }, []);

  const toggleEnterToSend = () => {
    setEnterToSend((prev) => {
      const next = !prev;
      localStorage.setItem("veltrix_chat_enter_to_send", String(next));
      return next;
    });
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextH = Math.min(Math.max(el.scrollHeight, 42), 160);
    el.style.height = `${nextH}px`;
  }, [inputText]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      if (e.shiftKey) {
        // Shift + Enter: always insert a new line
        return;
      }
      if (enterToSend) {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          sendMessage();
        }
      } else {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          sendMessage();
        }
      }
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior,
      });
      isAtBottomRef.current = true;
      setShowScrollBottomBtn(false);
    }
  };

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    isAtBottomRef.current = isNearBottom;
    setShowScrollBottomBtn(!isNearBottom);
  };

  // Check browser notification permission on mount and guard against staff access
  useEffect(() => {
    api.get<{ role: string }>("/users/me").then(user => {
      if (user.role === "staff") {
        router.replace("/dashboard/leads");
      }
    }).catch(console.error);

    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserNotifPermission(Notification.permission);
    }
    const savedSound = localStorage.getItem("veltrix_sound_enabled");
    if (savedSound !== null) {
      setSoundEnabled(savedSound === "true");
    }
  }, [router]);

  const toggleSound = () => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem("veltrix_sound_enabled", String(next));
      if (next) playNotificationChime();
      return next;
    });
  };

  const requestBrowserNotification = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const perm = await Notification.requestPermission();
      setBrowserNotifPermission(perm);
      if (perm === "granted") {
        new Notification("Notifications Enabled", {
          body: "You will be alerted when previous or new customers message you.",
        });
      }
    }
  };

  const fetchConversations = async (isManual = false) => {
    try {
      if (isManual) setIsRefreshing(true);
      const data = await api.get<Conversation[]>("/conversations");
      
      // Check for newly arrived incoming customer messages
      let newlyArrived: Conversation | null = null;
      const nextMap: Record<string, string> = {};

      data.forEach(c => {
        nextMap[c.id] = c.last_message_at;
        const prevAt = prevConvsRef.current[c.id];
        // If not first load and timestamp advanced
        if (!isFirstLoadRef.current && prevAt && prevAt !== c.last_message_at) {
          if (c.last_message_direction === "in" || c.has_unread) {
            newlyArrived = c;
          }
        }
      });

      data.sort((a, b) => getConvTime(b) - getConvTime(a));

      if (newlyArrived) {
        setCurrentPage(1);
        if (soundEnabled) {
          playNotificationChime();
        }
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          try {
            const notif = new Notification(`New message from ${(newlyArrived as Conversation).lead_name || (newlyArrived as Conversation).wa_user_phone}`, {
              body: (newlyArrived as Conversation).last_message_text || "Incoming WhatsApp message",
              icon: "/favicon.ico"
            });
            notif.onclick = () => {
              window.focus();
              handleSelectConv(newlyArrived!);
              setCurrentPage(1);
              notif.close();
            };
          } catch (e) {
            console.error(e);
          }
        }
        setLatestAlert({
          convId: (newlyArrived as Conversation).id,
          phone: (newlyArrived as Conversation).wa_user_phone,
          name: (newlyArrived as Conversation).lead_name,
          text: (newlyArrived as Conversation).last_message_text || "New message received",
        });
      }

      prevConvsRef.current = nextMap;
      isFirstLoadRef.current = false;
      setConversations(data);
      if (cachedMonitorData) {
        cachedMonitorData.conversations = data;
      } else {
        cachedMonitorData = { conversations: data, staff: [], tenantTimezone };
      }

      // Keep selected conversation in sync
      if (selectedConv) {
        const found = data.find(c => c.id === selectedConv.id);
        if (found) setSelectedConv(found);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (isManual) setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const handleSelectConv = (conv: Conversation) => {
    setSelectedConv(conv);
    // Immediately clear unread status locally
    setConversations(prev =>
      prev.map(c => c.id === conv.id ? { ...c, has_unread: false, unread_count: 0 } : c)
    );
  };

  const fetchStaff = async () => {
    try {
      const data = await api.get<StaffUser[]>("/users/staff");
      setStaff(data);
      if (cachedMonitorData) cachedMonitorData.staff = data;
    } catch (err) {
      console.error(err);
    }
  };

  const getConvTime = (c: Conversation | null | undefined): number => {
    if (!c) return 0;
    const ts = c.last_message_at || "";
    if (!ts) return 0;
    const time = new Date(ts).getTime();
    return isNaN(time) ? 0 : time;
  };

  const fetchMessages = async (convId: string) => {
    try {
      const data = await api.get<Message[]>(`/conversations/${convId}/messages`);
      setMessages((prev) => {
        if (
          prev.length === data.length &&
          prev.length > 0 &&
          prev[prev.length - 1]?.id === data[data.length - 1]?.id &&
          prev[0]?.id === data[0]?.id &&
          prev[prev.length - 1]?.status === data[data.length - 1]?.status
        ) {
          return prev;
        }
        return data;
      });

      // Instantly update this conversation in the left sidebar so it moves to top when a message arrives
      if (data && data.length > 0) {
        const lastMsg = data[data.length - 1];
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === convId);
          if (idx === -1) return prev;
          const current = prev[idx];
          if (
            current.last_message_at !== lastMsg.timestamp ||
            current.last_message_text !== lastMsg.text ||
            current.last_message_status !== lastMsg.status
          ) {
            const updated: Conversation = {
              ...current,
              last_message_at: lastMsg.timestamp || current.last_message_at,
              last_message_text: lastMsg.text || current.last_message_text,
              last_message_direction: lastMsg.direction,
              last_message_status: lastMsg.status,
            };
            const copy = [...prev];
            copy[idx] = updated;
            copy.sort((a, b) => getConvTime(b) - getConvTime(a));
            return copy;
          }
          return prev;
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchConversations(false);
    fetchStaff();
    api.get<{ timezone?: string }>("/tenants/me")
      .then((t) => {
        if (t.timezone) setTenantTimezone(t.timezone);
      })
      .catch(() => {});
    const interval = setInterval(() => fetchConversations(false), 5000);
    return () => clearInterval(interval);
  }, [soundEnabled]);

  // Update document title with unread indicator
  useEffect(() => {
    const unreadCount = conversations.filter(c => c.has_unread || (c.unread_count && c.unread_count > 0)).length;
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) 💬 New Message - Chat Monitor`;
    } else {
      document.title = "Chat Monitor | Veltrix AI";
    }
  }, [conversations]);

  useEffect(() => {
    initialLoadDoneRef.current = false;
    isAtBottomRef.current = true;
    setShowScrollBottomBtn(false);
    if (selectedConv) {
      fetchMessages(selectedConv.id);
      setNameInput(selectedConv.lead_name || "");
      const interval = setInterval(() => fetchMessages(selectedConv.id), 3000);
      return () => clearInterval(interval);
    }
  }, [selectedConv?.id]);

  useEffect(() => {
    if (!initialLoadDoneRef.current && messages.length > 0) {
      initialLoadDoneRef.current = true;
      requestAnimationFrame(() => scrollToBottom("auto"));
    } else if (isAtBottomRef.current) {
      scrollToBottom("smooth");
    }
  }, [messages]);

  // Toggle Bot Autopilot vs Human Handled
  const toggleStatus = async () => {
    if (!selectedConv) return;
    const newStatus = selectedConv.status === "bot" ? "human" : "bot";
    try {
      const updated = await api.patch<Conversation>(`/conversations/${selectedConv.id}/status`, { status: newStatus });
      setSelectedConv(updated);
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  // Change lead stage
  const handleUpdateLeadStatus = async (newLeadStatus: string) => {
    if (!selectedConv) return;
    if (newLeadStatus === "paid lead") {
      setIsPaymentModalOpen(true);
      return;
    }
    try {
      const updated = await api.patch<Conversation>(`/conversations/${selectedConv.id}/status`, { lead_status: newLeadStatus });
      setSelectedConv(updated);
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err) {
      console.error("Failed to update lead status", err);
    }
  };

  const handleSavePayment = async (paymentData: PaymentDetails) => {
    if (!selectedConv) return;
    try {
      const updated = await api.patch<Conversation>(`/conversations/${selectedConv.id}/status`, {
        lead_status: "paid lead",
        payment: paymentData,
        notes: paymentData.notes || selectedConv.notes || null,
      });
      setSelectedConv(updated);
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
      setIsPaymentModalOpen(false);
    } catch (err: any) {
      console.error("Failed to save payment", err);
      alert(err.message || "Failed to save payment details");
      throw err;
    }
  };

  // Assign staff
  const handleAssignStaff = async (staffId: string) => {
    if (!selectedConv) return;
    try {
      const updated = await api.patch<Conversation>(`/conversations/${selectedConv.id}/status`, { 
        assigned_to: staffId === "unassigned" ? null : staffId 
      });
      setSelectedConv(updated);
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err) {
      console.error("Failed to assign staff", err);
    }
  };

  // Save Lead Name
  const handleSaveLeadName = async () => {
    if (!selectedConv) return;
    try {
      const updated = await api.patch<Conversation>(`/conversations/${selectedConv.id}/status`, { lead_name: nameInput.trim() || null });
      setSelectedConv(updated);
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
      setIsEditingName(false);
    } catch (err) {
      console.error("Failed to update lead name", err);
    }
  };

  // Open & save notes
  const openNotesModal = () => {
    if (!selectedConv) return;
    setNotesInput(selectedConv.notes || "");
    setShowNotesModal(true);
  };

  const handleSaveNotes = async () => {
    if (!selectedConv) return;
    setIsSavingNotes(true);
    try {
      const updated = await api.patch<Conversation>(`/conversations/${selectedConv.id}/status`, {
        notes: notesInput.trim() || null,
      });
      setSelectedConv(updated);
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c));
      setShowNotesModal(false);
    } catch (err: any) {
      console.error("Failed to save comments:", err);
      alert(err.message || "Failed to save comment");
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Send message
  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedConv || (!inputText.trim() && !selectedFile) || loading) return;
    setLoading(true);
    const textToSend = inputText.trim();
    const fileToSend = selectedFile;
    setInputText("");
    setSelectedFile(null);
    try {
      // If conversation was bot handled, sending manual message switches to human automatically
      if (selectedConv.status === "bot") {
        await api.patch(`/conversations/${selectedConv.id}/status`, { status: "human" });
        setSelectedConv(prev => prev ? { ...prev, status: "human" } : null);
      }
      let newMsg: Message;
      if (fileToSend) {
        const formData = new FormData();
        formData.append("file", fileToSend);
        if (textToSend) {
          formData.append("caption", textToSend);
        }
        newMsg = await api.postForm<Message>(`/conversations/${selectedConv.id}/attachments`, formData);
      } else {
        newMsg = await api.post<Message>(`/conversations/${selectedConv.id}/messages`, { text: textToSend });
      }
      setMessages(prev => [...prev, newMsg]);
      isAtBottomRef.current = true;
      setTimeout(() => scrollToBottom("smooth"), 50);

      // Immediately move this chat to the very top of the sidebar
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === selectedConv.id);
        if (idx === -1) return prev;
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          last_message_at: newMsg.timestamp || new Date().toISOString(),
          last_message_text: newMsg.text,
          last_message_direction: "out",
          last_message_status: newMsg.status || "sent",
        };
        copy.sort((a, b) => getConvTime(b) - getConvTime(a));
        return copy;
      });

      fetchConversations();
    } catch (err: any) {
      console.error("Failed to send message", err);
      alert(err.message || "Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  // Filtered list auto-sorted by newest message at the top
  const filteredConversations = useMemo(() => {
    return conversations
      .filter(c => {
        const matchesSearch = 
          c.wa_user_phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (c.lead_name && c.lead_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (c.assigned_email && c.assigned_email.toLowerCase().includes(searchQuery.toLowerCase()));
        if (!matchesSearch) return false;

        // Filter by Bot vs Human
        if (statusFilter === "bot" && c.status !== "bot") return false;
        if (statusFilter === "human" && c.status !== "human") return false;

        // Filter by Lead Contact Status
        if (leadStatusFilter !== "all") {
          const norm = normalizeLeadStatus(c.lead_status);
          if (leadStatusFilter === "sales close") {
            if (norm !== "sales close" && norm !== "converted") return false;
          } else if (norm !== leadStatusFilter) {
            return false;
          }
        }

        // Filter by Unread Only
        if (unreadOnly) {
          const isUnread = Boolean(c.has_unread || (c.unread_count && c.unread_count > 0));
          if (!isUnread) return false;
        }

        return true;
      })
      .sort((a, b) => getConvTime(b) - getConvTime(a));
  }, [conversations, searchQuery, statusFilter, leadStatusFilter, unreadOnly]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredConversations.length / pageSize));
  const paginatedConversations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredConversations.slice(start, start + pageSize);
  }, [filteredConversations, currentPage, pageSize]);

  // Adjust page if out of bounds
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Summary counts
  const botCount = useMemo(() => conversations.filter(c => c.status === "bot").length, [conversations]);
  const humanCount = useMemo(() => conversations.filter(c => c.status === "human").length, [conversations]);

  const notContactedCount = useMemo(() => {
    return conversations.filter(c => normalizeLeadStatus(c.lead_status) === "not contacted").length;
  }, [conversations]);

  const contactedCount = useMemo(() => {
    return conversations.filter(c => normalizeLeadStatus(c.lead_status) === "contacted").length;
  }, [conversations]);

  const notAnsweringCount = useMemo(() => {
    return conversations.filter(c => normalizeLeadStatus(c.lead_status) === "not answering").length;
  }, [conversations]);

  const followUpCount = useMemo(() => {
    return conversations.filter(c => normalizeLeadStatus(c.lead_status) === "follow up").length;
  }, [conversations]);

  const salesCloseCount = useMemo(() => {
    return conversations.filter(c => {
      const norm = normalizeLeadStatus(c.lead_status);
      return norm === "sales close" || norm === "converted";
    }).length;
  }, [conversations]);

  const junkLeadsCount = useMemo(() => {
    return conversations.filter(c => normalizeLeadStatus(c.lead_status) === "junk leads").length;
  }, [conversations]);

  return (
    <div className="relative flex h-[calc(100vh-7.5rem)] lg:h-[calc(100vh-8.5rem)] rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      {/* Real-time Floating Notification Alert Banner */}
      <AnimatePresence>
        {latestAlert && (
          <motion.div
            initial={{ opacity: 0, y: -25, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -25, scale: 0.95 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border border-emerald-300 bg-white/95 px-4 py-2.5 shadow-2xl backdrop-blur-md max-w-lg w-full ring-1 ring-emerald-500/20"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-200 shrink-0">
              <BellRing className="h-4 w-4 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900 truncate">
                  {latestAlert.name ? `${latestAlert.name} (${latestAlert.phone})` : latestAlert.phone}
                </span>
                <span className="rounded bg-emerald-100 text-emerald-800 text-[9px] font-extrabold px-1.5 py-0.2 uppercase">
                  New Message
                </span>
              </div>
              <p className="text-[11px] text-slate-600 truncate mt-0.5 font-medium">
                {latestAlert.text}
              </p>
            </div>
            <button
              onClick={() => {
                const found = conversations.find(c => c.id === latestAlert.convId);
                if (found) {
                  handleSelectConv(found);
                  setCurrentPage(1);
                }
                setLatestAlert(null);
              }}
              className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition-all shrink-0 shadow-xs"
            >
              Open Chat
            </button>
            <button
              onClick={() => setLatestAlert(null)}
              className="text-slate-400 hover:text-slate-600 p-1 shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LEFT PANE: Conversations Inbox ── */}
      <div className={cn(
        "flex w-full lg:w-96 flex-col border-r border-slate-200/80 bg-slate-50/50 shrink-0",
        selectedConv ? "hidden lg:flex" : "flex"
      )}>
        {/* Inbox Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3 bg-white">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Inbox Monitor</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {filteredConversations.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Sound Mute / Unmute Toggle */}
            <button
              onClick={toggleSound}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
                soundEnabled 
                  ? "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100" 
                  : "border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50"
              )}
              title={soundEnabled ? "Sound chime enabled (Click to mute)" : "Sound muted (Click to enable)"}
            >
              {soundEnabled ? <Volume2 className="h-3.5 w-3.5 text-emerald-600" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>

            {/* Desktop Browser Notification Opt-in */}
            {browserNotifPermission !== "granted" && (
              <button
                onClick={requestBrowserNotification}
                className="flex h-8 items-center gap-1 px-2 rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-[11px] font-semibold transition-all"
                title="Enable desktop notifications"
              >
                <Bell className="h-3.5 w-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Alerts</span>
              </button>
            )}

            {/* Start New Chat Button */}
            <button
              onClick={() => setIsNewChatOpen(true)}
              className="flex h-8 items-center gap-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-xs transition-all cursor-pointer"
              title="Start new chat manually"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span>New Chat</span>
            </button>

            {/* Manual Refresh Button */}
            <button
              onClick={() => fetchConversations(true)}
              disabled={isRefreshing}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              title="Refresh conversations"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-indigo-600")} />
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="p-3 border-b border-slate-200/80 bg-white space-y-2">
          {/* Search Box & Unread Toggle Button */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by phone, name..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8.5 pr-3 py-1.5 text-xs text-slate-900 outline-none transition-all focus:border-slate-400 focus:bg-white placeholder:text-slate-400"
              />
            </div>
            <button
              onClick={() => {
                setUnreadOnly(prev => !prev);
                setCurrentPage(1);
              }}
              className={cn(
                "h-8 px-2.5 rounded-xl border text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 select-none",
                unreadOnly
                  ? "border-emerald-500 bg-emerald-600 text-white shadow-xs"
                  : "border-slate-200 bg-slate-50/70 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
              title={unreadOnly ? "Showing unread only. Click to show all." : "Filter unread chats"}
            >
              <span className={cn(
                "h-2 w-2 rounded-full",
                unreadOnly ? "bg-white" : (unreadTotalCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-300")
              )} />
              <span>Unread</span>
              {unreadTotalCount > 0 && (
                <span className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-extrabold leading-none",
                  unreadOnly ? "bg-white text-emerald-700" : "bg-emerald-500 text-white"
                )}>
                  {unreadTotalCount}
                </span>
              )}
            </button>
          </div>

          {/* Active Unread Filter Notice */}
          {unreadOnly && (
            <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200/60 text-[11px] text-emerald-800 animate-in fade-in duration-150">
              <span className="font-semibold">Showing Unread Chats Only ({filteredConversations.length})</span>
              <button
                onClick={() => { setUnreadOnly(false); setCurrentPage(1); }}
                className="text-[10px] font-bold text-emerald-700 hover:text-emerald-950 underline"
              >
                Show All
              </button>
            </div>
          )}

          {/* Lead Status Filter Pills (Contacted / Not Contacted) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lead Status</span>
              {leadStatusFilter !== "all" && (
                <button
                  onClick={() => { setLeadStatusFilter("all"); setCurrentPage(1); }}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => { setLeadStatusFilter("all"); setCurrentPage(1); }}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-semibold rounded-lg shrink-0 transition-all",
                  leadStatusFilter === "all"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                All ({conversations.length})
              </button>

              <button
                onClick={() => { setLeadStatusFilter("not contacted"); setCurrentPage(1); }}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-semibold rounded-lg shrink-0 transition-all flex items-center gap-1.5",
                  leadStatusFilter === "not contacted"
                    ? "bg-slate-800 text-white shadow-xs ring-1 ring-slate-900"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/60"
                )}
              >
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  leadStatusFilter === "not contacted" ? "bg-amber-400" : "bg-slate-400"
                )} />
                <span>Not Contacted ({notContactedCount})</span>
              </button>

              <button
                onClick={() => { setLeadStatusFilter("contacted"); setCurrentPage(1); }}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-semibold rounded-lg shrink-0 transition-all flex items-center gap-1.5",
                  leadStatusFilter === "contacted"
                    ? "bg-blue-600 text-white shadow-xs ring-1 ring-blue-700"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/60"
                )}
              >
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  leadStatusFilter === "contacted" ? "bg-white" : "bg-blue-500"
                )} />
                <span>Contacted ({contactedCount})</span>
              </button>

              {(notAnsweringCount > 0 || leadStatusFilter === "not answering") && (
                <button
                  onClick={() => { setLeadStatusFilter("not answering"); setCurrentPage(1); }}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-lg shrink-0 transition-all flex items-center gap-1.5",
                    leadStatusFilter === "not answering"
                      ? "bg-rose-600 text-white shadow-xs ring-1 ring-rose-700"
                      : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/60"
                  )}
                >
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    leadStatusFilter === "not answering" ? "bg-white" : "bg-rose-500"
                  )} />
                  <span>Not Answering ({notAnsweringCount})</span>
                </button>
              )}

              {followUpCount > 0 && (
                <button
                  onClick={() => { setLeadStatusFilter("follow up"); setCurrentPage(1); }}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-lg shrink-0 transition-all flex items-center gap-1.5",
                    leadStatusFilter === "follow up"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60"
                  )}
                >
                  <span>Follow up ({followUpCount})</span>
                </button>
              )}

              {salesCloseCount > 0 && (
                <button
                  onClick={() => { setLeadStatusFilter("sales close"); setCurrentPage(1); }}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-lg shrink-0 transition-all flex items-center gap-1.5",
                    leadStatusFilter === "sales close"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60"
                  )}
                >
                  <span>Closed ({salesCloseCount})</span>
                </button>
              )}

              {(junkLeadsCount > 0 || leadStatusFilter === "junk leads") && (
                <button
                  onClick={() => { setLeadStatusFilter("junk leads"); setCurrentPage(1); }}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-lg shrink-0 transition-all flex items-center gap-1.5",
                    leadStatusFilter === "junk leads"
                      ? "bg-stone-800 text-white shadow-xs ring-1 ring-stone-900"
                      : "bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200/60"
                  )}
                >
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    leadStatusFilter === "junk leads" ? "bg-white" : "bg-stone-400"
                  )} />
                  <span>Junk Leads ({junkLeadsCount})</span>
                </button>
              )}
            </div>
          </div>

          {/* Automation Mode Segmented Control (Bot vs Human) */}
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200/80 p-0.5 bg-slate-100/60">
            <button
              onClick={() => { setStatusFilter("all"); setCurrentPage(1); }}
              className={cn(
                "py-1 text-[11px] font-semibold rounded-lg transition-all text-center",
                statusFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
              )}
            >
              All Modes
            </button>
            <button
              onClick={() => { setStatusFilter("bot"); setCurrentPage(1); }}
              className={cn(
                "py-1 text-[11px] font-semibold rounded-lg transition-all text-center flex items-center justify-center gap-1",
                statusFilter === "bot" ? "bg-white text-emerald-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Bot ({botCount})
            </button>
            <button
              onClick={() => { setStatusFilter("human"); setCurrentPage(1); }}
              className={cn(
                "py-1 text-[11px] font-semibold rounded-lg transition-all text-center flex items-center justify-center gap-1",
                statusFilter === "human" ? "bg-white text-amber-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Human ({humanCount})
            </button>
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-200">
          {paginatedConversations.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center p-4">
              <MessageSquare className="h-8 w-8 text-slate-300 mb-1" />
              <p className="text-xs font-semibold text-slate-600">
                {unreadOnly ? "No unread chats" : "No chats found"}
              </p>
              <p className="text-[11px] text-slate-400">
                {unreadOnly ? "All incoming messages have been caught up" : "Try changing your search or filter"}
              </p>
              {unreadOnly && (
                <button
                  onClick={() => { setUnreadOnly(false); setCurrentPage(1); }}
                  className="mt-2 text-xs font-semibold text-emerald-600 hover:text-emerald-800 underline"
                >
                  View all chats
                </button>
              )}
            </div>
          ) : (
            paginatedConversations.map((conv) => {
              const isSelected = selectedConv?.id === conv.id;
              const initial = (conv.lead_name || conv.wa_user_phone).charAt(0).toUpperCase();
              const hasUnread = Boolean(conv.has_unread || (conv.unread_count && conv.unread_count > 0));

              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConv(conv)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border transition-all relative flex items-start gap-3",
                    isSelected
                      ? "border-slate-900 bg-white shadow-xs ring-1 ring-slate-900"
                      : hasUnread
                      ? "border-emerald-400 bg-emerald-50/25 shadow-xs hover:border-emerald-500"
                      : "border-slate-200/70 bg-white hover:border-slate-300 hover:shadow-xs"
                  )}
                >
                  {/* Avatar with Status Dot & Unread Ping */}
                  <div className="relative shrink-0 mt-0.5">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold shadow-xs",
                      isSelected ? "bg-slate-900 text-white" : hasUnread ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
                    )}>
                      {initial}
                    </div>
                    <span className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white",
                      conv.status === "bot" ? "bg-emerald-500" : "bg-amber-500"
                    )} />
                    {hasUnread && (
                      <span className="absolute -top-1 -left-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                      </span>
                    )}
                  </div>

                  {/* Info Column */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn(
                          "text-xs truncate",
                          hasUnread ? "font-black text-slate-900" : "font-bold text-slate-900"
                        )}>
                          {conv.lead_name || conv.wa_user_phone}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={cn(
                          "text-[10px] shrink-0 font-medium",
                          hasUnread ? "text-emerald-700 font-bold" : "text-slate-400"
                        )}>
                          {formatTimeOnly(conv.last_message_at, tenantTimezone)}
                        </span>
                        {hasUnread && (
                          <span className="rounded-full bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.2 shrink-0 animate-pulse">
                            NEW
                          </span>
                        )}
                      </div>
                    </div>

                    {conv.lead_name && (
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[11px] text-slate-500 font-mono truncate">
                          {conv.wa_user_phone}
                        </span>
                        <CopyButton text={conv.wa_user_phone} className="p-0.5" iconClassName="h-3 w-3" title="Copy phone number" />
                      </div>
                    )}

                    {/* Last Message Snippet */}
                    <p className={cn(
                      "text-[11px] line-clamp-1 mb-1.5 leading-snug",
                      hasUnread ? "text-slate-900 font-semibold" : "text-slate-500"
                    )}>
                      {conv.last_message_direction === "out" && <span className="text-slate-400 font-normal">You: </span>}
                      {conv.last_message_text || "No message content"}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Mode Badge */}
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider",
                        conv.status === "bot" 
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60" 
                          : "bg-amber-50 text-amber-700 border border-amber-200/60"
                      )}>
                        {conv.status === "bot" ? "AI Bot" : "Human"}
                      </span>

                      {/* Lead Stage Badge */}
                      {conv.lead_status && (
                        <span className={cn(
                          "rounded-md px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider border",
                          getLeadStatusBadgeStyle(conv.lead_status)
                        )}>
                          {getLeadStatusLabel(conv.lead_status)}
                        </span>
                      )}

                      {/* Assignee if any */}
                      {conv.assigned_email && (
                        <span className="text-[10px] text-slate-400 font-medium truncate max-w-[80px]">
                          @{conv.assigned_email.split('@')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between border-t border-slate-200/80 px-3.5 py-2.5 bg-white text-xs text-slate-500">
          <span>
            {filteredConversations.length > 0 ? (
              <>Page <strong className="text-slate-800">{currentPage}</strong> of <strong className="text-slate-800">{totalPages}</strong></>
            ) : "0 chats"}
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
              title="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
              title="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANE: Chat Detail & CRM Workspace ── */}
      <div className={cn(
        "flex flex-1 flex-col bg-slate-50/30 overflow-hidden",
        !selectedConv ? "hidden lg:flex" : "flex"
      )}>
        {selectedConv ? (
          <>
            {/* Top Contact & Control Bar */}
            <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-white px-6 py-3.5 lg:flex-row lg:items-center lg:justify-between shrink-0 shadow-xs">
              {/* Left: Contact Info */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedConv(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors shrink-0"
                  title="Back to inbox"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-sm shadow-xs">
                  {(selectedConv.lead_name || selectedConv.wa_user_phone).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    {isEditingName ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          placeholder="Contact name..."
                          className="rounded-lg border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-900 outline-none focus:border-slate-900"
                        />
                        <button 
                          onClick={handleSaveLeadName}
                          className="rounded-md bg-slate-900 p-1 text-white hover:bg-slate-800"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-bold text-slate-900">
                          {selectedConv.lead_name || "Unnamed Contact"}
                        </h3>
                        <button
                          onClick={() => setIsEditingName(true)}
                          className="text-slate-400 hover:text-slate-700"
                          title="Edit lead name"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-mono text-slate-500 font-medium">
                        ({selectedConv.wa_user_phone})
                      </span>
                      <CopyButton text={selectedConv.wa_user_phone} title="Copy phone number" showFeedbackText />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 flex-wrap">
                    {selectedConv.setter_email && (
                      <span>Setter: <strong className="text-slate-700 font-semibold">{selectedConv.setter_name || selectedConv.setter_email.split('@')[0]}</strong> <span className="text-slate-400">({selectedConv.setter_email})</span></span>
                    )}
                    {selectedConv.closer_email && (
                      <>
                        <span>•</span>
                        <span>Closer: <strong className="text-slate-700 font-semibold">{selectedConv.closer_name || selectedConv.closer_email.split('@')[0]}</strong> <span className="text-slate-400">({selectedConv.closer_email})</span></span>
                      </>
                    )}
                    {customerActivityStatus && (
                      <>
                        <span>•</span>
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors",
                          customerActivityStatus.color
                        )}>
                          {customerActivityStatus.active ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          )}
                          <span>{customerActivityStatus.text}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: CRM Controls (Status, Assign, Mode) */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Lead Status Selector */}
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-1 bg-slate-50/50">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status:</span>
                  <select
                    value={normalizeLeadStatus(selectedConv.lead_status)}
                    onChange={(e) => handleUpdateLeadStatus(e.target.value)}
                    className={cn(
                      "rounded-lg px-2 py-0.5 text-xs font-bold uppercase tracking-wider border outline-none cursor-pointer transition-all",
                      getLeadStatusBadgeStyle(selectedConv.lead_status)
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
                    onClick={() => setIsStatusLogsOpen(true)}
                    className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-white rounded-lg transition-all ml-0.5"
                    title="View Status Change History Logs"
                  >
                    <History className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Payment Details Button */}
                {(selectedConv.payment || normalizeLeadStatus(selectedConv.lead_status) === "paid lead") && (
                  <button
                    type="button"
                    onClick={() => setIsPaymentModalOpen(true)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold transition-all border shadow-xs",
                      selectedConv.payment?.total_payment != null
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                        : "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500"
                    )}
                    title="View or update payment details"
                  >
                    <CreditCard className={cn("h-3.5 w-3.5", selectedConv.payment?.total_payment != null ? "text-emerald-600" : "text-white")} />
                    <span>
                      {selectedConv.payment?.total_payment != null
                        ? `$${selectedConv.payment.advance_payment ?? 0} / $${selectedConv.payment.total_payment}${
                            selectedConv.payment.remaining_payment != null && selectedConv.payment.remaining_payment > 0
                              ? ` (Rem: $${selectedConv.payment.remaining_payment})`
                              : " (Paid)"
                          }`
                        : "Payment Details"}
                    </span>
                  </button>
                )}

                {/* Staff Assignment Dropdown */}
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-1 bg-slate-50/50">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Assigned:</span>
                  <select
                    value={selectedConv.assigned_to || "unassigned"}
                    onChange={(e) => handleAssignStaff(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-800 outline-none cursor-pointer max-w-[160px] truncate"
                  >
                    <option value="unassigned">Unassigned</option>
                    {staff.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email.split('@')[0]} ({u.staff_type})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Additional Comments / Notes Button */}
                <button
                  type="button"
                  onClick={openNotesModal}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all border shadow-xs",
                    selectedConv.notes
                      ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  )}
                  title="View and edit comments / notes for Setter & Closer"
                >
                  <StickyNote className="h-3.5 w-3.5 text-amber-600" />
                  <span>{selectedConv.notes ? "Notes" : "+ Note"}</span>
                </button>

                {/* Bot Autopilot Toggle Switch */}
                <button
                  onClick={toggleStatus}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition-all border shadow-xs",
                    selectedConv.status === "bot"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                  )}
                  title={selectedConv.status === "bot" ? "Click to take over chat" : "Click to hand back to AI Bot"}
                >
                  {selectedConv.status === "bot" ? (
                    <>
                      <Bot className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Bot Active</span>
                    </>
                  ) : (
                    <>
                      <User className="h-3.5 w-3.5 text-amber-600" />
                      <span>Human Control</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Note Preview Bar */}
            {selectedConv.notes && (
              <div 
                onClick={openNotesModal}
                className="border-b border-amber-200/60 bg-amber-50/70 px-6 py-2 flex items-center justify-between gap-4 cursor-pointer hover:bg-amber-100/70 transition-colors shrink-0"
                title="Click to edit additional comments"
              >
                <div className="flex items-center gap-2 text-xs text-amber-950 min-w-0">
                  <StickyNote className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span className="font-bold text-[10px] text-amber-800 uppercase tracking-wider shrink-0">Setter & Closer Note:</span>
                  <span className="truncate font-medium text-slate-800">{selectedConv.notes}</span>
                </div>
                <span className="text-[11px] font-bold text-amber-700 underline shrink-0">Edit</span>
              </div>
            )}

            {/* Messages Area */}
            <div className="relative flex-1 min-h-0 flex flex-col">
              <div 
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-slate-200 overscroll-contain"
              >
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                  <MessageSquare className="h-10 w-10 text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-600">No messages yet in this conversation</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isIncoming = msg.direction === "in";
                  const mediaUrl = msg.media_url ? getMediaUrl(msg.media_url) : "";
                  const isImage = msg.media_type === "image" || (msg.media_url && /\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(msg.media_url));
                  const isVideo = msg.media_type === "video" || (msg.media_url && /\.(mp4|mov|webm|3gp|3gpp)($|\?)/i.test(msg.media_url));
                  const isAudio = msg.media_type === "audio" || (msg.media_url && /\.(ogg|opus|mp3|m4a|wav|aac|amr)($|\?)/i.test(msg.media_url));
                  const isDocument = (msg.media_type === "document" || (!isImage && !isVideo && !isAudio)) && !!msg.media_url;

                  return (
                    <div 
                      key={msg.id} 
                      className={cn("flex flex-col group/row relative", isIncoming ? "items-start" : "items-end")}
                    >
                      <div className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-2.5 shadow-xs text-sm relative group",
                        isIncoming 
                          ? "bg-white border border-slate-200/80 text-slate-900 rounded-bl-xs" 
                          : "bg-slate-900 text-white rounded-br-xs"
                      )}>
                        {/* Hover Action Buttons for Edit / Delete */}
                        {editingMessageId !== msg.id && (
                          <div className={cn(
                            "absolute top-1 opacity-0 group-hover:opacity-100 group-hover/row:opacity-100 transition-all flex items-center gap-1 z-10",
                            isIncoming ? "-right-16 flex-row" : "-left-16 flex-row-reverse"
                          )}>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(msg)}
                              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 shadow-xs transition-colors"
                              title="Edit message"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingMessageId(msg.id)}
                              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 shadow-xs transition-colors"
                              title="Delete message"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                        {/* Image Rendering */}
                        {isImage && mediaUrl && (
                          <div className="mb-2 group relative overflow-hidden rounded-xl border border-black/10 bg-slate-900/5 max-w-[340px]">
                            <a 
                              href={mediaUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="block relative cursor-pointer"
                            >
                              <img 
                                src={mediaUrl} 
                                alt={msg.media_filename || "Image"} 
                                loading="lazy"
                                className="max-h-80 w-auto rounded-xl object-contain hover:opacity-95 transition-all shadow-xs" 
                                onError={(e) => {
                                  const parent = e.currentTarget.parentElement;
                                  if (parent) {
                                    e.currentTarget.style.display = "none";
                                    const fallback = parent.querySelector(".img-fallback") as HTMLElement;
                                    if (fallback) fallback.style.display = "flex";
                                  }
                                }}
                              />
                              <div 
                                className="img-fallback hidden p-4 flex-col items-center justify-center gap-2 text-center text-xs text-slate-500 bg-slate-100 rounded-xl min-w-[200px]"
                              >
                                <ImageIcon className="h-8 w-8 text-slate-400" />
                                <span className="font-medium text-slate-700">Photo received</span>
                                <span className="text-[11px] text-blue-600 hover:underline">Click to view / download</span>
                              </div>
                            </a>
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                              <a
                                href={mediaUrl}
                                download={msg.media_filename || "image.jpg"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white shadow-md backdrop-blur-xs transition-colors"
                                title="Download Image"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </a>
                              <a
                                href={mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white shadow-md backdrop-blur-xs transition-colors"
                                title="Open Full Image"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </div>
                        )}

                        {/* Audio Rendering */}
                        {isAudio && mediaUrl && (
                          <div className={cn(
                            "mb-2 p-3 rounded-xl border flex flex-col gap-2 min-w-[240px] sm:min-w-[280px]",
                            isIncoming
                              ? "bg-slate-50 border-slate-200 text-slate-800"
                              : "bg-slate-800 border-slate-700 text-slate-100"
                          )}>
                            <div className="flex items-center gap-2 text-xs font-semibold">
                              <div className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-xs",
                                isIncoming ? "bg-emerald-100 text-emerald-700" : "bg-emerald-500/20 text-emerald-300"
                              )}>
                                <Mic className="h-4 w-4" />
                              </div>
                              <span className="truncate">Voice Note / Audio</span>
                              <a 
                                href={mediaUrl} 
                                download={msg.media_filename || "audio.ogg"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-auto opacity-70 hover:opacity-100 transition-opacity p-1"
                                title="Download Audio"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </div>
                            <audio 
                              controls 
                              preload="metadata" 
                              src={mediaUrl} 
                              className="w-full h-10 rounded-lg outline-none"
                            />
                          </div>
                        )}

                        {/* Video Rendering */}
                        {isVideo && mediaUrl && (
                          <div className="mb-2 overflow-hidden rounded-xl border border-black/10 bg-slate-950 min-w-[260px] max-w-[360px] shadow-sm">
                            <video 
                              controls 
                              playsInline
                              preload="metadata"
                              src={mediaUrl} 
                              className="max-h-80 w-full object-contain rounded-t-xl bg-black"
                            />
                            <div className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300">
                              <span className="truncate flex items-center gap-1.5 text-[11px] font-medium text-slate-200">
                                <Film className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                <span className="truncate">{msg.media_filename || "Video attachment"}</span>
                              </span>
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                <a 
                                  href={mediaUrl} 
                                  download={msg.media_filename || "video.mp4"}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold hover:underline"
                                  title="Download Video"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                                <a 
                                  href={mediaUrl} 
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 font-semibold"
                                  title="Open Video in New Tab"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Document Rendering */}
                        {isDocument && mediaUrl && (
                          <a 
                            href={mediaUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={cn(
                              "mb-2 flex items-center gap-3 p-3 rounded-xl border transition-all text-xs font-semibold",
                              isIncoming
                                ? "bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100"
                                : "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
                            )}
                          >
                            <div className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-xs",
                              isIncoming ? "bg-red-50 text-red-600 border border-red-200/60" : "bg-red-500/20 text-red-300"
                            )}>
                              <FileText className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate">{msg.media_filename || "Document.pdf"}</p>
                              <span className="text-[10px] opacity-75 flex items-center gap-1 mt-0.5">
                                <Download className="h-3 w-3" /> View / Download Document
                              </span>
                            </div>
                          </a>
                        )}

                        {/* Text / Editing view */}
                        {editingMessageId === msg.id ? (
                          <div className="flex flex-col gap-2 min-w-[220px] sm:min-w-[280px] py-1">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSaveEdit(msg.id);
                                } else if (e.key === "Escape") {
                                  handleCancelEdit();
                                }
                              }}
                              autoFocus
                              rows={2}
                              className={cn(
                                "w-full p-2 text-sm rounded-lg border outline-none resize-none transition-all",
                                isIncoming
                                  ? "bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                  : "bg-slate-800 border-slate-700 text-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                              )}
                              placeholder="Edit message..."
                            />
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={handleCancelEdit}
                                disabled={isSavingEdit}
                                className={cn(
                                  "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors",
                                  isIncoming
                                    ? "text-slate-600 hover:bg-slate-100"
                                    : "text-slate-300 hover:bg-slate-800"
                                )}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(msg.id)}
                                disabled={isSavingEdit || !editingText.trim()}
                                className="px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1"
                              >
                                {isSavingEdit ? (
                                  <>
                                    <RefreshCw className="h-3 w-3 animate-spin" /> Saving...
                                  </>
                                ) : (
                                  <>
                                    <Check className="h-3 w-3" /> Save
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {msg.text && (
                              <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                            )}
                          </>
                        )}
                        <div className={cn(
                          "mt-1.5 flex items-center gap-1.5 text-[10px] font-medium leading-none select-none",
                          isIncoming ? "justify-start text-slate-400" : "justify-end text-slate-300"
                        )}>
                          <span>{formatTimeOnly(msg.timestamp, tenantTimezone)}</span>
                          {msg.is_edited && (
                            <span className="italic opacity-70 text-[9px] font-normal">(edited)</span>
                          )}
                          {!isIncoming && (
                            <MessageStatusTick status={msg.status} />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
                <div ref={messagesEndRef} />
              </div>

              {/* Floating Scroll To Bottom Button */}
              {showScrollBottomBtn && (
                <button
                  type="button"
                  onClick={() => scrollToBottom("smooth")}
                  className="absolute bottom-4 right-6 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 border border-slate-700/50"
                  title="Scroll to latest messages"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Bottom Message Composer */}
            <div className="border-t border-slate-200/80 bg-white p-3.5 shrink-0">
              {selectedConv.status === "bot" && (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-50/80 px-3 py-1.5 text-xs text-amber-800 border border-amber-200/60">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                    AI Bot is currently answering customer queries autonomously.
                  </span>
                  <span className="text-[11px] text-amber-700 font-semibold">
                    Sending a reply will switch this chat to Human control
                  </span>
                </div>
              )}

              {/* Selected Attachment Preview */}
              {selectedFile && (() => {
                const isVid = selectedFile.type.startsWith("video/") || /\.(mp4|3gp|mov|webm)$/i.test(selectedFile.name);
                const isImg = selectedFile.type.startsWith("image/");
                return (
                  <div className={cn(
                    "mb-2 flex items-center justify-between rounded-xl border px-3.5 py-2 text-xs shadow-2xs",
                    isVid 
                      ? "bg-blue-50/90 border-blue-200/90 text-blue-900" 
                      : "bg-indigo-50/90 border-indigo-200/80 text-indigo-900"
                  )}>
                    <div className="flex items-center gap-2.5 truncate">
                      {isVid ? (
                        <Film className="h-4 w-4 text-blue-600 shrink-0" />
                      ) : isImg ? (
                        <ImageIcon className="h-4 w-4 text-indigo-600 shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-red-600 shrink-0" />
                      )}
                      <span className="font-semibold truncate">{selectedFile.name}</span>
                      <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md", isVid ? "bg-blue-200 text-blue-800" : "bg-indigo-200 text-indigo-800")}>
                        {isVid ? "Video" : isImg ? "Photo" : "Document"}
                      </span>
                      <span className="text-[11px] opacity-75 shrink-0 font-mono">
                        {selectedFile.size > 1024 * 1024 
                          ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB` 
                          : `${(selectedFile.size / 1024).toFixed(1)} KB`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="p-1 rounded-lg hover:bg-black/10 transition-colors ml-2 cursor-pointer"
                      title="Remove attachment"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })()}

              <form onSubmit={sendMessage} className="flex flex-col gap-1.5">
                <div className="flex items-end gap-2">
                  {/* File Attachment Button (Image / Document) */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    title="Attach PDF or Image"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-40 mb-0.5 cursor-pointer"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,video/mp4,video/3gpp,video/quicktime,video/webm"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setSelectedFile(file);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />

                  {/* Video Attachment Button */}
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={loading}
                    title="Send Video (MP4, 3GP, MOV)"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50/50 text-blue-600 hover:bg-blue-100/80 hover:border-blue-300 transition-colors disabled:opacity-40 mb-0.5 cursor-pointer"
                  >
                    <Video className="h-4 w-4" />
                  </button>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/3gpp,video/quicktime,video/webm,.mp4,.3gp,.mov"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setSelectedFile(file);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />

                  <div className="relative flex-1 min-w-0">
                    <textarea
                      ref={textareaRef}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={1}
                      placeholder={
                        selectedFile
                          ? selectedFile.type.startsWith("video/") || /\.(mp4|3gp|mov|webm)$/i.test(selectedFile.name)
                            ? "Add a caption for this video..."
                            : "Add a caption for this attachment..."
                          : "Type a WhatsApp message to the customer... (Enter to change line)"
                      }
                      className="w-full min-h-[42px] max-h-36 resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-slate-400 focus:bg-white placeholder:text-slate-400 leading-relaxed scrollbar-thin scrollbar-thumb-slate-200"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || (!inputText.trim() && !selectedFile)}
                    className="flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-40 transition-all shrink-0 mb-0.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send</span>
                  </button>
                </div>

                <div className="flex items-center justify-between px-1 text-[11px] text-slate-400 select-none">
                  <span className="truncate">
                    {enterToSend 
                      ? "Press Enter to send • Shift + Enter for new line" 
                      : "Press Enter for new line • Ctrl+Enter or click Send to send"}
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-500 hover:text-slate-800 transition-colors shrink-0 ml-2">
                    <input
                      type="checkbox"
                      checked={enterToSend}
                      onChange={toggleEnterToSend}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer accent-slate-900"
                    />
                    <span className="font-medium">Enter to send</span>
                  </label>
                </div>
              </form>
            </div>
          </>
        ) : (
          /* Empty Workspace Welcome State */
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-4 shadow-xs">
              <MessageSquare className="h-8 w-8 text-slate-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Select a Conversation to Monitor</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm">
              Choose an active WhatsApp conversation from the left to view messages in real-time, take over from the bot, or assign to team members.
            </p>

            {/* Quick stats banner */}
            <div className="mt-8 grid grid-cols-2 gap-4 max-w-md w-full">
              <div className="rounded-xl border border-slate-200/80 bg-white p-4 text-left shadow-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Inquiries</span>
                <p className="text-2xl font-bold text-slate-900 mt-1">{conversations.length}</p>
                <span className="text-[11px] text-slate-400">WhatsApp conversations</span>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white p-4 text-left shadow-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bot Autopilot Rate</span>
                <p className="text-2xl font-bold text-emerald-600 mt-1">
                  {conversations.length > 0 ? Math.round((botCount / conversations.length) * 100) : 0}%
                </p>
                <span className="text-[11px] text-slate-400">Handled automatically</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Additional Comments Modal */}
      {showNotesModal && selectedConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setShowNotesModal(false)}
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
                  Lead: <strong className="text-slate-700">{selectedConv.lead_name || "Customer"}</strong> ({selectedConv.wa_user_phone})
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-500 mb-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              💡 <strong>Setter & Closer Shared Notes:</strong> Use this to record handover details, pricing quotes, deal objections, or appointment callback times.
            </div>

            <textarea
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              rows={5}
              placeholder="Type comments or notes here... (e.g. 'Customer wants pricing for package B. Ready to buy once discount confirmed. Callback tomorrow 3 PM.')"
              className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-all placeholder:text-slate-400 resize-none font-medium leading-relaxed bg-slate-50/50 focus:bg-white"
            />

            <div className="mt-4 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowNotesModal(false)}
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
      {selectedConv && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          onSave={handleSavePayment}
          leadName={selectedConv.lead_name}
          leadPhone={selectedConv.wa_user_phone}
          initialData={selectedConv.payment}
          initialNotes={selectedConv.notes}
        />
      )}

      {/* Lead Status Logs History Modal */}
      {selectedConv && isStatusLogsOpen && (
        <LeadStatusLogsModal
          conversationId={selectedConv.id}
          leadName={selectedConv.lead_name}
          phone={selectedConv.wa_user_phone}
          currentStatus={selectedConv.lead_status}
          initialLogs={selectedConv.lead_status_logs}
          onClose={() => setIsStatusLogsOpen(false)}
        />
      )}

      {/* Delete Message Confirmation Modal */}
      <AnimatePresence>
        {deletingMessageId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 text-slate-900">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Delete Message?</h3>
                  <p className="text-xs text-slate-500">This will remove the message permanently.</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 mb-5 bg-slate-50 p-3 rounded-xl border border-slate-100 line-clamp-3">
                "{messages.find((m) => m.id === deletingMessageId)?.text || messages.find((m) => m.id === deletingMessageId)?.media_filename || "Attachment"}"
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingMessageId(null)}
                  disabled={isDeletingMsg}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deletingMessageId && handleDeleteMessage(deletingMessageId)}
                  disabled={isDeletingMsg}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {isDeletingMsg ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" /> Delete Message
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Manual New Chat Modal */}
      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        staffList={staff}
        onSuccess={(newConv) => {
          fetchConversations(true);
          if (newConv?.id) {
            setSelectedConv(newConv);
          }
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  MessageCircle, 
  Bot, 
  User, 
  ArrowLeft, 
  RefreshCw, 
  Handshake, 
  UserPlus, 
  Send, 
  Clock, 
  ShieldCheck, 
  Sparkles,
  Paperclip,
  FileText,
  Image as ImageIcon,
  X,
  Download,
  StickyNote,
  Edit3,
  Mic,
  Check,
  ChevronDown,
  CreditCard,
  Film,
  ExternalLink,
  Pencil,
  Trash2,
  History,
  Video,
  AlertCircle,
  Ban
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CopyButton } from "../../_components/CopyButton";
import { api, getMediaUrl } from "@/lib/api";
import { 
  LEAD_STATUS_OPTIONS, 
  normalizeLeadStatus, 
  getLeadStatusBadgeStyle,
  getLeadStatusOptionsForRole,
  LeadStatusLog
} from "@/lib/leadStatus";
import { formatTimeOnly, useSelectedTimezone } from "@/lib/timezone";
import { PaymentModal, PaymentDetails } from "@/components/PaymentModal";
import { LeadStatusLogsModal } from "@/components/LeadStatusLogsModal";
import { MessageStatusTick } from "@/components/MessageStatusTick";
import { BlockChatModal } from "@/components/BlockChatModal";

type Message = {
  id: string;
  direction: "in" | "out";
  text: string;
  media_url?: string | null;
  media_type?: string | null;
  media_filename?: string | null;
  status?: "sent" | "delivered" | "read" | "failed" | string | null;
  status_updated_at?: string | null;
  failure_reason?: string | null;
  timestamp: string;
  is_edited?: boolean;
  edited_at?: string | null;
};

type Conversation = {
  id: string;
  status: "bot" | "human";
  lead_status: string;
  lead_name?: string;
  wa_user_phone: string;
  setter_email?: string;
  closer_email?: string;
  assigned_email?: string;
  notes?: string | null;
  last_customer_read_at?: string | null;
  payment?: PaymentDetails | null;
  lead_status_logs?: LeadStatusLog[];
  is_blocked?: boolean;
  blocked_at?: string | null;
  blocked_by_name?: string | null;
  blocked_reason?: string | null;
};

export default function ConversationThreadPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conv, setConv] = useState<Conversation | null>(null);

  const handleGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(currentUser?.staff_type ? "/dashboard/leads" : "/dashboard/conversations");
    }
  };
  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [notesInput, setNotesInput] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ staff_type?: "general" | "setter" | "closer" } | null>(null);
  const [tenantTimezone, setTenantTimezone] = useSelectedTimezone("Asia/Kolkata");
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isStatusLogsOpen, setIsStatusLogsOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);

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
    if (!id || !editingText.trim()) return;
    setIsSavingEdit(true);
    try {
      const updated = await api.patch<Message>(`/conversations/${id}/messages/${msgId}`, {
        text: editingText.trim(),
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, text: updated.text, is_edited: true, edited_at: updated.edited_at } : m))
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
    if (!id) return;
    setIsDeletingMsg(true);
    try {
      await api.delete(`/conversations/${id}/messages/${msgId}`);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      setDeletingMessageId(null);
    } catch (err: any) {
      alert(err?.message || "Failed to delete message");
    } finally {
      setIsDeletingMsg(false);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const initialLoadDoneRef = useRef(false);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [enterToSend, setEnterToSend] = useState(false);

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
      const tooltip = lastMsg.failure_reason || "Delivery failed: Customer has not messaged your WhatsApp number in the last 24h (Meta 24-hour service window limit). Customer must reply first or a template message must be used.";
      return { active: false, text: "Delivery failed", color: "text-rose-700 bg-rose-50 border-rose-200/80 cursor-help", tooltip };
    }
    return { active: false, text: "Message sent", color: "text-slate-500 bg-slate-50 border-slate-200/80", tooltip: undefined };
  }, [messages]);

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

  const handleSaveLeadName = async () => {
    if (!conv) return;
    try {
      setIsSavingName(true);
      const trimmed = nameInput.trim();
      const updated = await api.patch<Conversation>(`/conversations/${conv.id}/status`, {
        lead_name: trimmed || null,
      });
      setConv((prev) => (prev ? { ...prev, lead_name: updated.lead_name } : null));
      setIsEditingName(false);
    } catch (e) {
      console.error("Failed to rename lead:", e);
    } finally {
      setIsSavingName(false);
    }
  };

  function load() {
    api
      .get<Conversation>(`/conversations/${params.id}`)
      .then(setConv)
      .catch((err) => setError(err.message));
    api
      .get<Message[]>(`/conversations/${params.id}/messages`)
      .then((data) => {
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
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    initialLoadDoneRef.current = false;
    isAtBottomRef.current = true;
    setShowScrollBottomBtn(false);
    api.get<{ staff_type?: "general" | "setter" | "closer" }>("/users/me")
      .then(setCurrentUser)
      .catch(() => {});
    api.get<{ timezone?: string }>("/tenants/me")
      .then((t) => {
        if (t.timezone) setTenantTimezone(t.timezone);
      })
      .catch(() => {});
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [params.id]);

  useEffect(() => {
    if (!initialLoadDoneRef.current && messages.length > 0) {
      initialLoadDoneRef.current = true;
      requestAnimationFrame(() => scrollToBottom("auto"));
    } else if (isAtBottomRef.current) {
      scrollToBottom("smooth");
    }
  }, [messages]);

  async function toggleStatus() {
    if (!conv) return;
    setIsUpdating(true);
    try {
      const next = conv.status === "human" ? "bot" : "human";
      const updated = await api.patch<Conversation>(`/conversations/${params.id}/status`, {
        status: next,
      });
      setConv(updated);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUpdating(false);
    }
  }

  async function updateLeadStatus(newStatus: string) {
    if (!conv) return;
    if (newStatus === "paid lead") {
      setIsPaymentModalOpen(true);
      return;
    }

    setIsUpdating(true);
    try {
      const updated = await api.patch<Conversation>(`/conversations/${params.id}/status`, {
        lead_status: newStatus,
      });
      setConv(updated);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleSavePayment(paymentData: PaymentDetails) {
    if (!conv) return;
    setIsUpdating(true);
    try {
      const updated = await api.patch<Conversation>(`/conversations/${params.id}/status`, {
        lead_status: "paid lead",
        payment: paymentData,
        notes: paymentData.notes || conv.notes || null,
      });
      setConv(updated);
      setIsPaymentModalOpen(false);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsUpdating(false);
    }
  }

  async function saveNotes() {
    if (!conv) return;
    setIsSavingNotes(true);
    try {
      const updated = await api.patch<Conversation>(`/conversations/${params.id}/status`, {
        notes: notesInput.trim() || null,
      });
      setConv(updated);
      setShowNotes(false);
    } catch (err: any) {
      setError(err.message || "Failed to save comments");
    } finally {
      setIsSavingNotes(false);
    }
  }

  async function sendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if ((!inputText.trim() && !selectedFile) || isSending) return;
    setIsSending(true);
    const textToSend = inputText.trim();
    const fileToSend = selectedFile;
    setInputText("");
    setSelectedFile(null);

    try {
      if (conv?.status === "bot") {
        await api.patch(`/conversations/${params.id}/status`, { status: "human" });
        setConv(prev => prev ? { ...prev, status: "human" } : null);
      }

      let newMsg: Message;
      if (fileToSend) {
        const formData = new FormData();
        formData.append("file", fileToSend);
        if (textToSend) {
          formData.append("caption", textToSend);
        }
        newMsg = await api.postForm<Message>(`/conversations/${params.id}/attachments`, formData);
      } else {
        newMsg = await api.post<Message>(`/conversations/${params.id}/messages`, { text: textToSend });
      }

      setMessages(prev => [...prev, newMsg]);
      isAtBottomRef.current = true;
      setTimeout(() => scrollToBottom("smooth"), 50);
    } catch (err: any) {
      setError(err.message || "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }

  if (error) return <div className="p-4 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 shadow-sm">{error}</div>;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] lg:h-[calc(100vh-8.5rem)] flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-white px-6 py-3.5 lg:flex-row lg:items-center lg:justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGoBack}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors shrink-0"
            title="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-sm shadow-xs">
            {(conv?.lead_name || conv?.wa_user_phone || "L").charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter lead name..."
                    className="h-7 w-40 sm:w-52 rounded-lg border border-slate-300 px-2 text-xs font-semibold text-slate-900 outline-none focus:border-slate-900"
                    autoFocus
                    disabled={isSavingName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveLeadName();
                      if (e.key === "Escape") setIsEditingName(false);
                    }}
                  />
                  <button
                    onClick={handleSaveLeadName}
                    disabled={isSavingName}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                    title="Save name"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setIsEditingName(false)}
                    disabled={isSavingName}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <h1 className="text-base font-bold text-slate-900 leading-tight">
                    {conv?.lead_name || "Lead Details"}
                  </h1>
                  <button
                    onClick={() => {
                      setNameInput(conv?.lead_name || "");
                      setIsEditingName(true);
                    }}
                    className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100 transition-colors"
                    title="Rename lead"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1">
                <span className="text-xs font-mono text-slate-500 font-medium">
                  ({conv?.wa_user_phone})
                </span>
                {conv?.wa_user_phone && (
                  <CopyButton text={conv.wa_user_phone} title="Copy phone number" showFeedbackText />
                )}
                {conv?.is_blocked && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 shadow-2xs ml-1">
                    <Ban className="h-3 w-3 text-rose-600" />
                    Blocked
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 flex-wrap">
              {conv?.setter_email && (
                <span>Setter: <strong className="text-slate-600 font-semibold">{conv.setter_email.split('@')[0]}</strong></span>
              )}
              {conv?.closer_email && (
                <>
                  <span>•</span>
                  <span>Closer: <strong className="text-slate-600 font-semibold">{conv.closer_email.split('@')[0]}</strong></span>
                </>
              )}
              {customerActivityStatus && (
                <>
                  <span>•</span>
                  <span 
                    title={customerActivityStatus.tooltip}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors",
                      customerActivityStatus.color
                    )}
                  >
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

        {conv && (
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Stage Selector */}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-1 bg-slate-50/50">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status:</span>
              <select
                value={normalizeLeadStatus(conv.lead_status)}
                onChange={(e) => updateLeadStatus(e.target.value)}
                disabled={isUpdating}
                className={cn(
                  "rounded-lg px-2 py-0.5 text-xs font-bold uppercase tracking-wider border outline-none cursor-pointer transition-all",
                  getLeadStatusBadgeStyle(conv.lead_status)
                )}
              >
                {getLeadStatusOptionsForRole(currentUser?.staff_type, conv.lead_status).map((opt) => (
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
            {(conv.payment || normalizeLeadStatus(conv.lead_status) === "paid lead") && (
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(true)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all border shadow-xs",
                  conv.payment?.total_payment != null
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                    : "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500"
                )}
                title="View or update payment details"
              >
                <CreditCard className={cn("h-3.5 w-3.5", conv.payment?.total_payment != null ? "text-emerald-600" : "text-white")} />
                <span>
                  {conv.payment?.total_payment != null
                    ? `$${conv.payment.advance_payment ?? 0} / $${conv.payment.total_payment}${
                        conv.payment.remaining_payment != null && conv.payment.remaining_payment > 0
                          ? ` (Rem: $${conv.payment.remaining_payment})`
                          : " (Paid)"
                      }`
                    : "Payment Details"}
                </span>
              </button>
            )}

            {/* Additional Comments / Notes Button */}
            <button
              type="button"
              onClick={() => {
                setShowNotes((prev) => !prev);
                setNotesInput(conv.notes || "");
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all border shadow-xs",
                conv.notes
                  ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              )}
              title="View and edit additional comments / notes for Setter & Closer"
            >
              <StickyNote className="h-3.5 w-3.5 text-amber-600" />
              <span>{conv.notes ? "View/Edit Note" : "+ Add Note"}</span>
            </button>

            {/* Takeover Toggle */}
            <button
              onClick={toggleStatus}
              disabled={isUpdating}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition-all border shadow-xs disabled:opacity-50",
                conv.status === "human"
                  ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              )}
            >
              {isUpdating ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : conv.status === "human" ? (
                <User className="h-3.5 w-3.5 text-amber-600" />
              ) : (
                <Bot className="h-3.5 w-3.5 text-emerald-600" />
              )}
              <span>{conv.status === "human" ? "Human Control (Return to Bot)" : "Bot Active (Take Over)"}</span>
            </button>

            {/* Block / Unblock Chat Button */}
            <button
              type="button"
              onClick={() => setIsBlockModalOpen(true)}
              disabled={isUpdating}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all border shadow-xs disabled:opacity-50 cursor-pointer",
                conv.is_blocked
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                  : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50 hover:border-rose-300"
              )}
              title={conv.is_blocked ? "Unblock this conversation" : "Block this contact if sending vague messages"}
            >
              {conv.is_blocked ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Unblock Chat</span>
                </>
              ) : (
                <>
                  <Ban className="h-3.5 w-3.5 text-rose-600" />
                  <span>Block Chat</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Blocked Conversation Notice Banner */}
      {conv?.is_blocked && (
        <div className="border-b border-rose-200 bg-rose-50/95 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-900 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Ban className="h-4 w-4 text-rose-600 shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-rose-950">This conversation is blocked</span>
              <span className="text-rose-800 ml-1.5">
                {conv.blocked_reason ? `(${conv.blocked_reason})` : "(Customer sending vague or unwanted messages)"}. AI bot will not respond to incoming messages, and notifications are silenced.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsBlockModalOpen(true)}
            className="text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-3 py-1 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
            <span>Unblock Contact</span>
          </button>
        </div>
      )}

      {/* 24-Hour Window / Delivery Failure Explanation Banner */}
      {customerActivityStatus?.text === "Delivery failed" && (
        <div className="border-b border-rose-200/80 bg-rose-50/95 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-900 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-rose-950">Why did message delivery fail?</span>
              <span className="text-rose-800 ml-1.5">
                Meta blocks free-text messages to leads who have not messaged your WhatsApp number in the last 24h. Once the customer replies, messages deliver instantly.
              </span>
            </div>
          </div>
          <a
            href="https://wa.me/918700607655?text=Hi"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shrink-0 shadow-xs transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Send Test &quot;Hi&quot; to +91 87006 07655
          </a>
        </div>
      )}

      {/* Additional Comments Collapsible Banner / Editor */}
      {(showNotes || conv?.notes) && (
        <div className="border-b border-amber-200/60 bg-amber-50/60 px-6 py-3 transition-all shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-2.5 flex-1 min-w-0">
              <StickyNote className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              {showNotes ? (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                      Additional Comments / Notes (Setter & Closer)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNotes(false)}
                      className="text-xs text-amber-700 hover:text-amber-900"
                    >
                      Close
                    </button>
                  </div>
                  <textarea
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    rows={2}
                    placeholder="Enter handover notes, customer objections, requested callbacks, etc..."
                    className="w-full rounded-xl border border-amber-200 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-amber-400 placeholder:text-slate-400 resize-none font-medium leading-relaxed"
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNotes(false)}
                      className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-black/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveNotes}
                      disabled={isSavingNotes}
                      className="rounded-lg bg-slate-900 px-3.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50"
                    >
                      {isSavingNotes ? "Saving..." : "Save Note"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between flex-1 gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mr-2">
                      Setter & Closer Note:
                    </span>
                    <span className="text-xs text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">
                      {conv?.notes}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNotes(true);
                      setNotesInput(conv?.notes || "");
                    }}
                    className="flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-900 shrink-0 underline ml-2"
                  >
                    <Edit3 className="h-3 w-3" />
                    <span>Edit</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages Feed */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        <div 
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30 scrollbar-thin scrollbar-thumb-slate-200 overscroll-contain"
        >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
            <MessageCircle className="h-10 w-10 text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-600">No messages in this conversation yet</p>
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
                  "max-w-[70%] rounded-2xl px-4 py-2.5 shadow-xs text-sm relative group",
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
                      <MessageStatusTick status={msg.status} failureReason={msg.failure_reason} />
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

      {/* Composer */}
      <div className="border-t border-slate-200/80 bg-white p-3.5 shrink-0">
        {conv?.is_blocked ? (
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Ban className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900">This conversation is blocked</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {conv.blocked_reason ? `Reason: ${conv.blocked_reason}. ` : ""}Unblock the contact to send messages or resume bot replies.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsBlockModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Unblock Contact</span>
            </button>
          </div>
        ) : (
          <>
            {conv?.status === "bot" && (
              <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-50/80 px-3 py-1.5 text-xs text-amber-800 border border-amber-200/60">
                <span className="flex items-center gap-1.5 font-medium">
                  <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                  Bot is replying automatically. Sending a reply will switch this chat to Human control.
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
              disabled={isSending}
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
              disabled={isSending}
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
                    : "Type a reply to the customer... (Enter to change line)"
                }
                className="w-full min-h-[42px] max-h-36 resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-slate-400 focus:bg-white placeholder:text-slate-400 leading-relaxed scrollbar-thin scrollbar-thumb-slate-200"
              />
            </div>

            <button
              type="submit"
              disabled={isSending || (!inputText.trim() && !selectedFile)}
              className="flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-40 transition-all shrink-0 mb-0.5"
            >
              {isSending ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
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
        </>
      )}
      </div>

      {/* Paid Lead Details Modal */}
      {conv && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          onSave={handleSavePayment}
          leadName={conv.lead_name}
          leadPhone={conv.wa_user_phone}
          initialData={conv.payment}
          initialNotes={conv.notes}
        />
      )}

      {/* Lead Status Logs History Modal */}
      {conv && isStatusLogsOpen && (
        <LeadStatusLogsModal
          conversationId={conv.id}
          leadName={conv.lead_name}
          phone={conv.wa_user_phone}
          currentStatus={conv.lead_status}
          initialLogs={conv.lead_status_logs}
          onClose={() => setIsStatusLogsOpen(false)}
        />
      )}

      {/* Block / Unblock Chat Modal */}
      {conv && (
        <BlockChatModal
          isOpen={isBlockModalOpen}
          onClose={() => setIsBlockModalOpen(false)}
          conversationId={conv.id}
          phone={conv.wa_user_phone}
          leadName={conv.lead_name}
          isBlocked={Boolean(conv.is_blocked)}
          currentReason={conv.blocked_reason}
          onSuccess={(updatedConv) => {
            if (updatedConv) {
              setConv((prev) => (prev ? { ...prev, ...updatedConv } : updatedConv));
            }
          }}
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
    </div>
  );
}

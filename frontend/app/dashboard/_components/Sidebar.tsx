"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { 
  ChevronLeft, 
  ChevronRight, 
  LayoutDashboard, 
  Bot, 
  Activity, 
  Users, 
  Book, 
  Settings, 
  LogOut,
  Inbox,
  UserCheck,
  Shield,
  Circle,
  PieChart,
  MessageSquarePlus,
  Megaphone
} from "lucide-react";
import { clearToken } from "@/lib/api";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { NewChatModal } from "@/components/NewChatModal";


const generalLinks = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/knowledge", label: "Knowledge Base", icon: Book },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const adminLinks = [
  { href: "/dashboard/staff", label: "Staff Management", icon: Users },
  { href: "/dashboard/admins", label: "Admin Accounts", icon: Shield },
];

const operationsLinks = [
  { href: "/dashboard/monitor", label: "Chat Monitor", icon: Activity },
  { href: "/dashboard/conversations", label: "Leads Tracking", icon: Users },
  { href: "/dashboard/broadcast", label: "Bulk Broadcast", icon: Megaphone },
  { href: "/dashboard/analytics", label: "Lead Analytics", icon: PieChart },
];

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<"admin" | "staff" | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [staffStatus, setStaffStatus] = useState<"offline" | "online" | "break" | "in_meet">("offline");
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [breakSeconds, setBreakSeconds] = useState(0);
  const [meetSeconds, setMeetSeconds] = useState(0);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    api.get<{ name?: string; email?: string; role: "admin" | "staff"; status?: "offline" | "online" | "break" | "in_meet"; today_active_seconds?: number; today_break_seconds?: number; today_meet_seconds?: number }>("/users/me")
      .then(user => {
        setUserRole(user.role);
        if (user.name) setUserName(user.name);
        if (user.email) setUserEmail(user.email);
        if (user.status) setStaffStatus(user.status);
        if (user.today_active_seconds) setActiveSeconds(user.today_active_seconds);
        if (user.today_break_seconds) setBreakSeconds(user.today_break_seconds);
        if (user.today_meet_seconds) setMeetSeconds(user.today_meet_seconds);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (staffStatus === "offline") return;
    const interval = setInterval(() => {
      if (staffStatus === "online") {
        setActiveSeconds(s => s + 1);
      } else if (staffStatus === "break") {
        setBreakSeconds(s => s + 1);
      } else if (staffStatus === "in_meet") {
        setMeetSeconds(s => s + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [staffStatus]);

  // Heartbeat: proves this staff member actually has the dashboard open.
  // Leads are only auto-assigned to staff with a recent heartbeat.
  useEffect(() => {
    if (userRole !== "staff" || staffStatus === "offline") return;
    // Keeps beating in background tabs too, so agents working in another tab still receive leads
    const beat = () => {
      api.post("/users/heartbeat", {}).catch(() => {});
    };
    beat();
    const interval = setInterval(beat, 60000);
    return () => clearInterval(interval);
  }, [userRole, staffStatus]);

  const updateStatus = async (newStatus: "offline" | "online" | "break" | "in_meet") => {
    try {
      const updated = await api.post<{ status: "offline" | "online" | "break" | "in_meet"; today_active_seconds: number; today_break_seconds: number; today_meet_seconds: number }>("/users/status", { status: newStatus });
      setStaffStatus(updated.status);
      setActiveSeconds(updated.today_active_seconds);
      setBreakSeconds(updated.today_break_seconds);
      setMeetSeconds(updated.today_meet_seconds || 0);
    } catch (err) {
      console.error(err);
    }
  };

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  async function handleLogout() {
    if (userRole === "staff" && staffStatus !== "offline") {
      try {
        await api.post("/users/status", { status: "offline" });
      } catch (err) {
        console.error(err);
      }
    }
    clearToken();
    router.push("/login");
  }

  const renderLinks = (links: any[]) => {
    return links.map((link) => {
      // Precise check: /dashboard is only active if exact match
      const isActive = link.href === "/dashboard" 
        ? pathname === "/dashboard" 
        : (pathname === link.href || pathname.startsWith(link.href + "/"));

      return (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
            isActive 
              ? "bg-slate-900 text-white shadow-sm shadow-slate-900/10" 
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          )}
        >
          <link.icon className={cn(
            "h-4.5 w-4.5 transition-colors shrink-0", 
            isActive ? "text-white" : "text-slate-400 group-hover:text-slate-700"
          )} />
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span 
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="whitespace-nowrap overflow-hidden font-medium"
              >
                {link.label}
              </motion.span>
            )}
          </AnimatePresence>
          
          {/* Tooltip for collapsed state */}
          {isCollapsed && (
            <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-lg border border-slate-800">
              {link.label}
              <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 border-[4px] border-transparent border-r-slate-900"></div>
            </div>
          )}
        </Link>
      );
    });
  };

  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : "U";

  return (
    <motion.div 
      initial={false}
      animate={{ width: isCollapsed ? 76 : 260 }}
      className="relative flex flex-col border-r border-slate-200/80 bg-white min-h-screen shrink-0 z-40 select-none transition-all duration-300 shadow-sm"
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center border-b border-slate-100 px-4 shrink-0 justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-900 text-white shadow-sm shrink-0">
            <Bot className="h-5 w-5 text-indigo-400" />
          </div>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col whitespace-nowrap overflow-hidden"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-900 tracking-tight text-base">Veltrix</span>
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 border border-indigo-100">AI</span>
                </div>
                <span className="text-[11px] text-slate-400 font-medium -mt-0.5">WhatsApp CRM</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Collapse toggle button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Main Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-5 space-y-6 scrollbar-thin scrollbar-thumb-slate-200">
        {/* Quick Action: New Chat */}
        <div>
          <button
            type="button"
            onClick={() => setIsNewChatOpen(true)}
            className={cn(
              "group relative w-full flex items-center justify-center gap-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-sm shadow-emerald-600/20 active:scale-[0.98] cursor-pointer",
              isCollapsed ? "p-2.5" : "px-3.5 py-2.5 text-xs"
            )}
            title="Start New Chat"
          >
            <MessageSquarePlus className="h-4.5 w-4.5 shrink-0" />
            <AnimatePresence>
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="whitespace-nowrap overflow-hidden font-bold"
                >
                  Start New Chat
                </motion.span>
              )}
            </AnimatePresence>

            {isCollapsed && (
              <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-lg border border-slate-800">
                Start New Chat
                <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 border-[4px] border-transparent border-r-slate-900"></div>
              </div>
            )}
          </button>
        </div>

        <div>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.p 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
              >
                Workspace
              </motion.p>
            )}
          </AnimatePresence>
          <div className="space-y-1">
            {renderLinks(generalLinks)}
            {userRole === "staff" && renderLinks([
              { href: "/dashboard/leads", label: "My Leads", icon: Inbox },
              { href: "/dashboard/broadcast", label: "Bulk Broadcast", icon: Megaphone },
            ])}
          </div>
        </div>

        {userRole === "admin" && (
          <div>
            <AnimatePresence>
              {!isCollapsed && (
                <motion.p 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                >
                  Team
                </motion.p>
              )}
            </AnimatePresence>
            <div className="space-y-1">{renderLinks(adminLinks)}</div>
          </div>
        )}

        {userRole === "admin" && (
          <div>
            <AnimatePresence>
              {!isCollapsed && (
                <motion.p 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                >
                  Operations
                </motion.p>
              )}
            </AnimatePresence>
            <div className="space-y-1">{renderLinks(operationsLinks)}</div>
          </div>
        )}
      </div>

      {/* Footer Area: Staff Status (if staff) + User Profile */}
      <div className="border-t border-slate-100 p-3 shrink-0 bg-slate-50/50 flex flex-col gap-2">
        {userRole === "staff" && !isCollapsed && (
          <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm mb-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Attendance</span>
              {staffStatus !== "offline" && (
                <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                  {staffStatus === "online" 
                    ? formatElapsed(activeSeconds) 
                    : staffStatus === "in_meet" 
                    ? formatElapsed(meetSeconds) 
                    : formatElapsed(breakSeconds)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1">
              <button 
                onClick={() => updateStatus("online")}
                className={cn(
                  "py-1.5 text-[11px] rounded-lg font-medium transition-all text-center border truncate px-1", 
                  staffStatus === "online" 
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" 
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
              >
                Online
              </button>
              <button 
                onClick={() => updateStatus("in_meet")}
                className={cn(
                  "py-1.5 text-[11px] rounded-lg font-medium transition-all text-center border truncate px-1", 
                  staffStatus === "in_meet" 
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-xs" 
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
              >
                In meet
              </button>
              <button 
                onClick={() => updateStatus("break")}
                className={cn(
                  "py-1.5 text-[11px] rounded-lg font-medium transition-all text-center border truncate px-1", 
                  staffStatus === "break" 
                    ? "bg-amber-500 text-white border-amber-500 shadow-xs" 
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
              >
                Break
              </button>
              <button 
                onClick={() => updateStatus("offline")}
                className={cn(
                  "py-1.5 text-[11px] rounded-lg font-medium transition-all text-center border truncate px-1", 
                  staffStatus === "offline" 
                    ? "bg-slate-700 text-white border-slate-700 shadow-xs" 
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
              >
                Offline
              </button>
            </div>
          </div>
        )}

        {/* Profile Card & Logout */}
        <div className={cn(
          "flex items-center rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-sm transition-all",
          isCollapsed ? "justify-center" : "justify-between gap-2"
        )}>
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white shadow-xs">
              {(userName || userEmail || "U").charAt(0).toUpperCase()}
            </div>
            <AnimatePresence>
              {!isCollapsed && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  className="flex flex-col min-w-0"
                >
                  <p className="truncate text-xs font-bold text-slate-900 leading-tight">
                    {userName || userEmail.split('@')[0]}
                  </p>
                  <p className="truncate text-[11px] text-slate-400 font-medium leading-tight mt-0.5">
                    {userEmail}
                  </p>
                  <span className="text-[9px] font-semibold text-indigo-600 uppercase tracking-wider mt-0.5">
                    {userRole === "admin" ? "Administrator" : "Staff"}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={handleLogout}
            title="Log out"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        onSuccess={(newConv) => {
          setIsNewChatOpen(false);
          if (newConv?.id) {
            router.push(`/dashboard/conversations/${newConv.id}`);
          }
        }}
      />
    </motion.div>
  );
}

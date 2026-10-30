"use client";

import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { 
  Users, 
  User as UserIcon,
  RefreshCw, 
  Pencil, 
  Trash2, 
  ClipboardList, 
  X, 
  Search, 
  CheckCircle2, 
  Clock, 
  Coffee, 
  UserCheck, 
  Mail, 
  Lock, 
  Briefcase,
  ChevronDown,
  Globe,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Video,
  Shield
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { 
  TIMEZONE_OPTIONS, 
  getTimezoneOption, 
  getCurrentTimeInTimezone,
  formatTimeOnly 
} from "@/lib/timezone";

type User = {
  id: string;
  name?: string;
  email: string;
  role: "admin" | "staff";
  status: "offline" | "online" | "break" | "in_meet";
  staff_type: "general" | "setter" | "closer";
  timezone?: string;
  status_updated_at?: string;
  created_at: string;
  today_active_seconds: number;
  today_break_seconds: number;
  today_meet_seconds?: number;
};

type AttendanceEvent = {
  id: string;
  user_id: string;
  event_type: "login" | "break_start" | "break_end" | "meet_start" | "meet_end" | "logout" | string;
  timestamp: string;
  local_time?: string;
};

type AttendanceDailySummary = {
  date: string;
  timezone: string;
  active_seconds: number;
  break_seconds: number;
  meet_seconds: number;
  events: AttendanceEvent[];
};

function LiveTimer({ timestamp }: { timestamp: string }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const start = new Date(timestamp).getTime();
    const update = () => {
      const diff = Math.floor((new Date().getTime() - start) / 1000);
      if (diff < 0) return;
      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  return <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded">{elapsed}</span>;
}

function StaffLocalClock({ timeZone }: { timeZone?: string }) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => setTime(getCurrentTimeInTimezone(timeZone));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timeZone]);

  const opt = getTimezoneOption(timeZone);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{opt.flag}</span>
        <span className="text-xs font-bold text-slate-800">{opt.short}</span>
      </div>
      <span className="text-[11px] font-mono text-slate-500">{time}</span>
    </div>
  );
}

function formatHours(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function getTodayIso() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getOffsetDateIso(baseDate: string, offsetDays: number) {
  const [y, m, d] = baseDate.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  dateObj.setDate(dateObj.getDate() + offsetDays);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function StaffPage() {
  const todayIso = useMemo(() => getTodayIso(), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [staff, setStaff] = useState<User[]>([]);
  const [tenantDefaultTz, setTenantDefaultTz] = useState<string>("America/New_York");
  
  // Selection and Attendance Drawer State
  const [selectedStaff, setSelectedStaff] = useState<User | null>(null);
  const [drawerDate, setDrawerDate] = useState<string>(todayIso);
  const [drawerSummary, setDrawerSummary] = useState<AttendanceDailySummary | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceEvent[]>([]);

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staffType, setStaffType] = useState<"general" | "setter" | "closer">("general");
  const [staffTimezone, setStaffTimezone] = useState<string>("America/New_York");
  const [editingStaff, setEditingStaff] = useState<User | null>(null);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const fetchStaff = async (dateParam?: string) => {
    setRefreshing(true);
    try {
      const d = dateParam !== undefined ? dateParam : selectedDate;
      const data = await api.get<User[]>(`/users/staff${d ? `?date=${d}` : ""}`);
      setStaff(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  const fetchAttendance = async (userId: string, dateParam?: string) => {
    setDrawerLoading(true);
    try {
      const d = dateParam !== undefined ? dateParam : drawerDate;
      const data = await api.get<AttendanceDailySummary>(`/users/staff/${userId}/attendance?date=${d}`);
      setDrawerSummary(data);
      setAttendance(data.events || []);
    } catch (err) {
      console.error(err);
      setDrawerSummary(null);
      setAttendance([]);
    } finally {
      setDrawerLoading(false);
    }
  };

  useEffect(() => {
    // Fetch tenant default timezone
    api.get<{ timezone?: string }>("/tenants/me")
      .then((t) => {
        if (t.timezone) {
          setTenantDefaultTz(t.timezone);
          setStaffTimezone(t.timezone);
        }
      })
      .catch(() => {});

    fetchStaff(todayIso);
  }, [todayIso]);

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    fetchStaff(newDate);
  };

  const handleSelectStaff = (user: User) => {
    if (selectedStaff?.id === user.id) {
      setSelectedStaff(null);
      setDrawerSummary(null);
      setAttendance([]);
    } else {
      setSelectedStaff(user);
      const targetDate = selectedDate || todayIso;
      setDrawerDate(targetDate);
      fetchAttendance(user.id, targetDate);
    }
  };

  const handleDrawerDateChange = (newDate: string) => {
    setDrawerDate(newDate);
    if (selectedStaff) {
      fetchAttendance(selectedStaff.id, newDate);
    }
  };

  const handleEditClick = (user: User) => {
    setEditingStaff(user);
    setName(user.name || "");
    setEmail(user.email);
    setStaffType(user.staff_type);
    setStaffTimezone(user.timezone || tenantDefaultTz);
    setPassword("");
    setError(null);
    setSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingStaff(null);
    setName("");
    setEmail("");
    setStaffType("general");
    setStaffTimezone(tenantDefaultTz);
    setPassword("");
    setError(null);
    setSuccess(null);
  };

  const handleCreateOrUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingStaff) {
        const payload: any = { 
          name: name.trim() || undefined, 
          email, 
          staff_type: staffType,
          timezone: staffTimezone
        };
        if (password) payload.password = password;
        await api.patch(`/users/staff/${editingStaff.id}`, payload);
        setSuccess("Staff member updated successfully!");
        setEditingStaff(null);
      } else {
        if (!password) throw new Error("Password is required for new staff");
        await api.post("/users/staff", { 
          name: name.trim() || undefined, 
          email, 
          password, 
          staff_type: staffType,
          timezone: staffTimezone 
        });
        setSuccess("Staff account created successfully!");
      }
      setName("");
      setEmail("");
      setPassword("");
      setStaffType("general");
      setStaffTimezone(tenantDefaultTz);
      fetchStaff(selectedDate);
    } catch (err: any) {
      setError(err.message || "Failed to save staff");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStaff = async (user: User) => {
    if (!confirm(`Are you sure you want to delete ${user.email}?`)) return;
    try {
      await api.del(`/users/staff/${user.id}`);
      if (selectedStaff?.id === user.id) setSelectedStaff(null);
      if (editingStaff?.id === user.id) handleCancelEdit();
      fetchStaff(selectedDate);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to delete staff");
    }
  };

  // Metrics
  const totalStaff = staff.length;
  const onlineCount = staff.filter(s => s.status === "online").length;
  const breakCount = staff.filter(s => s.status === "break").length;
  const settersCount = staff.filter(s => s.staff_type === "setter").length;
  const closersCount = staff.filter(s => s.staff_type === "closer").length;

  // Filtered List
  const filteredStaff = useMemo(() => {
    return staff.filter(u => {
      const matchesSearch = u.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!matchesSearch) return false;
      if (roleFilter === "all") return true;
      if (roleFilter === "online") return u.status === "online";
      if (roleFilter === "setter") return u.staff_type === "setter";
      if (roleFilter === "closer") return u.staff_type === "closer";
      return true;
    });
  }, [staff, searchQuery, roleFilter]);

  const selectedTzOption = getTimezoneOption(tenantDefaultTz);

  return (
    <div className="space-y-8 pb-12">
      {/* Team Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <Link
          href="/dashboard/staff"
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs"
        >
          <Users className="h-4 w-4" />
          <span>Staff Members</span>
        </Link>
        <Link
          href="/dashboard/admins"
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all"
        >
          <Shield className="h-4 w-4 text-indigo-500" />
          <span>Admin Accounts</span>
        </Link>
      </div>

      {/* Top Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Staff Management</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              <span>{selectedTzOption.flag}</span>
              <span>Workspace: {selectedTzOption.short}</span>
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Record attendance dates, manage staff across US and Indian timezones, and route leads through Setters and Closers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchStaff(selectedDate)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 text-slate-500", refreshing && "animate-spin")} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Card 1: Total Staff */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Team</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Users className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900">{totalStaff}</span>
            <span className="text-xs font-medium text-slate-500">members</span>
          </div>
        </div>

        {/* Card 2: Online Now */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Online Now</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900">{onlineCount}</span>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </span>
          </div>
        </div>

        {/* Card 3: On Break */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">On Break</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Coffee className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900">{breakCount}</span>
            <span className="text-xs font-medium text-slate-500">staff</span>
          </div>
        </div>

        {/* Card 4: Sales Pipeline Roles */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sales Pipeline</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Briefcase className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
              {settersCount} Setters
            </span>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 ring-1 ring-blue-600/20">
              {closersCount} Closers
            </span>
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* Left Column: Create / Edit Staff Form (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {editingStaff ? "Edit Staff Member" : "Add Team Member"}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {editingStaff ? "Update role, timezone, or credentials" : "Create login credentials with timezone"}
              </p>
            </div>
            {editingStaff && (
              <button 
                onClick={handleCancelEdit} 
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cancel</span>
              </button>
            )}
          </div>

          <form onSubmit={handleCreateOrUpdateStaff} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-200/80 p-3 text-xs font-semibold text-rose-600">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200/80 p-3 text-xs font-semibold text-emerald-700">
                {success}
              </div>
            )}
            
            {/* Name Field */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Full Name</label>
              <div className="relative">
                <UserIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/40 pl-10 pr-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-600/10 placeholder:text-slate-400"
                  placeholder="e.g. Vaibhav Bhalla"
                />
              </div>
            </div>

            {/* Email Field */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/40 pl-10 pr-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-600/10 placeholder:text-slate-400"
                  placeholder="agent@company.com"
                />
              </div>
            </div>
            
            {/* Password Field */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                {editingStaff ? "New Password (Optional)" : "Password"}
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required={!editingStaff}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/40 pl-10 pr-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-600/10 placeholder:text-slate-400"
                  placeholder={editingStaff ? "Keep existing password" : "Min 6 characters"}
                />
              </div>
            </div>

            {/* Timezone Selector */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Staff Timezone
              </label>
              <div className="relative">
                <Globe className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <select
                  value={getTimezoneOption(staffTimezone).value}
                  onChange={(e) => setStaffTimezone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/40 pl-10 pr-10 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-600/10 appearance-none cursor-pointer"
                >
                  {TIMEZONE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.flag} {opt.label} ({opt.short})
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Used to compute accurate daily shift logs (midnight-to-midnight) for their client region.
              </p>
            </div>

            {/* Role Type Selector */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">Assign Pipeline Role</label>
              <div className="grid grid-cols-1 gap-2">
                {/* General Staff */}
                <button
                  type="button"
                  onClick={() => setStaffType("general")}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                    staffType === "general" 
                      ? "border-slate-900 bg-slate-900 text-white shadow-sm" 
                      : "border-slate-200 bg-white hover:border-slate-300 text-slate-800"
                  )}
                >
                  <Users className={cn("h-4 w-4 mt-0.5 shrink-0", staffType === "general" ? "text-indigo-400" : "text-slate-400")} />
                  <div>
                    <p className="text-xs font-bold">General Staff</p>
                    <p className={cn("text-[11px] mt-0.5", staffType === "general" ? "text-slate-300" : "text-slate-400")}>
                      Standard access to chat, attendance, and leads.
                    </p>
                  </div>
                </button>

                {/* Setter */}
                <button
                  type="button"
                  onClick={() => setStaffType("setter")}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                    staffType === "setter" 
                      ? "border-emerald-700 bg-emerald-700 text-white shadow-sm" 
                      : "border-slate-200 bg-white hover:border-slate-300 text-slate-800"
                  )}
                >
                  <UserCheck className={cn("h-4 w-4 mt-0.5 shrink-0", staffType === "setter" ? "text-emerald-300" : "text-emerald-500")} />
                  <div>
                    <p className="text-xs font-bold">Setter (Pipeline)</p>
                    <p className={cn("text-[11px] mt-0.5", staffType === "setter" ? "text-emerald-100" : "text-slate-400")}>
                      Auto-assigned incoming conversations to qualify leads.
                    </p>
                  </div>
                </button>

                {/* Closer */}
                <button
                  type="button"
                  onClick={() => setStaffType("closer")}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                    staffType === "closer" 
                      ? "border-blue-700 bg-blue-700 text-white shadow-sm" 
                      : "border-slate-200 bg-white hover:border-slate-300 text-slate-800"
                  )}
                >
                  <Briefcase className={cn("h-4 w-4 mt-0.5 shrink-0", staffType === "closer" ? "text-blue-300" : "text-blue-500")} />
                  <div>
                    <p className="text-xs font-bold">Closer (Pipeline)</p>
                    <p className={cn("text-[11px] mt-0.5", staffType === "closer" ? "text-blue-100" : "text-slate-400")}>
                      Handles qualified leads to schedule demos and close sales.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                editingStaff ? "Update Member" : "Create Staff Account"
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Existing Staff Directory Table (8 cols) */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-5">
          {/* Table Toolbar: Search, Role Pills & Date Picker */}
          <div className="flex flex-col gap-3.5 border-b border-slate-100 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Team Directory</h2>
                <p className="text-xs text-slate-400">Total {filteredStaff.length} matching members</p>
              </div>

              {/* Date Filter Bar */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 p-1.5 rounded-xl">
                <Calendar className="h-3.5 w-3.5 text-slate-500 ml-1" />
                <button
                  type="button"
                  onClick={() => handleDateChange(todayIso)}
                  className={cn(
                    "px-2 py-0.5 text-xs font-semibold rounded-lg transition-all",
                    selectedDate === todayIso 
                      ? "bg-slate-900 text-white shadow-xs" 
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => handleDateChange(getOffsetDateIso(todayIso, -1))}
                  className={cn(
                    "px-2 py-0.5 text-xs font-semibold rounded-lg transition-all",
                    selectedDate === getOffsetDateIso(todayIso, -1) 
                      ? "bg-slate-900 text-white shadow-xs" 
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Yesterday
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search staff..."
                  className="rounded-xl border border-slate-200 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-slate-900 outline-none transition-all focus:border-slate-400 focus:bg-white w-full sm:w-56"
                />
              </div>

              {/* Filter Pills */}
              <div className="flex items-center rounded-xl border border-slate-200 p-0.5 bg-slate-50/50 self-start sm:self-auto">
                {[
                  { id: "all", label: "All" },
                  { id: "online", label: "Online" },
                  { id: "setter", label: "Setters" },
                  { id: "closer", label: "Closers" },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setRoleFilter(f.id)}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all",
                      roleFilter === f.id 
                        ? "bg-white text-slate-900 shadow-xs" 
                        : "text-slate-500 hover:text-slate-900"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Staff Directory Table */}
          {filteredStaff.length === 0 ? (
            <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
              <Users className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-xs font-semibold text-slate-600">No staff members found</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="pb-3 pl-1">Agent & Role</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Timezone & Clock</th>
                    <th className="pb-3">Shift ({selectedDate === todayIso ? "Today" : selectedDate})</th>
                    <th className="pb-3 pr-1 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStaff.map((user) => {
                    const activePct = Math.min(100, Math.round((user.today_active_seconds / 28800) * 100));

                    return (
                      <tr key={user.id} className="group transition-colors hover:bg-slate-50/70">
                        {/* Member & Role */}
                        <td className="py-3.5 pl-1">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white shadow-xs">
                                {(user.name || user.email).charAt(0).toUpperCase()}
                              </div>
                              <span className={cn(
                                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white",
                                user.status === "online" ? "bg-emerald-500" :
                                user.status === "in_meet" ? "bg-indigo-500" :
                                user.status === "break" ? "bg-amber-500" : "bg-slate-300"
                              )} />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-sm leading-tight">
                                {user.name || user.email.split('@')[0].replace(".", " ").replace("_", " ").toUpperCase()}
                              </div>
                              <div className="text-xs text-slate-500 font-medium mt-0.5">
                                {user.email}
                              </div>
                              <div className="mt-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1">
                                {user.staff_type === 'setter' ? (
                                  <span className="text-emerald-700 ring-emerald-600/20 bg-emerald-50">Setter</span>
                                ) : user.staff_type === 'closer' ? (
                                  <span className="text-blue-700 ring-blue-600/20 bg-blue-50">Closer</span>
                                ) : (
                                  <span className="text-slate-600 ring-slate-500/20 bg-slate-100">General</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5">
                          <div>
                            <span className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                              user.status === "online" ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60" :
                              user.status === "in_meet" ? "bg-indigo-50 text-indigo-700 border border-indigo-200/60" :
                              user.status === "break" ? "bg-amber-50 text-amber-700 border border-amber-200/60" :
                              "bg-slate-100 text-slate-600 border border-slate-200/60"
                            )}>
                              <span className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                user.status === "online" ? "bg-emerald-500 animate-pulse" :
                                user.status === "in_meet" ? "bg-indigo-500 animate-pulse" :
                                user.status === "break" ? "bg-amber-500" : "bg-slate-400"
                              )} />
                              {user.status === "in_meet" ? "In meet" : (user.status || "offline")}
                            </span>

                            {user.status && user.status_updated_at && (
                              <div className="mt-1 flex items-center gap-1">
                                <span className="text-[10px] text-slate-400">
                                  Since {formatTimeOnly(user.status_updated_at, user.timezone || tenantDefaultTz)}
                                </span>
                                {user.status !== "offline" && (
                                  <LiveTimer timestamp={user.status_updated_at} />
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Timezone & Clock */}
                        <td className="py-3.5">
                          <StaffLocalClock timeZone={user.timezone || tenantDefaultTz} />
                        </td>

                        {/* Shift Work Activity */}
                        <td className="py-3.5">
                          <div className="flex flex-col gap-1 w-36">
                            <div className="flex justify-between text-xs font-semibold text-slate-700">
                              <span>{formatHours(user.today_active_seconds)}</span>
                              <span className="text-slate-400 font-normal">{activePct}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-slate-900 rounded-full transition-all" 
                                style={{ width: `${activePct}%` }}
                              />
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {user.today_break_seconds > 0 && (
                                <span className="text-[10px] text-slate-400">
                                  Break: {formatHours(user.today_break_seconds)}
                                </span>
                              )}
                              {(user.today_meet_seconds ?? 0) > 0 && (
                                <span className="text-[10px] text-indigo-600 font-medium">
                                  Meet: {formatHours(user.today_meet_seconds!)}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 pr-1 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button 
                              onClick={() => handleSelectStaff(user)}
                              className={cn(
                                "p-1.5 rounded-lg transition-all",
                                selectedStaff?.id === user.id 
                                  ? "bg-slate-900 text-white shadow-xs" 
                                  : "text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                              )}
                              title="View Attendance & Date Logs"
                            >
                              <ClipboardList className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => handleEditClick(user)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                              title="Edit Member & Timezone"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteStaff(user)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                              title="Delete Member"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Attendance History Drawer / Card by Date */}
      {selectedStaff && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs animate-in fade-in-50 duration-200">
          {/* Drawer Top Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 mb-5 gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    Attendance Timeline: {selectedStaff.name || selectedStaff.email}
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-200/60">
                    <Globe className="h-3 w-3" />
                    <span>{getTimezoneOption(selectedStaff.timezone || tenantDefaultTz).label}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Shift hours & event timestamps calculated for timezone: <strong>{selectedStaff.timezone || tenantDefaultTz}</strong>
                </p>
              </div>
            </div>

            {/* Date Navigator Controls */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-50 border border-slate-200/80 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => handleDrawerDateChange(getOffsetDateIso(drawerDate, -1))}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white transition-all"
                  title="Previous Day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <input
                  type="date"
                  value={drawerDate}
                  onChange={(e) => handleDrawerDateChange(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 mx-1"
                />
                <button
                  type="button"
                  onClick={() => handleDrawerDateChange(getOffsetDateIso(drawerDate, 1))}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white transition-all"
                  title="Next Day"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDrawerDateChange(todayIso)}
                  className={cn(
                    "ml-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all",
                    drawerDate === todayIso 
                      ? "bg-slate-900 text-white shadow-xs" 
                      : "text-slate-600 hover:text-slate-900 hover:bg-white"
                  )}
                >
                  Today
                </button>
              </div>

              <button 
                onClick={() => setSelectedStaff(null)} 
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Date Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Active Work</span>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {formatHours(drawerSummary?.active_seconds || 0)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-indigo-50/50 p-3.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500">In Meeting</span>
              <p className="mt-1 text-lg font-bold text-indigo-700">
                {formatHours(drawerSummary?.meet_seconds || 0)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-amber-50/50 p-3.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-500">Break Time</span>
              <p className="mt-1 text-lg font-bold text-amber-700">
                {formatHours(drawerSummary?.break_seconds || 0)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-900 p-3.5 text-white">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Shift Log</span>
              <p className="mt-1 text-lg font-bold text-white">
                {formatHours((drawerSummary?.active_seconds || 0) + (drawerSummary?.meet_seconds || 0) + (drawerSummary?.break_seconds || 0))}
              </p>
            </div>
          </div>

          {/* Timeline of Events */}
          {drawerLoading ? (
            <div className="flex h-32 items-center justify-center">
              <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : attendance.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center">
              <Clock className="mx-auto mb-2 h-7 w-7 text-slate-300" />
              <p className="text-xs font-semibold text-slate-600">No attendance events logged on {drawerDate}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Use the date navigation above to inspect other shift dates.</p>
            </div>
          ) : (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Events Logged on {drawerDate} ({attendance.length} events)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-1">
                {attendance.map((evt) => (
                  <div key={evt.id} className="flex items-center justify-between rounded-xl border border-slate-200/70 p-3 bg-slate-50/40">
                    <span className={cn(
                      "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      evt.event_type === "login" ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60" :
                      evt.event_type === "logout" ? "bg-rose-50 text-rose-700 border border-rose-200/60" :
                      evt.event_type.startsWith("meet") ? "bg-indigo-50 text-indigo-700 border border-indigo-200/60" :
                      "bg-amber-50 text-amber-700 border border-amber-200/60"
                    )}>
                      {evt.event_type === "meet_start" ? "Meet Start" :
                       evt.event_type === "meet_end" ? "Meet End" :
                       evt.event_type.replace("_", " ")}
                    </span>
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-800">
                        {evt.local_time || formatTimeOnly(evt.timestamp, selectedStaff.timezone || tenantDefaultTz)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(evt.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

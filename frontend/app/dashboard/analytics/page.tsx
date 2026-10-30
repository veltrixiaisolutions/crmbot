"use client";

import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { 
  PieChart as PieIcon, 
  BarChart3, 
  TrendingUp, 
  Users, 
  UserCheck, 
  Briefcase, 
  Clock, 
  Calendar, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Filter, 
  ArrowUpRight, 
  MessageSquare, 
  Bot, 
  Globe, 
  ChevronRight, 
  Search,
  Sparkles,
  Award,
  Phone
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTimezoneOption, formatInTimezone } from "@/lib/timezone";
import { getLeadStatusBadgeStyle } from "@/lib/leadStatus";

type SliceData = {
  name: string;
  value: number;
  percentage: number;
  color: string;
};

type StaffLeadStat = {
  staff_id: string;
  name: string;
  email: string;
  staff_type: "setter" | "closer" | "general" | string;
  timezone: string;
  total_assigned: number;
  contacted: number;
  not_contacted: number;
  follow_up: number;
  sales_closed: number;
  contact_rate: number;
  conversion_rate: number;
};

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
  closer_name?: string;
  last_message_at: string;
};

type LeadAnalyticsReport = {
  timeframe: string;
  start_date: string | null;
  end_date: string | null;
  timezone: string;
  total_leads: number;
  contacted_count: number;
  not_contacted_count: number;
  contact_rate: number;
  sales_closed_count: number;
  conversion_rate: number;
  bot_count: number;
  human_count: number;
  status_distribution: SliceData[];
  staff_distribution: SliceData[];
  contact_distribution: SliceData[];
  mode_distribution: SliceData[];
  staff_stats: StaffLeadStat[];
  leads: Conversation[];
};

// ── SVG Donut / Pie Chart Component ──
function DonutChart({
  slices,
  centerTitle,
  centerSub,
  size = 220,
  innerRadiusRatio = 0.62,
}: {
  slices: SliceData[];
  centerTitle: string | number;
  centerSub: string;
  size?: number;
  innerRadiusRatio?: number;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const total = useMemo(() => slices.reduce((acc, s) => acc + s.value, 0), [slices]);

  if (total === 0) {
    return (
      <div 
        className="flex flex-col items-center justify-center rounded-full border border-dashed border-slate-200 bg-slate-50/50" 
        style={{ width: size, height: size }}
      >
        <PieIcon className="h-8 w-8 text-slate-300 mb-1" />
        <span className="text-xs font-semibold text-slate-500">No data</span>
        <span className="text-[10px] text-slate-400">0 leads in window</span>
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const outerR = (size / 2) - 12;
  const innerR = outerR * innerRadiusRatio;

  let currentAngle = -Math.PI / 2; // Start from 12 o'clock

  const paths = slices.map((slice, idx) => {
    if (slice.value === 0) return null;
    const sliceAngle = (slice.value / total) * (2 * Math.PI);
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    const isHovered = hoveredIdx === idx;
    const rOffset = isHovered ? 4 : 0;
    const curOuterR = outerR + rOffset;

    // Outer Arc
    const x1 = cx + curOuterR * Math.cos(startAngle);
    const y1 = cy + curOuterR * Math.sin(startAngle);
    const x2 = cx + curOuterR * Math.cos(endAngle);
    const y2 = cy + curOuterR * Math.sin(endAngle);

    // Inner Arc
    const x3 = cx + innerR * Math.cos(endAngle);
    const y3 = cy + innerR * Math.sin(endAngle);
    const x4 = cx + innerR * Math.cos(startAngle);
    const y4 = cy + innerR * Math.sin(startAngle);

    const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;

    const d = [
      `M ${x1} ${y1}`,
      `A ${curOuterR} ${curOuterR} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${x4} ${y4}`,
      "Z",
    ].join(" ");

    return (
      <path
        key={slice.name}
        d={d}
        fill={slice.color}
        className="transition-all duration-200 cursor-pointer"
        style={{
          opacity: hoveredIdx === null || isHovered ? 1 : 0.65,
          filter: isHovered ? "drop-shadow(0 4px 6px rgba(0,0,0,0.15))" : "none",
        }}
        onMouseEnter={() => setHoveredIdx(idx)}
        onMouseLeave={() => setHoveredIdx(null)}
      />
    );
  });

  const activeSlice = hoveredIdx !== null ? slices[hoveredIdx] : null;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="overflow-visible">
        {paths}
      </svg>
      {/* Center Label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        {activeSlice ? (
          <>
            <span className="text-xl font-bold tracking-tight text-slate-900 leading-none">
              {activeSlice.value}
            </span>
            <span className="text-[10px] font-semibold text-slate-500 mt-0.5 truncate max-w-[120px]">
              {activeSlice.name}
            </span>
            <span className="text-[10px] font-bold text-indigo-600">
              {activeSlice.percentage}%
            </span>
          </>
        ) : (
          <>
            <span className="text-2xl font-bold tracking-tight text-slate-900 leading-none">
              {centerTitle}
            </span>
            <span className="text-[11px] font-medium text-slate-400 mt-1 uppercase tracking-wider">
              {centerSub}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default function LeadAnalyticsPage() {
  const [timeframe, setTimeframe] = useState<"today" | "yesterday" | "week" | "month" | "all">("all");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("all");
  const [report, setReport] = useState<LeadAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState<"stages" | "staff" | "contact" | "mode">("stages");

  const fetchAnalytics = async (tf = timeframe, sid = selectedStaffId) => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      params.set("timeframe", tf);
      if (sid && sid !== "all") {
        params.set("staff_id", sid);
      }
      const data = await api.get<LeadAnalyticsReport>(`/conversations/analytics?${params.toString()}`);
      setReport(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(timeframe, selectedStaffId);
  }, [timeframe, selectedStaffId]);

  const handleTimeframeChange = (tf: "today" | "yesterday" | "week" | "month" | "all") => {
    setTimeframe(tf);
  };

  const handleStaffChange = (sid: string) => {
    setSelectedStaffId(sid);
  };

  const activeStaffObj = useMemo(() => {
    if (!report || selectedStaffId === "all") return null;
    return report.staff_stats.find(s => s.staff_id === selectedStaffId) || null;
  }, [report, selectedStaffId]);

  const tzInfo = getTimezoneOption(report?.timezone);

  return (
    <div className="space-y-8 pb-16">
      {/* Top Header & Context */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Lead Analytics & Staff Performance</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              <span>{tzInfo.flag}</span>
              <span>{tzInfo.short}</span>
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Pie chart visual reports, pipeline velocity, and staff lead contact accountability.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchAnalytics(timeframe, selectedStaffId)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 text-slate-500", refreshing && "animate-spin text-indigo-600")} />
            <span>Refresh Data</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar: Timeframe Selector + Staff Picker */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        {/* Timeframe Tabs */}
        <div className="flex items-center gap-1 bg-slate-100/70 p-1 rounded-xl">
          <Calendar className="h-4 w-4 text-slate-400 ml-1.5 mr-0.5 shrink-0" />
          {[
            { id: "today", label: "Today" },
            { id: "yesterday", label: "Yesterday" },
            { id: "week", label: "This Week" },
            { id: "month", label: "This Month" },
            { id: "all", label: "All Time" },
          ].map((tf) => (
            <button
              key={tf.id}
              onClick={() => handleTimeframeChange(tf.id as any)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                timeframe === tf.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Staff Filter Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Filter Agent:</span>
          <select
            value={selectedStaffId}
            onChange={(e) => handleStaffChange(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all cursor-pointer"
          >
            <option value="all">All Team Members</option>
            <option value="unassigned">Unassigned Leads Only</option>
            {report?.staff_stats.map((s) => (
              <option key={s.staff_id} value={s.staff_id}>
                {s.name} ({s.staff_type.toUpperCase()})
              </option>
            ))}
          </select>
          {selectedStaffId !== "all" && (
            <button
              onClick={() => handleStaffChange("all")}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Date Window Sub-banner */}
      {report?.start_date && (
        <div className="text-xs text-slate-500 flex items-center gap-1.5 px-1 -mt-4">
          <Clock className="h-3.5 w-3.5 text-slate-400" />
          <span>
            Window: <strong>{report.start_date}</strong> {report.end_date ? `to ${report.end_date}` : ""} ({report.timezone})
          </span>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Total Leads */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Leads</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <MessageSquare className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900">{report?.total_leads ?? 0}</span>
            <span className="text-xs font-medium text-slate-500">inquiries</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {timeframe === "all" ? "All-time total" : `Recorded for ${timeframe}`}
          </p>
        </div>

        {/* Contacted Leads & Rate */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Contacted Leads</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <UserCheck className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900">{report?.contacted_count ?? 0}</span>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md">
              {report?.contact_rate ?? 0}% rate
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 rounded-full transition-all duration-300" 
              style={{ width: `${report?.contact_rate ?? 0}%` }} 
            />
          </div>
        </div>

        {/* Pending / Not Contacted */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Not Contacted</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <AlertCircle className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900">{report?.not_contacted_count ?? 0}</span>
            <span className="text-xs font-medium text-slate-500">pending contact</span>
          </div>
          <p className="mt-1 text-[11px] text-rose-600 font-medium">
            Requires attention from Setters
          </p>
        </div>

        {/* Sales Closed & Conversion */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sales Closed</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Award className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900">{report?.sales_closed_count ?? 0}</span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md">
              {report?.conversion_rate ?? 0}% conv
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Deals closed & converted
          </p>
        </div>
      </div>

      {/* ── PIE CHART REPORTS SECTION ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Card: Interactive Pie Chart (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 mb-6 gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <PieIcon className="h-4 w-4 text-indigo-600" />
                <span>Visual Lead Distribution Report</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Hover over slices to inspect counts and percentage shares
              </p>
            </div>

            {/* Chart View Switcher */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/70 p-0.5">
              {[
                { id: "stages", label: "Pipeline Stages" },
                { id: "staff", label: "Staff Share" },
                { id: "contact", label: "Contact Status" },
                { id: "mode", label: "AI vs Human" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveChartTab(tab.id as any)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all",
                    activeChartTab === tab.id
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chart Content Area */}
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* Donut graphic */}
              <div className="md:col-span-6 flex justify-center py-4">
                <DonutChart
                  slices={
                    activeChartTab === "stages"
                      ? (report?.status_distribution || [])
                      : activeChartTab === "staff"
                      ? (report?.staff_distribution || [])
                      : activeChartTab === "contact"
                      ? (report?.contact_distribution || [])
                      : (report?.mode_distribution || [])
                  }
                  centerTitle={report?.total_leads || 0}
                  centerSub={
                    activeChartTab === "stages"
                      ? "Leads"
                      : activeChartTab === "staff"
                      ? "Assigned"
                      : activeChartTab === "contact"
                      ? "Inquiries"
                      : "Handled"
                  }
                  size={210}
                />
              </div>

              {/* Chart Legend List */}
              <div className="md:col-span-6 space-y-2 max-h-72 overflow-y-auto pr-1">
                {(
                  activeChartTab === "stages"
                    ? (report?.status_distribution || [])
                    : activeChartTab === "staff"
                    ? (report?.staff_distribution || [])
                    : activeChartTab === "contact"
                    ? (report?.contact_distribution || [])
                    : (report?.mode_distribution || [])
                ).map((slice) => (
                  <div
                    key={slice.name}
                    className="flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span className="text-xs font-semibold text-slate-800 truncate">
                        {slice.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs shrink-0">
                      <span className="font-bold text-slate-900">{slice.value}</span>
                      <span className="text-slate-400 font-medium w-12 text-right">
                        ({slice.percentage}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Card: Quick Insights & Automation Status (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <span>Conversion & Pipeline Velocity</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Efficiency metrics for {timeframe}
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Lead Contact Rate</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{report?.contact_rate ?? 0}%</p>
              </div>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                {report?.contacted_count ?? 0} / {report?.total_leads ?? 0} leads
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Sales Close Rate</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{report?.conversion_rate ?? 0}%</p>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                {report?.sales_closed_count ?? 0} closed
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">AI Autopilot Rate</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">
                  {report?.total_leads ? Math.round((report.bot_count / report.total_leads) * 100) : 0}%
                </p>
              </div>
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg">
                {report?.bot_count ?? 0} bot handled
              </span>
            </div>
          </div>

          {/* Staff Highlight badge */}
          {activeStaffObj && (
            <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-indigo-600" />
                <span className="text-xs font-bold text-indigo-900">
                  Filtering for {activeStaffObj.name}
                </span>
              </div>
              <p className="text-xs text-indigo-700 leading-relaxed">
                Assigned <strong>{activeStaffObj.total_assigned} leads</strong>, with <strong>{activeStaffObj.contacted} contacted</strong> ({activeStaffObj.contact_rate}% contact rate).
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── STAFF PERFORMANCE & ACCOUNTABILITY TABLE ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-4.5 w-4.5 text-indigo-600" />
              <span>Staff Lead Performance Breakdown</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tracks how many leads are assigned to each staff member and how many they contacted during {timeframe}.
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-lg">
            {report?.staff_stats.length ?? 0} Team Members Active
          </span>
        </div>

        {report?.staff_stats.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No staff records found for this workspace.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pl-1">Agent & Role</th>
                  <th className="pb-3">Assigned Leads</th>
                  <th className="pb-3">Contacted Leads</th>
                  <th className="pb-3">Contact Rate</th>
                  <th className="pb-3">Not Contacted</th>
                  <th className="pb-3">In Follow Up</th>
                  <th className="pb-3">Sales Closed</th>
                  <th className="pb-3 pr-1 text-right">Drilldown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report?.staff_stats.map((s) => {
                  const initial = s.name ? s.name.charAt(0).toUpperCase() : s.email.charAt(0).toUpperCase();
                  const isFiltered = selectedStaffId === s.staff_id;

                  return (
                    <tr
                      key={s.staff_id}
                      className={cn(
                        "group transition-colors",
                        isFiltered ? "bg-indigo-50/50" : "hover:bg-slate-50/70"
                      )}
                    >
                      {/* Agent & Role */}
                      <td className="py-3.5 pl-1">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white shadow-xs">
                            {initial}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-sm leading-tight">
                              {s.name}
                            </div>
                            <div className="text-xs text-slate-500 font-medium mt-0.5">
                              {s.email}
                            </div>
                            <div className="mt-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1">
                              {s.staff_type === "setter" ? (
                                <span className="text-emerald-700 ring-emerald-600/20 bg-emerald-50">Setter</span>
                              ) : s.staff_type === "closer" ? (
                                <span className="text-blue-700 ring-blue-600/20 bg-blue-50">Closer</span>
                              ) : (
                                <span className="text-slate-600 ring-slate-500/20 bg-slate-100">General</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Total Assigned */}
                      <td className="py-3.5">
                        <span className="text-base font-bold text-slate-900">
                          {s.total_assigned}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">leads</span>
                      </td>

                      {/* Contacted */}
                      <td className="py-3.5">
                        <span className="text-sm font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                          {s.contacted} contacted
                        </span>
                      </td>

                      {/* Contact Rate Progress */}
                      <td className="py-3.5">
                        <div className="flex flex-col gap-1 w-32">
                          <div className="flex justify-between text-xs font-bold text-slate-700">
                            <span>{s.contact_rate}%</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              {s.contacted}/{s.total_assigned}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full transition-all"
                              style={{ width: `${s.contact_rate}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Not Contacted */}
                      <td className="py-3.5">
                        <span className={cn(
                          "text-xs font-semibold px-2 py-0.5 rounded-md border",
                          s.not_contacted > 0
                            ? "bg-rose-50 text-rose-700 border-rose-200/60 font-bold"
                            : "bg-slate-50 text-slate-500 border-slate-200/60"
                        )}>
                          {s.not_contacted} pending
                        </span>
                      </td>

                      {/* Follow Up */}
                      <td className="py-3.5">
                        <span className="text-xs font-semibold text-slate-700">
                          {s.follow_up}
                        </span>
                      </td>

                      {/* Sales Closed */}
                      <td className="py-3.5">
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                          {s.sales_closed} closed
                        </span>
                      </td>

                      {/* Drilldown button */}
                      <td className="py-3.5 pr-1 text-right">
                        <button
                          onClick={() => handleStaffChange(isFiltered ? "all" : s.staff_id)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold transition-all border",
                            isFiltered
                              ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                          )}
                        >
                          <span>{isFiltered ? "Viewing" : "Filter"}</span>
                          <ChevronRight className="h-3 w-3" />
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

      {/* ── MATCHING LEADS PREVIEW FOR TIMEFRAME ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Leads in Selected Timeframe ({report?.leads.length ?? 0} shown)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Filtered for <strong>{timeframe}</strong> {selectedStaffId !== "all" ? `and selected agent` : ""}
            </p>
          </div>
        </div>

        {report?.leads.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No leads recorded in this time window.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pl-1">Lead Contact</th>
                  <th className="pb-3">Pipeline Stage</th>
                  <th className="pb-3">Assigned Staff</th>
                  <th className="pb-3">Mode</th>
                  <th className="pb-3 pr-1 text-right">Last Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report?.leads.map((conv) => (
                  <tr key={conv.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 pl-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">
                          {conv.lead_name || "Unknown Lead"}
                        </span>
                        <span className="font-mono text-xs text-slate-500">
                          {conv.wa_user_phone}
                        </span>
                      </div>
                    </td>

                    <td className="py-3">
                      <span className={cn(
                        "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
                        getLeadStatusBadgeStyle(conv.lead_status)
                      )}>
                        {conv.lead_status}
                      </span>
                    </td>

                    <td className="py-3 text-xs text-slate-600">
                      {conv.assigned_name || conv.assigned_email || (
                        <span className="italic text-slate-400">Unassigned</span>
                      )}
                    </td>

                    <td className="py-3">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        conv.status === "bot" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      )}>
                        <span className={cn("h-1 w-1 rounded-full", conv.status === "bot" ? "bg-emerald-500" : "bg-amber-500")} />
                        {conv.status === "bot" ? "AI Bot" : "Human"}
                      </span>
                    </td>

                    <td className="py-3 pr-1 text-right text-xs text-slate-500">
                      {formatInTimezone(conv.last_message_at, report.timezone)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

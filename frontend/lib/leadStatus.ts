export const LEAD_STATUS_OPTIONS = [
  { value: "not contacted", label: "Not Contacted" },
  { value: "contacted", label: "Contacted" },
  { value: "not answering", label: "Not Answering" },
  { value: "follow up", label: "Follow up" },
  { value: "ready to showup", label: "Ready to Showup" },
  { value: "no showup", label: "No Showup" },
  { value: "negotiable", label: "Negotiable" },
  { value: "sales close", label: "Sales close" },
  { value: "converted", label: "Converted" },
  { value: "paid lead", label: "Paid Lead" },
  { value: "unpaid lead", label: "Unpaid Lead" },
  { value: "not interested", label: "Not Interested" },
  { value: "lead lost", label: "Lead Lost" },
  { value: "junk leads", label: "Junk Leads" },
  { value: "blocked", label: "Blocked" },
] as const;

export type LeadStatusType = typeof LEAD_STATUS_OPTIONS[number]["value"];

export interface LeadStatusLog {
  id?: string | null;
  from_status?: string | null;
  to_status: string;
  changed_by_name?: string | null;
  changed_by_email?: string | null;
  changed_by_role?: string | null;
  changed_at: string;
  notes?: string | null;
}

export function normalizeLeadStatus(status?: string | null): string {
  if (!status) return "not contacted";
  const s = status.toLowerCase().trim();
  if (s === "capture") return "not contacted";
  if (s === "qualify") return "contacted";
  if (s === "not answering" || s === "not-answering" || s === "no answer" || s === "no-answer") return "not answering";
  if (s === "follow-up" || s === "followup" || s === "follow up") return "follow up";
  if (s === "ready to show up" || s === "ready for showup" || s === "ready for show up") return "ready to showup";
  if (s === "no show up" || s === "no showup") return "no showup";
  if (s === "sales close" || s === "sales-close" || s === "sales closed") return "sales close";
  if (s === "convert potential buyers" || s === "convert") return "converted";
  if (s === "paid" || s === "paid lead" || s === "paid consultation" || s === "paid-lead") return "paid lead";
  if (s === "unpaid" || s === "unpaid lead" || s === "unpaid consultation" || s === "unpaid-lead") return "unpaid lead";
  if (s === "not interested" || s === "not-interested") return "not interested";
  if (s === "junk" || s === "junk lead" || s === "junk leads" || s === "junk-lead" || s === "junk-leads") return "junk leads";
  return s;
}

export function getLeadStatusLabel(status?: string | null): string {
  const norm = normalizeLeadStatus(status);
  const found = LEAD_STATUS_OPTIONS.find((o) => o.value === norm);
  return found ? found.label : (status || "Not Contacted");
}

export function getLeadStatusBadgeStyle(status?: string | null): string {
  const norm = normalizeLeadStatus(status);
  switch (norm) {
    case "not contacted":
      return "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200";
    case "contacted":
      return "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100";
    case "not answering":
      return "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100";
    case "follow up":
      return "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100";
    case "ready to showup":
      return "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100";
    case "no showup":
      return "bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100";
    case "negotiable":
      return "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100";
    case "sales close":
      return "bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100";
    case "converted":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100";
    case "paid lead":
      return "bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200 font-bold";
    case "unpaid lead":
      return "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200 font-bold";
    case "not interested":
      return "bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200";
    case "lead lost":
      return "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100";
    case "junk leads":
      return "bg-stone-100 text-stone-700 border-stone-200 hover:bg-stone-200";
    case "blocked":
      return "bg-rose-100 text-rose-800 border-rose-300 font-bold hover:bg-rose-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200";
  }
}

export function getLeadStatusOptionsForRole(role?: string | null, currentStatus?: string | null) {
  const norm = normalizeLeadStatus(currentStatus);
  if (role === "setter") {
    const setterOptions = [
      { value: "not contacted", label: "Not Contacted" },
      { value: "contacted", label: "Contacted" },
      { value: "not answering", label: "Not Answering" },
      { value: "follow up", label: "Follow up" },
      { value: "ready to showup", label: "Ready to Showup" },
      { value: "sales close", label: "Sales close" },
      { value: "paid lead", label: "Paid Lead" },
      { value: "unpaid lead", label: "Unpaid Lead" },
      { value: "not interested", label: "Not Interested" },
      { value: "lead lost", label: "Lead Lost" },
      { value: "junk leads", label: "Junk Leads" },
      { value: "blocked", label: "Blocked" },
    ];
    if (currentStatus && !setterOptions.some(o => o.value === norm)) {
      const match = LEAD_STATUS_OPTIONS.find(o => o.value === norm);
      if (match) setterOptions.push(match);
    }
    return setterOptions;
  }
  if (role === "closer") {
    const closerOptions = [
      { value: "not contacted", label: "Not Contacted" },
      { value: "contacted", label: "Contacted" },
      { value: "not answering", label: "Not Answering" },
      { value: "follow up", label: "Follow up" },
      { value: "ready to showup", label: "Ready to Showup" },
      { value: "no showup", label: "No Showup" },
      { value: "negotiable", label: "Negotiable" },
      { value: "sales close", label: "Sales close" },
      { value: "converted", label: "Converted" },
      { value: "paid lead", label: "Paid Lead" },
      { value: "unpaid lead", label: "Unpaid Lead" },
      { value: "not interested", label: "Not Interested" },
      { value: "lead lost", label: "Lead Lost" },
      { value: "junk leads", label: "Junk Leads" },
      { value: "blocked", label: "Blocked" },
    ];
    if (currentStatus && !closerOptions.some(o => o.value === norm)) {
      const match = LEAD_STATUS_OPTIONS.find(o => o.value === norm);
      if (match) closerOptions.unshift(match);
    }
    return closerOptions;
  }
  return LEAD_STATUS_OPTIONS;
}

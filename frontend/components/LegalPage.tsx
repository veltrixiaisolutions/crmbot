import Link from "next/link";
import { LEGAL } from "@/lib/legal";

const PAGES = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/data-deletion", label: "Data Deletion" },
];

export function LegalPage({ title, current, children }: { title: string; current: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 sm:p-8 shadow-sm border border-slate-200">
        <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {PAGES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className={p.href === current ? "font-semibold text-indigo-700" : "text-slate-500 hover:text-indigo-600 underline"}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">{title}</h1>
        <p className="text-sm text-slate-500 mb-8">Last updated: {LEGAL.lastUpdated}</p>
        <div className="space-y-4 text-sm text-slate-700 leading-relaxed">{children}</div>
      </div>
    </main>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-slate-900 pt-6 mt-2 border-t border-slate-100">{children}</h2>;
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

export function Email() {
  return (
    <a href={`mailto:${LEGAL.email}`} className="font-medium text-indigo-600 underline hover:text-indigo-800">
      {LEGAL.email}
    </a>
  );
}

export function ContactBlock() {
  return (
    <p>
      {LEGAL.legalName} ({LEGAL.brand})
      <br />
      {LEGAL.address}
      <br />
      Email: <Email />
      <br />
      Grievance Officer: {LEGAL.grievanceOfficer} — <Email />
    </p>
  );
}

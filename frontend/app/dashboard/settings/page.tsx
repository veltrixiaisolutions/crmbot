"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, ArrowRight, CheckCircle } from "lucide-react";
import { api } from "@/lib/api";
import { TIMEZONE_OPTIONS, getTimezoneOption } from "@/lib/timezone";
import { WhatsAppConnect } from "@/components/WhatsAppConnect";
import type { OnboardingResult } from "@/lib/metaSignup";

type BusinessHours = {
  timezone: string;
  open_time: string;
  close_time: string;
  days_open: string[];
};

type Tenant = {
  id: string;
  business_name: string;
  whatsapp_phone_number_id: string;
  system_prompt: string;
  escalation_contact: string | null;
  business_hours: BusinessHours;
};

export default function SettingsPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newAccessToken, setNewAccessToken] = useState("");
  const [metaConnected, setMetaConnected] = useState(false);

  useEffect(() => {
    api
      .get<Tenant>("/tenants/me")
      .then(setTenant)
      .catch((err) => setError(err.message));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload: any = {
        business_name: tenant.business_name,
        system_prompt: tenant.system_prompt,
        escalation_contact: tenant.escalation_contact,
        business_hours: tenant.business_hours,
        timezone: tenant.business_hours?.timezone,
        whatsapp_phone_number_id: tenant.whatsapp_phone_number_id,
      };
      if (newAccessToken.trim()) {
        payload.whatsapp_access_token = newAccessToken.trim();
      }

      const updated = await api.patch<Tenant>("/tenants/me", payload);
      setTenant(updated);
      setNewAccessToken("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleMetaConnected(result: OnboardingResult) {
    await api.post(`/meta/embedded-signup/${result.onboarding_id}/attach`);
    setMetaConnected(true);
    // Refresh tenant data to pick up the new phone_number_id saved by backend
    api.get<Tenant>("/tenants/me").then(setTenant).catch(() => {});
  }

  if (error && !tenant) return <p className="text-sm text-red-600">{error}</p>;
  if (!tenant) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Settings</h1>
        <Link
          href="/dashboard/admins"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
        >
          <Shield className="h-3.5 w-3.5 text-indigo-600" />
          <span>Manage Admin Accounts</span>
          <ArrowRight className="h-3 w-3 text-slate-400" />
        </Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved.</p>}

      <div className="space-y-3 rounded-lg border bg-white p-4">
        <div>
          <label className="text-xs font-medium text-gray-500">Business name</label>
          <input
            value={tenant.business_name}
            onChange={(e) => setTenant({ ...tenant, business_name: e.target.value })}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Bot tone / system prompt</label>
          <textarea
            value={tenant.system_prompt}
            onChange={(e) => setTenant({ ...tenant, system_prompt: e.target.value })}
            rows={4}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Escalation contact (phone or email)</label>
          <input
            value={tenant.escalation_contact || ""}
            onChange={(e) => setTenant({ ...tenant, escalation_contact: e.target.value })}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Workspace Timezone</label>
          <select
            value={getTimezoneOption(tenant.business_hours?.timezone || (tenant as any).timezone).value}
            onChange={(e) => {
              const tz = e.target.value;
              setTenant({
                ...tenant,
                business_hours: { ...tenant.business_hours, timezone: tz },
              });
            }}
            className="mt-1 w-full rounded border px-3 py-2 text-sm bg-white"
          >
            {TIMEZONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.flag} {opt.label} ({opt.short})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Open</label>
          <input
            value={tenant.business_hours.open_time}
            onChange={(e) =>
              setTenant({ ...tenant, business_hours: { ...tenant.business_hours, open_time: e.target.value } })
            }
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Close</label>
          <input
            value={tenant.business_hours.close_time}
            onChange={(e) =>
              setTenant({ ...tenant, business_hours: { ...tenant.business_hours, close_time: e.target.value } })
            }
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* ── WhatsApp Connection Section ─────────────────────────────────── */}
      <div className="rounded-lg border bg-white p-4">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-800">WhatsApp Connection</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Connect your WhatsApp Business Account using the official Meta Embedded Signup flow,
            or enter your credentials manually below.
          </p>
        </div>

        {/* Meta Embedded Signup */}
        <div className="mb-5">
          <p className="mb-2 text-xs font-medium text-slate-600">
            🚀 Recommended — Connect via Meta (Embedded Signup)
          </p>
          {metaConnected && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              WhatsApp account connected successfully via Meta!
            </div>
          )}
          <WhatsAppConnect
            onOnboarded={handleMetaConnected}
            currentPhoneNumberId={tenant.whatsapp_phone_number_id}
          />
        </div>

        {/* Divider */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-xs text-slate-400">
              or enter credentials manually
            </span>
          </div>
        </div>

        {/* Manual credentials */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">WhatsApp Phone Number ID</label>
            <input
              value={tenant.whatsapp_phone_number_id}
              onChange={(e) => setTenant({ ...tenant, whatsapp_phone_number_id: e.target.value })}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">New WhatsApp Access Token (leave blank to keep current)</label>
            <input
              type="password"
              value={newAccessToken}
              onChange={(e) => setNewAccessToken(e.target.value)}
              placeholder="Paste new access token here..."
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

"use client";

/**
 * WhatsAppConnect — Meta Embedded Signup buttons.
 *
 * Offers both onboarding paths: a new / Cloud API number, or a number the
 * client already uses in the WhatsApp Business app (coexistence). The backend
 * completes onboarding; `onOnboarded` receives the result and the caller
 * decides where to attach it (new tenant at signup, current tenant in settings).
 */

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, ChevronRight, ExternalLink, Loader2, Smartphone } from "lucide-react";
import {
  getMetaConfig,
  launchEmbeddedSignup,
  loadFbSdk,
  type MetaConfig,
  type OnboardingResult,
  type OnboardingType,
} from "@/lib/metaSignup";

interface Props {
  onOnboarded: (result: OnboardingResult) => Promise<void> | void;
  currentPhoneNumberId?: string;
}

const OPTIONS: { type: OnboardingType; title: string; subtitle: string }[] = [
  {
    type: "cloud_api",
    title: "Connect a new number",
    subtitle: "A number not currently used on WhatsApp",
  },
  {
    type: "coexistence",
    title: "Use my WhatsApp Business app number",
    subtitle: "Keep using the app on your phone alongside the bot",
  },
];

export function WhatsAppConnect({ onOnboarded, currentPhoneNumberId }: Props) {
  const [config, setConfig] = useState<MetaConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [sdkReady, setSdkReady] = useState(false);
  const [isHttps, setIsHttps] = useState(true);
  const [busy, setBusy] = useState<OnboardingType | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState<OnboardingResult | null>(null);

  useEffect(() => {
    setIsHttps(window.location.protocol === "https:");
    getMetaConfig()
      .then(setConfig)
      .catch((err: Error) => setConfigError(err.message));
  }, []);

  useEffect(() => {
    if (!config?.configured) return;
    loadFbSdk(config)
      .then(() => setSdkReady(true))
      .catch((err: Error) => setError(err.message));
  }, [config]);

  function connect(type: OnboardingType) {
    if (!config) return;
    setError("");
    setBusy(type);
    launchEmbeddedSignup(config, type)
      .then(async (result) => {
        await onOnboarded(result);
        setConnected(result);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "WhatsApp connection failed."))
      .finally(() => setBusy(null));
  }

  if (configError) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
        <span>
          Couldn&apos;t reach the server to load the Meta settings ({configError}). Make sure the backend is
          running, then reload this page.
        </span>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!config.configured) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Meta App not configured</p>
            <p className="mt-1 text-amber-700">
              Add <code className="rounded bg-amber-100 px-1">META_APP_ID</code>,{" "}
              <code className="rounded bg-amber-100 px-1">META_APP_SECRET</code> and{" "}
              <code className="rounded bg-amber-100 px-1">META_ES_CONFIG_ID</code> to your backend{" "}
              <code className="rounded bg-amber-100 px-1">.env</code> file, then restart the server.
            </p>
            <a
              href="https://developers.facebook.com/docs/whatsapp/embedded-signup/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-amber-600 underline hover:text-amber-800"
            >
              View Meta Docs <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (connected) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-800">WhatsApp Connected!</p>
            <p className="text-xs text-green-600">
              {connected.display_phone_number || connected.phone_number_id}
              {connected.verified_name && ` · ${connected.verified_name}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConnected(null)}
          className="mt-3 text-xs text-green-700 underline hover:text-green-900"
        >
          Connect a different number
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {OPTIONS.map((opt) => (
        <button
          key={opt.type}
          type="button"
          onClick={() => connect(opt.type)}
          disabled={!sdkReady || busy !== null}
          className="group flex w-full items-center gap-3 rounded-xl border-2 border-[#1877F2] bg-white px-5 py-3 text-left text-[#1877F2] shadow-sm transition-all hover:bg-[#1877F2] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {opt.type === "cloud_api" ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current" aria-hidden="true">
              <path d="M24 12.073C24 5.406 18.627 0 12 0S0 5.406 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.884v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
            </svg>
          ) : (
            <Smartphone className="h-5 w-5 shrink-0" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{opt.title}</span>
            <span className="block text-xs opacity-75">{opt.subtitle}</span>
          </span>
          {busy === opt.type ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
      ))}

      {currentPhoneNumberId && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
          Currently connected:{" "}
          <span className="font-mono font-medium text-slate-700">{currentPhoneNumberId}</span>
        </p>
      )}

      {!isHttps && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>
            Meta only allows this login on HTTPS pages. Open the dashboard through your HTTPS domain (or an ngrok
            URL) that is listed under Facebook Login for Business → Allowed domains.
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Opens a Meta window where you choose your business and phone number. If it doesn&apos;t appear, allow
        pop-ups for this site.
      </p>
    </div>
  );
}

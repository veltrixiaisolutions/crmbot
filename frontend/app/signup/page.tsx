"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, signup } from "@/lib/api";
import type { OnboardingResult } from "@/lib/metaSignup";
import { WhatsAppConnect } from "@/components/WhatsAppConnect";
import { motion, AnimatePresence } from "framer-motion";
import {
  Hexagon,
  ArrowRight,
  Loader2,
  Building2,
  Key,
  MessageCircle,
  Mail,
  Lock,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TenantOut = { id: string };

export default function SignupPage() {
  const router = useRouter();

  // Multi-step state: 1 = Connect WhatsApp, 2 = Register Account
  const [step, setStep] = useState<1 | 2>(1);

  // WhatsApp connection state
  const [metaConnected, setMetaConnected] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [onboarding, setOnboarding] = useState<OnboardingResult | null>(null);
  const [manualMode, setManualMode] = useState(false);

  // Registration state
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Embedded Signup finished on the backend; the tenant gets it on register
  function handleOnboarded(result: OnboardingResult) {
    setOnboarding(result);
    setPhoneNumberId(result.phone_number_id);
    setWabaId(result.waba_id);
    setMetaConnected(true);
    setError(null);
    setStep(2);
  }

  // Handle final registration submit
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 1. Create the tenant with WhatsApp credentials attached
      const tenant = await api.post<TenantOut>(
        "/tenants",
        onboarding
          ? { business_name: businessName, meta_onboarding_id: onboarding.onboarding_id }
          : {
              business_name: businessName,
              whatsapp_phone_number_id: phoneNumberId,
              whatsapp_access_token: accessToken || "",
              waba_id: wabaId || undefined,
              meta_connected: metaConnected,
            }
      );

      // 2. Create the admin user under this tenant
      await signup(email, password, tenant.id);

      // 3. Enter the platform CRM directly
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#F8FAFC] overflow-hidden py-12 px-4">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-400/20 rounded-full blur-[120px] pointer-events-none mix-blend-multiply" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-400/20 rounded-full blur-[100px] pointer-events-none mix-blend-multiply" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-[520px] z-10"
      >
        {/* Logo and Branding */}
        <div className="flex flex-col items-center mb-6">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 shadow-xl shadow-indigo-200 mb-3"
          >
            <Hexagon className="w-7 h-7 text-white fill-white/20" />
          </motion.div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-transparent">
            Get Started with Veltrix AI
          </h1>
          <p className="text-slate-500 mt-1 font-medium text-xs sm:text-sm text-center">
            {step === 1
              ? "Step 1: Connect your WhatsApp Business Account"
              : "Step 2: Create your admin credentials & workspace"}
          </p>
        </div>

        <div className="w-full rounded-3xl border border-white/60 bg-white/80 p-8 sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl relative overflow-hidden">
          {/* Step Progress Indicators */}
          <div className="flex items-center justify-center mb-8 gap-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all",
                  step >= 1
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                    : "bg-slate-200 text-slate-500"
                )}
              >
                {metaConnected ? <CheckCircle2 className="h-4 w-4" /> : "1"}
              </div>
              <span
                className={cn(
                  "text-xs font-semibold",
                  step === 1 ? "text-indigo-600" : "text-slate-500"
                )}
              >
                Connect WhatsApp
              </span>
            </div>

            <div className="h-0.5 w-8 bg-slate-200" />

            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all",
                  step === 2
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                    : "bg-slate-200 text-slate-500"
                )}
              >
                2
              </div>
              <span
                className={cn(
                  "text-xs font-semibold",
                  step === 2 ? "text-indigo-600" : "text-slate-500"
                )}
              >
                Register
              </span>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="p-3 mb-6 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-100 rounded-xl text-center"
            >
              {error}
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                {/* Meta Connected Celebration Card */}
                {metaConnected ? (
                  <div className="rounded-2xl border border-green-200 bg-green-50/80 p-5 text-center space-y-3">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 shadow-sm">
                      <CheckCircle2 className="h-7 w-7 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-green-900">
                        WhatsApp Account Connected!
                      </h3>
                      <p className="text-xs text-green-700 mt-1">
                        <span className="font-mono font-semibold">
                          {onboarding?.display_phone_number || phoneNumberId}
                        </span>
                        {onboarding?.verified_name && ` · ${onboarding.verified_name}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-green-700 transition-all"
                    >
                      Continue to Registration <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOnboarding(null);
                        setMetaConnected(false);
                        setPhoneNumberId("");
                        setWabaId("");
                      }}
                      className="text-xs text-green-700 underline hover:text-green-900"
                    >
                      Connect a different number
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-center space-y-1.5">
                      <h2 className="text-lg font-bold text-slate-800">
                        Connect with Meta in 1 Click
                      </h2>
                      <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                        Authorize your WhatsApp Business Account using the official
                        Meta Embedded Signup. No complex developer setup required.
                      </p>
                    </div>

                    <WhatsAppConnect onOnboarded={handleOnboarded} />

                    {/* Security note */}
                    <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
                      <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
                      <span>Official Meta Tech Provider Integration · 256-bit Encrypted</span>
                    </div>

                    {/* Manual entry toggle */}
                    <div className="pt-2 border-t border-slate-100 text-center">
                      {!manualMode ? (
                        <button
                          type="button"
                          onClick={() => setManualMode(true)}
                          className="text-xs text-slate-400 hover:text-indigo-600 transition-colors"
                        >
                          Have credentials already? Enter manually →
                        </button>
                      ) : (
                        <div className="space-y-3 pt-2 text-left">
                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1.5">
                              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp Phone Number ID
                            </label>
                            <input
                              value={phoneNumberId}
                              onChange={(e) => setPhoneNumberId(e.target.value)}
                              placeholder="e.g. 1458024624050390"
                              className="w-full h-11 rounded-xl border border-slate-200 px-3 text-xs text-slate-800 bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1.5">
                              <Key className="w-3.5 h-3.5" /> WhatsApp Access Token (Optional)
                            </label>
                            <input
                              value={accessToken}
                              onChange={(e) => setAccessToken(e.target.value)}
                              placeholder="Paste access token..."
                              className="w-full h-11 rounded-xl border border-slate-200 px-3 text-xs text-slate-800 bg-white"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!phoneNumberId) {
                                setError("Please enter a WhatsApp Phone Number ID");
                                return;
                              }
                              setError(null);
                              setStep(2);
                            }}
                            className="w-full rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-white hover:bg-slate-900 transition-all"
                          >
                            Proceed with Manual ID →
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            ) : (
              <motion.form
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleRegister}
                className="space-y-4"
              >
                {/* Connected WhatsApp Badge */}
                <div className="flex items-center justify-between rounded-xl bg-indigo-50/70 border border-indigo-100 px-3.5 py-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                    <span className="font-medium text-indigo-900">
                      WhatsApp Connected:
                    </span>
                    <span className="font-mono text-indigo-700">
                      {phoneNumberId || "Verified via Meta"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-[11px] text-indigo-600 underline hover:text-indigo-800"
                  >
                    Change
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" /> Business Name
                  </label>
                  <input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                    placeholder="e.g. Acme Retail Solutions"
                    className="w-full h-11 rounded-xl border border-slate-200/80 px-3.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all text-xs text-slate-800 bg-white/50 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> Admin Work Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="admin@yourbusiness.com"
                    className="w-full h-11 rounded-xl border border-slate-200/80 px-3.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all text-xs text-slate-800 bg-white/50 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> Choose Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    className="w-full h-11 rounded-xl border border-slate-200/80 px-3.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all text-xs text-slate-800 bg-white/50 focus:bg-white"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="h-11 px-4 flex items-center justify-center rounded-xl bg-slate-100 font-semibold text-xs text-slate-600 hover:bg-slate-200 transition-all"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 h-11 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 font-semibold text-xs text-white shadow-lg shadow-indigo-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" /> Complete Setup & Launch CRM
                      </>
                    )}
                  </button>
                </div>
                <p className="text-center text-[11px] text-slate-400">
                  By creating an account you agree to our{" "}
                  <Link href="/terms" className="underline hover:text-indigo-600">Terms of Service</Link> and{" "}
                  <Link href="/privacy" className="underline hover:text-indigo-600">Privacy Policy</Link>.
                </p>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="text-center mt-6">
            <p className="text-xs font-medium text-slate-500">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-indigo-600 hover:text-indigo-700 font-semibold underline decoration-indigo-200 underline-offset-4 transition-colors"
              >
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

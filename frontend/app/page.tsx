import Link from "next/link";
import { Hexagon, ArrowRight, MessageSquare, Bot, ShieldCheck, Zap, Users, BarChart3 } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 selection:bg-indigo-500 selection:text-white">
      {/* Background Glows */}
      <div className="absolute top-0 right-1/4 w-[600px] h-[400px] bg-gradient-to-tr from-indigo-200/40 to-purple-200/40 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 left-10 w-[500px] h-[350px] bg-gradient-to-tr from-blue-200/30 to-indigo-200/30 rounded-full blur-[120px] pointer-events-none" />

      {/* Navigation Header */}
      <header className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between border-b border-slate-200/60 bg-white/40 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 shadow-md shadow-indigo-200">
            <Hexagon className="h-5 w-5 text-white fill-white/20" />
          </div>
          <div>
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-slate-900 to-indigo-900 bg-clip-text text-transparent">
              Veltrix AI
            </span>
            <span className="ml-1.5 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
              Tech Provider
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            Connect WhatsApp <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-indigo-50/80 px-3.5 py-1.5 text-xs font-semibold text-indigo-800 shadow-sm mb-6">
          <Sparkles className="h-3.5 w-3.5 text-indigo-600" /> Official Meta WhatsApp Cloud Tech Provider
        </div>

        <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-slate-900 leading-[1.1] mb-6">
          Automate WhatsApp Support <br />
          <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            with Next-Gen AI
          </span>
        </h1>

        <p className="mx-auto max-w-2xl text-base sm:text-lg text-slate-600 leading-relaxed mb-10">
          Connect your official WhatsApp Business Account in 60 seconds with Meta Embedded Signup.
          Deliver 24/7 autonomous support, AI lead qualification, and unified customer CRM.
        </p>

        {/* Primary CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link
            href="/signup"
            className="group flex w-full sm:w-auto items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 px-8 py-4 text-base font-bold text-white shadow-xl shadow-indigo-200 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            {/* Meta "f" Logo */}
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
              <path d="M24 12.073C24 5.406 18.627 0 12 0S0 5.406 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.884v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
            </svg>
            <span>Connect WhatsApp & Get Started</span>
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto rounded-2xl border border-slate-200 bg-white px-6 py-4 text-base font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            Sign In to Existing Account
          </Link>
        </div>

        {/* Onboarding Funnel Steps Indicator */}
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white/70 p-6 sm:p-8 shadow-sm backdrop-blur-md mb-20">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-6">
            Simple 3-Step Seamless Onboarding
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <div className="space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs">
                1
              </div>
              <h3 className="text-sm font-bold text-slate-800">Connect via Meta</h3>
              <p className="text-xs text-slate-500">
                1-click Embedded Signup directly links your official WhatsApp Business number.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs">
                2
              </div>
              <h3 className="text-sm font-bold text-slate-800">Register Account</h3>
              <p className="text-xs text-slate-500">
                Create your business workspace and set up your admin team login.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs">
                3
              </div>
              <h3 className="text-sm font-bold text-slate-800">Launch AI Agent</h3>
              <p className="text-xs text-slate-500">
                Instantly access the full CRM with vector RAG search, live chats, and lead analytics.
              </p>
            </div>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 mb-4">
              <Bot className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Claude 3.5 AI Knowledge Bot
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Upload your documents, FAQs, and pricing. Our Voyage AI RAG engine answers customer questions accurately in seconds.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 mb-4">
              <Users className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Multi-Client Scaling
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Built as a Meta Tech Provider architecture with strict multi-tenant isolation. Onboard unlimited client numbers effortlessly.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600 mb-4">
              <BarChart3 className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Live Chat & Lead CRM
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Monitor incoming WhatsApp chats in real-time, view lead scores, and take over with human agent escalation whenever needed.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
        <div className="flex items-center justify-center gap-6 mb-3">
          <Link href="/privacy" className="hover:text-slate-600 underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-slate-600 underline">
            Terms of Service
          </Link>
          <Link href="/data-deletion" className="hover:text-slate-600 underline">
            User Data Deletion
          </Link>
          <Link href="/login" className="hover:text-slate-600 underline">
            Sign In
          </Link>
          <Link href="/signup" className="hover:text-slate-600 underline">
            Get Started
          </Link>
        </div>
        <p>© 2026 Veltrix AI Solutions. Powered by Meta WhatsApp Business Platform.</p>
      </footer>
    </div>
  );
}

function Sparkles(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

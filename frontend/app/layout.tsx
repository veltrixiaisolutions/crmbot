import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WhatsApp AI Chatbot Dashboard",
  description: "Manage your clients' WhatsApp AI agents",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                window.addEventListener('error', function(e) {
                  if (
                    (e.filename && (e.filename.includes('chrome-extension://') || e.filename.includes('moz-extension://'))) ||
                    (e.message && e.message.includes('M_ID'))
                  ) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                  }
                }, true);
                window.addEventListener('unhandledrejection', function(e) {
                  var r = e.reason;
                  if (
                    r && (
                      (r.stack && (r.stack.includes('chrome-extension://') || r.stack.includes('moz-extension://'))) ||
                      (r.message && r.message.includes('M_ID'))
                    )
                  ) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                  }
                }, true);
              }
            `,
          }}
        />
      </head>
      <body className={cn(
        inter.className,
        "h-full min-h-screen bg-[#F8FAFC] text-slate-900 antialiased selection:bg-indigo-500/30"
      )}>
        {children}
      </body>
    </html>
  );
}

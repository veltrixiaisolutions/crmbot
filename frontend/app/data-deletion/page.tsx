import type { Metadata } from "next";
import { CheckCircle, AlertCircle } from "lucide-react";
import { LEGAL } from "@/lib/legal";
import { ContactBlock, Email, H2, LegalPage, List } from "@/components/LegalPage";

export const metadata: Metadata = { title: `Data Deletion | ${LEGAL.brand}` };

type DeletionStatus = { confirmation_code: string; status: string; received_at: string };

// Meta links people here with ?code=<confirmation code> after our data
// deletion callback (POST /meta/data-deletion) has handled their request.
async function getDeletionStatus(code: string): Promise<DeletionStatus | null> {
  const backend = process.env.INTERNAL_BACKEND_URL || "http://127.0.0.1:8040";
  try {
    const res = await fetch(`${backend}/meta/data-deletion/${encodeURIComponent(code)}`, { cache: "no-store" });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

export default async function DataDeletionPage({ searchParams }: { searchParams: { code?: string } }) {
  const code = searchParams.code?.trim();
  const request = code ? await getDeletionStatus(code) : null;

  return (
    <LegalPage title="Data Deletion" current="/data-deletion">
      {code && (
        <div
          className={
            request
              ? "flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800"
              : "flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800"
          }
        >
          {request ? (
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          )}
          <div>
            <p className="font-semibold">Deletion request {code}</p>
            {request ? (
              <p className="mt-1">
                Status: <strong className="capitalize">{request.status}</strong>, received{" "}
                {new Date(request.received_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.
                We do not store Facebook profile information or Facebook user IDs, so no Facebook data about you
                remains with us. To delete business or WhatsApp conversation data, follow the steps below.
              </p>
            ) : (
              <p className="mt-1">
                We couldn&apos;t find this confirmation code. Please check the link, or email <Email /> with the code.
              </p>
            )}
          </div>
        </div>
      )}

      <p>
        This page explains how to delete data held by {LEGAL.brand} and how to check the status of a deletion
        request made through Facebook.
      </p>

      <H2>If you connected WhatsApp to our platform through Facebook</H2>
      <p>
        We do not store your Facebook profile information or Facebook user ID. To remove our access, go to your
        Facebook account&apos;s <strong>Settings &amp; privacy → Settings → Apps and websites</strong>, find{" "}
        <strong>{LEGAL.brand}</strong>, and choose <strong>Remove</strong>. You can also remove our access from
        your Meta Business portfolio settings. When you remove the app and ask for your data to be deleted, Meta
        notifies us and gives you a confirmation code you can check on this page.
      </p>
      <p>
        Removing the app stops our access to your WhatsApp Business Account but does not delete the business
        data already in our platform. To delete that too, send a request as described below.
      </p>

      <H2>If you are a business using our platform</H2>
      <p>
        Email <Email /> from your registered email address with the subject <strong>&quot;Data Deletion
        Request&quot;</strong>, and include your business name and the WhatsApp number connected to our platform.
        Once we have confirmed the request comes from your business, we will delete:
      </p>
      <List>
        <li>your business account and all staff logins;</li>
        <li>your WhatsApp connection details, including the stored access token;</li>
        <li>all conversations, messages, media, contacts and lead records;</li>
        <li>your knowledge base and AI settings.</li>
      </List>
      <p>
        Deletion is completed within 30 days of confirming your request, and we will email you when it is done.
        We may keep limited records where the law requires it, such as invoices.
      </p>

      <H2>If you messaged a business that uses our platform</H2>
      <p>
        We store your messages on behalf of that business, so please contact the business first. You can also
        email <Email /> with your WhatsApp number and the name of the business; we will pass your request to the
        business and help it delete your data.
      </p>

      <H2>Contact</H2>
      <ContactBlock />
    </LegalPage>
  );
}

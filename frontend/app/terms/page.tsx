import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";
import { ContactBlock, H2, LegalPage, List } from "@/components/LegalPage";

export const metadata: Metadata = { title: `Terms of Service | ${LEGAL.brand}` };

const policyLink = "text-indigo-600 underline hover:text-indigo-800";

export default function TermsOfServicePage() {
  return (
    <LegalPage title="Terms of Service" current="/terms">
      <p>
        These Terms of Service (&quot;Terms&quot;) are an agreement between {LEGAL.legalName} (&quot;{LEGAL.brand}&quot;,
        &quot;we&quot;, &quot;us&quot;) and the business that creates an account (&quot;you&quot;, the &quot;Business&quot;). By
        creating an account or using our platform (the &quot;Service&quot;), you agree to these Terms and our{" "}
        <Link href="/privacy" className={policyLink}>Privacy Policy</Link>. If you accept on behalf of a company,
        you confirm you are authorised to bind it.
      </p>

      <H2>1. The Service</H2>
      <p>
        The Service connects your WhatsApp Business number through Meta&apos;s WhatsApp Business Platform and
        provides an AI assistant that replies to your customers using the knowledge you provide, a dashboard to
        view and manage conversations, human handoff, staff assignment and related tools. Features may change
        over time.
      </p>

      <H2>2. Eligibility and accounts</H2>
      <List>
        <li>The Service is for businesses only. You must be at least 18 and able to enter a binding contract.</li>
        <li>Keep your login details confidential. You are responsible for everything done under your account,
          including by staff you add.</li>
        <li>Give us accurate information and keep it up to date.</li>
      </List>

      <H2>3. WhatsApp and Meta</H2>
      <List>
        <li>
          Your use of WhatsApp through the Service must comply with the{" "}
          <a href="https://www.whatsapp.com/legal/business-terms" target="_blank" rel="noopener noreferrer" className={policyLink}>WhatsApp Business Terms of Service</a>, the{" "}
          <a href="https://business.whatsapp.com/policy" target="_blank" rel="noopener noreferrer" className={policyLink}>WhatsApp Business Messaging Policy</a> and Meta&apos;s Commerce Policy.
        </li>
        <li>You must have your customers&apos; permission (opt-in) before messaging them, and honour requests to stop.</li>
        <li>Meta decides whether to approve your number, message templates and display name, and may restrict or
          disable your account. We are not responsible for Meta&apos;s decisions or for outages of Meta&apos;s services.</li>
        <li>Meta charges for WhatsApp conversations under its own pricing. Unless we agree otherwise in writing,
          these charges are billed to you by Meta and are separate from our fees.</li>
      </List>

      <H2>4. Your responsibilities and acceptable use</H2>
      <p>You are responsible for your customer communications and the content you upload. You must not use the Service to:</p>
      <List>
        <li>send spam, unsolicited bulk messages, or messages to people who have not opted in;</li>
        <li>break any law, including data protection, consumer protection and telecom marketing rules;</li>
        <li>sell or promote anything prohibited by Meta&apos;s Commerce Policy;</li>
        <li>infringe others&apos; rights, or upload malware or unlawful, harmful or misleading content;</li>
        <li>attempt to access other customers&apos; data, disrupt the Service, or reverse engineer it.</li>
      </List>
      <p>
        You are responsible for having a privacy notice for your own customers and a lawful basis for the
        personal data you process through the Service. We process that data on your behalf as described in our
        Privacy Policy.
      </p>

      <H2>5. AI-generated replies</H2>
      <p>
        Replies are generated automatically by AI from the information you provide and may be incomplete or
        inaccurate. You are responsible for the knowledge and instructions you give the assistant, for
        reviewing conversations, and for taking over when a customer needs a human. Do not rely on the
        assistant for legal, medical, financial or other professional advice to your customers.
      </p>

      <H2>6. Fees</H2>
      <p>
        Fees for the Service are as set out in your plan, quote or invoice. Unless stated otherwise, fees are
        payable in advance, are non-refundable, and exclude applicable taxes such as GST. We may suspend the
        Service if payment is overdue.
      </p>

      <H2>7. Your data and our property</H2>
      <p>
        You own your content and your customers&apos; data. You give us permission to use it only to provide,
        secure and support the Service. We own the Service, its software and branding; you may not copy or
        resell it without our written permission. If you send us feedback, we may use it freely.
      </p>

      <H2>8. Suspension and termination</H2>
      <p>
        You can stop using the Service and ask us to close your account at any time. We may suspend or end your
        access if you breach these Terms, if Meta requires it, or if continuing would expose us or others to
        legal risk. After termination we delete your data as described in our Privacy Policy and{" "}
        <Link href="/data-deletion" className={policyLink}>Data Deletion page</Link>.
      </p>

      <H2>9. Disclaimers</H2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available&quot;. To the extent permitted by law, we do not
        guarantee that it will be uninterrupted, error-free or that every message will be delivered, as it
        depends on Meta, our providers and the internet.
      </p>

      <H2>10. Limitation of liability</H2>
      <p>
        To the extent permitted by law, we are not liable for indirect, incidental, special or consequential
        losses, or for lost profits, revenue, data or goodwill. Our total liability for any claim relating to
        the Service is limited to the fees you paid us in the 12 months before the claim arose.
      </p>

      <H2>11. Indemnity</H2>
      <p>
        You will indemnify us against claims, fines and costs arising from your content, your messages to your
        customers, or your breach of these Terms, the law or Meta&apos;s policies.
      </p>

      <H2>12. Governing law</H2>
      <p>
        These Terms are governed by the laws of India. The courts at {LEGAL.jurisdictionCity}, India have
        exclusive jurisdiction over any dispute arising from them.
      </p>

      <H2>13. Changes</H2>
      <p>
        We may update these Terms. We will change the &quot;Last updated&quot; date and notify you of significant
        changes. Continuing to use the Service after changes take effect means you accept them.
      </p>

      <H2>14. Contact</H2>
      <ContactBlock />
    </LegalPage>
  );
}

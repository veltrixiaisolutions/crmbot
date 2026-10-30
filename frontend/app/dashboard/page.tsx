"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CopyButton } from "./_components/CopyButton";

type Tenant = {
  id: string;
  business_name: string;
  whatsapp_phone_number_id: string;
  system_prompt: string;
  escalation_contact: string | null;
};

export default function DashboardOverviewPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Tenant>("/tenants/me")
      .then(setTenant)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!tenant) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{tenant.business_name}</h1>
      <div className="rounded-lg border bg-white p-6 text-sm">
        <dl className="space-y-2">
          <div className="flex justify-between items-center">
            <dt className="text-gray-500">WhatsApp phone_number_id</dt>
            <dd className="flex items-center gap-1 font-mono text-xs">
              <span>{tenant.whatsapp_phone_number_id}</span>
              <CopyButton text={tenant.whatsapp_phone_number_id} title="Copy phone number ID" />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Escalation contact</dt>
            <dd>{tenant.escalation_contact || "Not set"}</dd>
          </div>
        </dl>
      </div>
      <p className="text-sm text-gray-500">
        Upload your business knowledge under <strong>Knowledge</strong>, then watch live conversations under{" "}
        <strong>Conversations</strong>.
      </p>
    </div>
  );
}

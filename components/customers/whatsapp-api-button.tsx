"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";

import { sendCustomerViaApi } from "@/lib/customers/actions";
import type { ApiMessageKind } from "@/lib/msg91/customer-send";

/** Sends the approved WhatsApp template from the store's number through MSG91. */
export function WhatsAppApiButton({ kind, label, mobile, storeId }: { kind: ApiMessageKind; label: string; mobile: string; storeId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-success px-3 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        disabled={pending || result?.ok === true}
        onClick={() => {
          setResult(null);
          start(async () => setResult(await sendCustomerViaApi(mobile, storeId, kind)));
        }}
        type="button"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        {result?.ok ? "Sent ✓" : label}
      </button>
      {result && !result.ok ? <span className="max-w-56 text-xs text-danger" role="status">{result.message}</span> : null}
    </span>
  );
}

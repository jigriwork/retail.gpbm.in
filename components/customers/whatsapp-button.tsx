"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageCircle } from "lucide-react";

import { prepareCustomerMessage } from "@/lib/customers/actions";
import type { MessageKind } from "@/lib/customers/messages";

/** Opens WhatsApp with the message ready. The tab is opened on the tap itself so pop-up blockers allow it. */
export function WhatsAppButton({ kind, label, mobile, storeId }: { kind: MessageKind; label: string; mobile: string; storeId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-semibold transition hover:border-success hover:text-success disabled:opacity-60"
        disabled={pending}
        onClick={() => {
          setMessage("");
          const tab = window.open("about:blank", "_blank");
          start(async () => {
            const result = await prepareCustomerMessage(mobile, storeId, kind);
            if (result.ok) {
              if (tab) tab.location.href = result.url;
              else window.location.href = result.url;
            } else {
              tab?.close();
              setMessage(result.message);
            }
          });
        }}
        type="button"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <MessageCircle className="size-3.5" />}
        {label}
      </button>
      {message ? <span className="max-w-56 text-xs text-danger" role="status">{message}</span> : null}
    </span>
  );
}

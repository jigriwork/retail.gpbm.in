"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, CircleOff, XCircle } from "lucide-react";

import {
  markPayslipFailed,
  markPayslipNotSent,
  markPayslipSent,
  markPayslipSkipped,
} from "@/lib/payslips/actions";

type SentStatusActionsProps = {
  generatedPayslipId: string;
  lastShareAttemptAt?: string | null;
  lastShareMethod?: string | null;
  sentAt?: string | null;
  sentMethod?: string | null;
  sentNote?: string | null;
  sentStatus?: string | null;
};

const statusConfig = {
  failed: {
    className: "border-danger/30 bg-danger/10 text-danger",
    icon: XCircle,
    label: "Failed",
  },
  not_sent: {
    className: "border-border bg-background text-muted",
    icon: Circle,
    label: "Not sent",
  },
  sent: {
    className: "border-success/30 bg-success/10 text-success",
    icon: CheckCircle2,
    label: "Sent",
  },
  skipped: {
    className: "border-border bg-background text-muted",
    icon: CircleOff,
    label: "Skipped",
  },
};

function formatDateTime(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function buttonClass(active: boolean) {
  return active
    ? "inline-flex h-9 items-center justify-center rounded-xl bg-foreground px-3 text-xs font-semibold text-background transition hover:bg-black/85 disabled:pointer-events-none disabled:opacity-50"
    : "inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-3 text-xs font-semibold transition hover:bg-black/[0.03] disabled:pointer-events-none disabled:opacity-50";
}

export function PayslipSentStatusActions({
  generatedPayslipId,
  lastShareAttemptAt,
  lastShareMethod,
  sentAt,
  sentMethod,
  sentNote,
  sentStatus,
}: SentStatusActionsProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const status = sentStatus && sentStatus in statusConfig ? sentStatus : "not_sent";
  const config = statusConfig[status as keyof typeof statusConfig];
  const Icon = config.icon;

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setMessage("");
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${config.className}`}>
        <Icon className="size-4" />
        {config.label}
      </div>
      <div className="space-y-1 text-xs leading-5 text-muted">
        {sentAt ? <p>Sent at {formatDateTime(sentAt)}</p> : null}
        {sentMethod ? <p>Sent method {sentMethod.replaceAll("_", " ")}</p> : null}
        {sentNote ? <p>Note {sentNote}</p> : null}
        {lastShareAttemptAt ? <p>Last attempt {formatDateTime(lastShareAttemptAt)}</p> : null}
        {lastShareMethod ? <p>Attempt method {lastShareMethod.replaceAll("_", " ")}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClass(status === "sent")}
          disabled={isPending}
          onClick={() => run(() => markPayslipSent(generatedPayslipId, "whatsapp_manual"))}
          type="button"
        >
          Mark Sent
        </button>
        <button
          className={buttonClass(status === "not_sent")}
          disabled={isPending}
          onClick={() => run(() => markPayslipNotSent(generatedPayslipId))}
          type="button"
        >
          Mark Not Sent
        </button>
        <button
          className={buttonClass(status === "failed")}
          disabled={isPending}
          onClick={() => run(() => markPayslipFailed(generatedPayslipId))}
          type="button"
        >
          Mark Failed
        </button>
        <button
          className={buttonClass(status === "skipped")}
          disabled={isPending}
          onClick={() => run(() => markPayslipSkipped(generatedPayslipId))}
          type="button"
        >
          Mark Skipped
        </button>
      </div>
      {message ? <p className="text-xs font-medium text-muted">{message}</p> : null}
    </div>
  );
}

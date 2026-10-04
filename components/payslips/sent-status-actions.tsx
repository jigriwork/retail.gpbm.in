"use client";

import { CheckCircle2, Circle, CircleOff, XCircle } from "lucide-react";

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

function formatMethod(value?: string | null) {
  if (value === "msg91_api") return "MSG91 API";
  if (value === "whatsapp_text") return "WhatsApp Text";
  if (value === "whatsapp_pdf_share") return "WhatsApp PDF Share";
  if (value === "copy_message") return "Copy Message";
  if (value === "whatsapp_manual") return "WhatsApp Manual";
  if (value === "download_only") return "Download Only";
  if (!value) return "";
  return value.replaceAll("_", " ");
}

export function PayslipSentStatusActions({
  lastShareAttemptAt,
  lastShareMethod,
  sentAt,
  sentMethod,
  sentNote,
  sentStatus,
}: SentStatusActionsProps) {
  const status = sentStatus && sentStatus in statusConfig ? sentStatus : "not_sent";
  const config = statusConfig[status as keyof typeof statusConfig];
  const Icon = config.icon;

  return (
    <div className="space-y-2">
      <div className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${config.className}`}>
        <Icon className="size-4" />
        {config.label}
      </div>
      <div className="space-y-1 text-xs leading-5 text-muted">
        {sentAt ? <p>Sent at {formatDateTime(sentAt)}</p> : null}
        {sentMethod ? <p>Sent method {formatMethod(sentMethod)}</p> : null}
        {sentNote ? <p>Note {sentNote}</p> : null}
        {lastShareAttemptAt ? <p>Last attempt {formatDateTime(lastShareAttemptAt)}</p> : null}
        {lastShareMethod ? <p>Attempt method {formatMethod(lastShareMethod)}</p> : null}
        <p>Delivery status is recorded automatically by the MSG91 API send.</p>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Send } from "lucide-react";

import { sendPayslip } from "@/lib/payslips/actions";

type ShareProps = {
  absAmount?: number | null;
  absDays?: number | null;
  advance?: number | null;
  commission?: number | null;
  downloadUrl: string;
  fileName: string;
  firmName?: string | null;
  generatedPayslipId?: string;
  netPayable?: number | null;
  salaryAmount?: number | null;
  salaryMonth: string;
  staffName: string;
  dividedByDays?: number | null;
  sundayPay?: number | null;
  storeName: string;
  sundayPayAmount?: number | null;
  sundayPresent?: number | null;
  whatsappPhone?: string | null;
};

function actionClass(primary = false) {
  return primary
    ? "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-white transition hover:bg-primary-deep disabled:pointer-events-none disabled:opacity-50"
    : "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold transition hover:bg-black/[0.03] disabled:pointer-events-none disabled:opacity-50";
}

export function PayslipWhatsAppActions({
  downloadUrl,
  generatedPayslipId,
  staffName,
  storeName,
  whatsappPhone,
}: ShareProps) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"danger" | "success" | "muted">("muted");
  const [pending, startTransition] = useTransition();

  function showStatus(messageText: string, tone: "danger" | "success" | "muted" = "muted") {
    setStatus(messageText);
    setStatusTone(tone);
  }

  function sendThroughApi() {
    if (!generatedPayslipId || pending) return;
    if (!window.confirm(`Send ${staffName}'s payslip through the ${storeName} MSG91 WhatsApp number?`)) return;
    setStatus("");
    startTransition(async () => {
      const result = await sendPayslip(generatedPayslipId);
      showStatus(result.message, result.ok ? "success" : "danger");
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        {whatsappPhone ? (
          <button className={actionClass(true)} disabled={pending || !generatedPayslipId} onClick={sendThroughApi} type="button">
            <Send className="size-4" />
            {pending ? "Sending through MSG91…" : "Send payslip via API"}
          </button>
        ) : (
          <span className="inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-xs font-semibold text-muted">
            Phone missing. Add phone number once; future payslips will auto-fill it.
          </span>
        )}
        <a className={actionClass()} href={downloadUrl}>
          <Download className="size-4" />
          Download PDF
        </a>
      </div>
      <p className="text-xs leading-5 text-muted">
        Sends the PDF through the configured MSG91 API only. A 10-digit Indian number is automatically prefixed with 91.
      </p>
      {status ? (
        <p
          className={`text-xs font-semibold ${
            statusTone === "danger" ? "text-danger" : statusTone === "success" ? "text-success" : "text-muted"
          }`}
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}

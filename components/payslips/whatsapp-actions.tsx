"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, ExternalLink, MessageCircle, Send, Share2 } from "lucide-react";

import { markPayslipSent, recordPayslipShareAttempt } from "@/lib/payslips/actions";
import { payslipWhatsAppMessage, professionalSalaryWhatsAppMessage, whatsAppLink } from "@/lib/payslips/whatsapp";

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
    ? "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-3 text-xs font-semibold text-background transition hover:bg-black/85 disabled:pointer-events-none disabled:opacity-50"
    : "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold transition hover:bg-black/[0.03] disabled:pointer-events-none disabled:opacity-50";
}

export function PayslipWhatsAppActions({
  absAmount,
  absDays,
  advance,
  commission,
  downloadUrl,
  fileName,
  firmName,
  generatedPayslipId,
  netPayable,
  salaryAmount,
  salaryMonth,
  staffName,
  dividedByDays,
  sundayPay,
  storeName,
  sundayPayAmount,
  sundayPresent,
  whatsappPhone,
}: ShareProps) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"danger" | "success" | "muted">("muted");
  const [isSharing, setIsSharing] = useState(false);
  const message = payslipWhatsAppMessage({ salaryMonth, staffName, storeName });
  const salaryMessage = professionalSalaryWhatsAppMessage({
    absAmount,
    absDays,
    advance,
    commission,
    dividedByDays,
    firmName,
    netPayable,
    salaryAmount,
    salaryMonth,
    staffName,
    storeName,
    sundayPay,
    sundayPayAmount,
    sundayPresent,
  });
  const chatUrl = whatsappPhone ? whatsAppLink(whatsappPhone, message) : "";
  const salaryChatUrl = whatsappPhone ? whatsAppLink(whatsappPhone, salaryMessage) : "";

  function showStatus(messageText: string, tone: "danger" | "success" | "muted" = "muted") {
    setStatus(messageText);
    setStatusTone(tone);
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(salaryMessage);
      if (generatedPayslipId) {
        void recordPayslipShareAttempt(generatedPayslipId, "copy_message").then(() => router.refresh());
      }
      showStatus("Salary message copied.", "success");
    } catch {
      showStatus("Could not copy salary message.", "danger");
    }
  }

  function recordTextAttempt() {
    if (!generatedPayslipId) return;
    void recordPayslipShareAttempt(generatedPayslipId, "whatsapp_text").then(() => router.refresh());
    showStatus("WhatsApp text attempt recorded. Mark as sent after sending.", "muted");
  }

  async function markSentAfterShare(method: string) {
    if (!generatedPayslipId) return;
    const result = await markPayslipSent(generatedPayslipId, method);
    showStatus(result.message, result.ok ? "success" : "danger");
    if (result.ok) router.refresh();
  }

  async function sharePdf() {
    setIsSharing(true);
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          showStatus("PDF could not be fetched. Refresh the page and try again.", "danger");
        } else if (response.status === 404) {
          showStatus("PDF could not be fetched. Generate the payslip again and try sharing.", "danger");
        } else {
          showStatus("PDF could not be fetched. Download the PDF and share it manually on WhatsApp.", "danger");
        }
        return;
      }

      const blob = await response.blob();
      if (!blob.size) {
        showStatus("PDF could not be fetched. Download the PDF and share it manually on WhatsApp.", "danger");
        return;
      }

      const file = new File([blob], fileName, { type: "application/pdf" });
      const sharePayload = { files: [file], title: `${storeName} Salary Slip`, text: message };
      const navigatorWithShare = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };

      if (typeof navigator.share !== "function" || !navigatorWithShare.canShare?.(sharePayload)) {
        showStatus(
          "This browser does not support direct PDF sharing. Download the PDF and share it manually on WhatsApp.",
          "danger",
        );
        return;
      }

      if (generatedPayslipId) {
        void recordPayslipShareAttempt(generatedPayslipId, "whatsapp_pdf_share").then(() => router.refresh());
      }
      await navigator.share(sharePayload);
      showStatus("Share sheet opened. Mark as sent after sharing.", "success");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        showStatus("Share cancelled.", "muted");
        return;
      }

      showStatus("PDF could not be shared. Download the PDF and share it manually on WhatsApp.", "danger");
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        {salaryChatUrl ? (
          <a
            aria-label="Send WhatsApp salary text without PDF attachment"
            className={actionClass(true)}
            href={salaryChatUrl}
            onClick={recordTextAttempt}
            rel="noreferrer"
            target="_blank"
          >
            <Send className="size-4" />
            Send WhatsApp Text
          </a>
        ) : (
          <span className="inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-xs font-semibold text-muted">
            Phone missing. Add phone number once; future payslips will auto-fill it.
          </span>
        )}
        <button className={actionClass(true)} disabled={isSharing} onClick={sharePdf} type="button">
          <Share2 className="size-4" />
          {isSharing ? "Preparing PDF" : "Share PDF"}
        </button>
        <a className={actionClass()} href={downloadUrl}>
          <Download className="size-4" />
          Download PDF
        </a>
        <button className={actionClass()} onClick={copyMessage} type="button">
          <Copy className="size-4" />
          Copy Message
        </button>
        {chatUrl ? (
          <a
            aria-label="Open WhatsApp chat with message text only"
            className={actionClass()}
            href={chatUrl}
            rel="noreferrer"
            target="_blank"
          >
            <MessageCircle className="size-4" />
            Open WhatsApp
          </a>
        ) : null}
        <a className={actionClass()} href="https://web.whatsapp.com/" rel="noreferrer" target="_blank">
          <ExternalLink className="size-4" />
          Open WhatsApp Web
        </a>
      </div>
      <p className="text-xs leading-5 text-muted">
        PDF attachment works only through mobile share sheet on supported browsers. WhatsApp chat link sends message text only.
      </p>
      {chatUrl ? (
        <p className="text-xs leading-5 text-muted">
          Desktop: Download PDF, copy message, open WhatsApp, attach PDF manually and send.
        </p>
      ) : null}
      {generatedPayslipId ? (
        <div className="flex flex-wrap gap-2">
          <button className={actionClass()} onClick={() => markSentAfterShare("whatsapp_text")} type="button">
            Mark as Sent after sending
          </button>
          <button className={actionClass()} onClick={() => markSentAfterShare("whatsapp_pdf_share")} type="button">
            Mark as Sent after sharing
          </button>
        </div>
      ) : null}
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

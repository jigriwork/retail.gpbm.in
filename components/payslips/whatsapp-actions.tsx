"use client";

import { useState } from "react";
import { Copy, Download, ExternalLink, MessageCircle, Share2 } from "lucide-react";

import { payslipWhatsAppMessage, whatsAppLink } from "@/lib/payslips/whatsapp";

type ShareProps = {
  downloadUrl: string;
  fileName: string;
  salaryMonth: string;
  staffName: string;
  storeName: string;
  whatsappPhone?: string | null;
};

function actionClass(primary = false) {
  return primary
    ? "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-3 text-xs font-semibold text-background transition hover:bg-black/85 disabled:pointer-events-none disabled:opacity-50"
    : "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold transition hover:bg-black/[0.03] disabled:pointer-events-none disabled:opacity-50";
}

export function PayslipWhatsAppActions({
  downloadUrl,
  fileName,
  salaryMonth,
  staffName,
  storeName,
  whatsappPhone,
}: ShareProps) {
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"danger" | "success" | "muted">("muted");
  const [isSharing, setIsSharing] = useState(false);
  const message = payslipWhatsAppMessage({ salaryMonth, staffName, storeName });
  const chatUrl = whatsappPhone ? whatsAppLink(whatsappPhone, message) : "";

  function showStatus(messageText: string, tone: "danger" | "success" | "muted" = "muted") {
    setStatus(messageText);
    setStatusTone(tone);
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      showStatus("Message copied.", "success");
    } catch {
      showStatus("Could not copy message.", "danger");
    }
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

      await navigator.share(sharePayload);
      showStatus("Share sheet opened.", "success");
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
        <a className={actionClass()} href={downloadUrl}>
          <Download className="size-4" />
          Download PDF
        </a>
        <button className={actionClass(true)} disabled={isSharing} onClick={sharePdf} type="button">
          <Share2 className="size-4" />
          {isSharing ? "Preparing PDF" : "Share PDF"}
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
        ) : (
          <span className="inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-xs font-semibold text-muted">
            Employee phone number is missing. Add phone number to open WhatsApp.
          </span>
        )}
        <button className={actionClass()} onClick={copyMessage} type="button">
          <Copy className="size-4" />
          Copy Message
        </button>
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

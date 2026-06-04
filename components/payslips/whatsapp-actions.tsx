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
  const message = payslipWhatsAppMessage({ salaryMonth, staffName, storeName });
  const chatUrl = whatsappPhone ? whatsAppLink(whatsappPhone, message) : "";

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setStatus("Message copied");
    } catch {
      setStatus("Could not copy message.");
    }
  }

  async function sharePdf() {
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        setStatus("PDF is not ready to share.");
        return;
      }

      const blob = await response.blob();
      const file = new File([blob], fileName, { type: "application/pdf" });
      const sharePayload = { files: [file], title: `${storeName} Salary Slip`, text: message };
      const navigatorWithShare = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };

      if (navigatorWithShare.canShare?.(sharePayload)) {
        await navigator.share(sharePayload);
        setStatus("Share sheet opened.");
        return;
      }

      setStatus("Your browser does not support direct PDF sharing. Download the PDF and share it manually on WhatsApp.");
    } catch {
      setStatus("Your browser does not support direct PDF sharing. Download the PDF and share it manually on WhatsApp.");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <a className={actionClass()} href={downloadUrl}>
          <Download className="size-4" />
          Download PDF
        </a>
        <button className={actionClass(true)} onClick={sharePdf} type="button">
          <Share2 className="size-4" />
          Share PDF
        </button>
        {chatUrl ? (
          <a className={actionClass()} href={chatUrl} rel="noreferrer" target="_blank">
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
        Desktop: Download PDF, copy message, open WhatsApp, attach PDF manually and send.
      </p>
      {chatUrl ? (
        <p className="text-xs leading-5 text-muted">
          WhatsApp will open with the message. Attach the downloaded PDF manually if it is not already attached.
        </p>
      ) : null}
      {status ? <p className="text-xs font-semibold text-success">{status}</p> : null}
    </div>
  );
}

"use client";

import { Copy, Download, MessageCircle, Printer } from "lucide-react";
import { useMemo, useState } from "react";

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function BusinessReportActions({
  csv,
  fileName,
  summary,
}: {
  csv: string;
  fileName: string;
  summary: string;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const whatsappUrl = useMemo(() => `https://wa.me/?text=${encodeURIComponent(summary)}`, [summary]);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy unavailable");
    }
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
        onClick={copySummary}
        type="button"
      >
        <Copy className="size-4" />
        Copy Summary
      </button>
      <a
        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
        href={whatsappUrl}
        rel="noreferrer"
        target="_blank"
      >
        <MessageCircle className="size-4" />
        Share on WhatsApp
      </a>
      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
        onClick={() => window.print()}
        type="button"
      >
        <Printer className="size-4" />
        Print
      </button>
      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
        onClick={() => downloadTextFile(fileName, csv)}
        type="button"
      >
        <Download className="size-4" />
        Download CSV
      </button>
      {copyStatus ? <span className="inline-flex h-11 items-center text-sm font-semibold text-muted">{copyStatus}</span> : null}
    </div>
  );
}


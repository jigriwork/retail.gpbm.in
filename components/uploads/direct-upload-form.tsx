"use client";
import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";
import { transferDirect, type UploadProgress } from "@/lib/uploads/browser";
import type { UploadKind } from "@/lib/uploads/validation";
export function DirectUploadForm({ action, kind, children, className, result, processing }: { action: (data: FormData) => void; kind: UploadKind; children: ReactNode; className?: string; result?: { ok: boolean; message: string }; processing?: boolean }) {
  const busy = useRef(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [processingSeconds, setProcessingSeconds] = useState(0);
  useEffect(() => {
    if (!processing) return;
    const started = Date.now();
    const timer = setInterval(() => setProcessingSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [processing]);
  async function submit(data: FormData) {
    if (busy.current || processing) return;
    busy.current = true; setUploading(true); setError(""); setProcessingSeconds(0);
    try {
      if (progress?.intentId && ![...data.values()].some(value => value instanceof File && value.size > 0)) data.set("uploadIntentId", progress.intentId);
      const metadata = await transferDirect(data, kind, setProgress);
      startTransition(() => action(metadata));
    }
    catch (error) { setError(error instanceof Error ? error.message : "Upload failed. Retry the same file."); }
    finally { busy.current = false; setUploading(false); }
  }
  return <form action={submit} className={className} onChange={event => {
    if (event.target instanceof HTMLInputElement && event.target.type === "file") {
      const file = event.target.files?.[0]; setSelected(file ? `${file.name} — ${(file.size / 1048576).toFixed(2)} MiB` : ""); setError(""); setProgress(null);
    }
  }}>
    {selected ? <p className="text-sm">{selected}</p> : null}
    <fieldset disabled={uploading || processing} className="contents">{children}</fieldset>
    {progress ? <div role="status" className="space-y-2 text-sm"><progress aria-label={processing ? "Processing workbook" : "Uploading workbook"} className="w-full" value={processing ? undefined : progress.percent} max={100} /><p>{processing ? `File uploaded. Validating and saving all rows… ${processingSeconds}s elapsed. Keep this page open; the report appears only after every row is saved.` : `${progress.percent}% — ${uploading ? progress.message : result?.message || progress.message}`}</p></div> : null}
    {error ? <div role="alert" className="text-sm text-danger"><p>{error}</p><button type="submit" className="mt-2 underline">Retry safely</button></div> : null}
    <p className="text-xs text-muted">Files go directly to private Storage. After a refresh, reselect the same file to resume. Originals are retained if processing fails.</p>
  </form>;
}

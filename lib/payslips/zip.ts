import "server-only";
import JSZip from "jszip";

type Pdf = { id: string; pdf_file_name: string | null; pdf_file_path: string | null };
export async function buildPayslipZip(items: Pdf[], download: (path: string, signal: AbortSignal) => Promise<{ data: Blob | null; error: unknown }>) {
  if (!items.length || items.length > 1000) throw new Error("ZIP requires 1–1,000 current PDFs.");
  const deadline = Date.now() + 90000;
  const zip = new JSZip(); const failures: string[] = []; let offset = 0, total = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (offset < items.length) {
      const item = items[offset++];
      try {
        if (Date.now() >= deadline || total >= 100 * 1024 * 1024 || !item.pdf_file_path) throw new Error("Missing path");
        const result = await download(item.pdf_file_path, AbortSignal.timeout(15000));
        if (result.error || !result.data || !result.data.size || result.data.size > 5 * 1024 * 1024) throw new Error("PDF unavailable");
        total += result.data.size;
        if (total > 100 * 1024 * 1024) throw new Error("ZIP too large");
        const bytes = await result.data.arrayBuffer();
        const label = (item.pdf_file_name ?? "payslip.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
        zip.file(`${item.id}_${label}`, bytes);
      } catch { failures.push(item.id); }
    }
  }));
  if (failures.length) return { ok: false as const, failures };
  return { ok: true as const, bytes: await zip.generateAsync({ type: "uint8array", compression: "STORE" }) };
}

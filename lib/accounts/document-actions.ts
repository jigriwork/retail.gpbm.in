"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getFinanceSession } from "@/lib/accounts/access";
import { documentKinds, isoDateOrNull } from "@/lib/accounts/format";
import { createClient } from "@/lib/supabase/server";

export type DocumentReservation =
  | { ok: true; id: string; path: string }
  | { ok: false; message: string; duplicateId?: string };

const allowedMime = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv", "application/json",
]);

function clean(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

/**
 * Step 1: the browser sends only metadata and the file's SHA-256. The
 * database decides whether this person may submit it and returns the one
 * path the browser is allowed to upload to.
 */
export async function reserveFinanceDocument(input: {
  kind: string; storeId: string; firmId: string; partyId: string; fileName: string; mime: string; size: number;
  sha256: string; title: string; docNo: string; docDate: string;
}): Promise<DocumentReservation> {
  const session = await getFinanceSession();
  if (!session.canSubmitDocuments) return { ok: false, message: "You cannot submit accounts documents." };
  if (!documentKinds.some((kind) => kind.value === input.kind)) return { ok: false, message: "Choose what kind of document this is." };
  if (!allowedMime.has(input.mime)) return { ok: false, message: "Upload a PDF, photo (JPG, PNG, WebP), Excel or CSV file, or the GST portal JSON for GST returns." };
  if (!Number.isInteger(input.size) || input.size < 1 || input.size > 20 * 1024 * 1024) return { ok: false, message: "Files must be 20 MB or smaller." };
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) return { ok: false, message: "The file could not be read. Choose it again." };
  const docDate = clean(input.docDate) ? isoDateOrNull(clean(input.docDate)) : null;
  if (clean(input.docDate) && !docDate) return { ok: false, message: "Check the document date." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reserve_finance_document", {
    p_doc_date: docDate,
    p_doc_no: clean(input.docNo, 80) || null,
    p_file_name: clean(input.fileName, 180),
    p_firm: clean(input.firmId) || null,
    p_kind: input.kind,
    p_mime: input.mime,
    p_party: clean(input.partyId) || null,
    p_sha256: input.sha256,
    p_size: input.size,
    p_store: clean(input.storeId) || null,
    p_title: clean(input.title) || null,
  });
  if (error || !data) return { ok: false, message: error?.message?.replace(/^.*?: /, "") || "The document could not be reserved." };
  const result = data as { duplicate: boolean; id: string; path?: string; title?: string };
  if (result.duplicate) return { ok: false, duplicateId: result.id, message: `This exact file is already stored (“${result.title ?? "document"}”). It was not added twice.` };
  return { ok: true, id: result.id, path: result.path ?? "" };
}

const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  "application/pdf": (b) => Buffer.from(b.slice(0, 5)).toString() === "%PDF-",
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => Buffer.from(b.slice(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  "image/webp": (b) => Buffer.from(b.slice(0, 4)).toString() === "RIFF" && Buffer.from(b.slice(8, 12)).toString() === "WEBP",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (b) => b[0] === 0x50 && b[1] === 0x4b,
  "application/vnd.ms-excel": (b) => (b[0] === 0xd0 && b[1] === 0xcf) || b[0] === 0x50 || b[0] === 0x3c,
  "text/csv": (b) => !b.slice(0, 4096).includes(0),
  // GST portal JSON: text starting with { (after an optional byte-order mark and spaces).
  "application/json": (b) => !b.slice(0, 4096).includes(0) && /^\uFEFF?\s*\{/.test(Buffer.from(b.slice(0, 64)).toString("utf8")),
};

/** Step 2: after the browser upload, check the stored bytes before accepting. */
export async function finalizeFinanceDocument(id: string): Promise<{ ok: boolean; message: string }> {
  await getFinanceSession();
  const supabase = await createClient();
  const { data: document } = await supabase
    .from("finance_documents")
    .select("id,file_path,mime_type,byte_size,sha256,status")
    .eq("id", id)
    .maybeSingle();
  if (!document) return { ok: false, message: "Document not found." };
  if (document.status !== "reserved") return { ok: true, message: "Document saved." };
  const { data: blob, error } = await supabase.storage.from("finance-docs").download(document.file_path, {}, { signal: AbortSignal.timeout(30000) });
  if (error || !blob) return { ok: false, message: "The upload did not finish. Choose the file again." };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength !== document.byte_size || createHash("sha256").update(bytes).digest("hex") !== document.sha256) {
    return { ok: false, message: "The stored file does not match the one you chose. Upload it again." };
  }
  if (!signatures[document.mime_type]?.(bytes)) return { ok: false, message: "The file content does not match its type." };
  const { data, error: finalizeError } = await supabase.rpc("finalize_finance_document", { p_id: id });
  if (finalizeError) return { ok: false, message: finalizeError.message };
  if ((data as { duplicate?: boolean } | null)?.duplicate) return { ok: false, message: "This exact file was stored a moment ago. It was not added twice." };
  revalidatePath("/app/accounts/documents");
  revalidatePath("/app/accounts");
  return { ok: true, message: "Document saved. The original file is kept and cannot be deleted." };
}

export type ReviewState = { ok: boolean; message: string };

export async function reviewFinanceDocument(_state: ReviewState, formData: FormData): Promise<ReviewState> {
  const session = await getFinanceSession();
  if (!session.can.post) return { ok: false, message: "You cannot review accounts documents." };
  const amountText = clean(formData.get("amount"), 20).replace(/[,₹\s]/g, "");
  const amount = amountText ? Number(amountText) : null;
  if (amount !== null && !Number.isFinite(amount)) return { ok: false, message: "Amount must be a number." };
  const docDateText = clean(formData.get("docDate"));
  const docDate = docDateText ? isoDateOrNull(docDateText) : null;
  if (docDateText && !docDate) return { ok: false, message: "Check the document date." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_finance_document", {
    p_amount: amount,
    p_doc_date: docDate,
    p_doc_no: clean(formData.get("docNo"), 80) || null,
    p_firm: clean(formData.get("firmId")) || null,
    p_id: clean(formData.get("documentId")),
    p_kind: clean(formData.get("kind")),
    p_notes: clean(formData.get("notes"), 1000) || null,
    p_party: clean(formData.get("partyId")) || null,
    p_status: clean(formData.get("status")) || "reviewed",
    p_store: clean(formData.get("storeId")) || null,
    p_title: clean(formData.get("title")) || null,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/app/accounts/documents");
  return { ok: true, message: "Document details saved. The change is kept in its history." };
}

/** A short-lived link to view the original file (access checked by storage policy). */
export async function financeDocumentLink(id: string): Promise<{ ok: boolean; url?: string; message?: string }> {
  await getFinanceSession();
  const supabase = await createClient();
  const { data: document } = await supabase.from("finance_documents").select("file_path,status").eq("id", id).maybeSingle();
  if (!document || document.status === "reserved") return { ok: false, message: "Document not available." };
  const { data, error } = await supabase.storage.from("finance-docs").createSignedUrl(document.file_path, 120);
  if (error || !data) return { ok: false, message: "Could not open the document." };
  return { ok: true, url: data.signedUrl };
}

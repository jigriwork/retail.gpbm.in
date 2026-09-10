import "server-only";
import { createHash } from "node:crypto";
import { canAccessStore, getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { metadataOnly, validateUpload, type UploadKind, type UploadMetadata } from "@/lib/uploads/validation";
import type { Json } from "@/lib/supabase/database.types";

type Result = { ok: boolean; message: string; [key: string]: unknown };
type Intent = { id: string; actor_id: string; store_id: string; kind: UploadKind; bucket: string; file_path: string; file_name: string; mime_type: string; byte_size: number; fingerprint: string; status: string; lease_id: string; expires_at: string; result: Result | null };
let activeProcessing = 0;
const verifiedFiles = new WeakMap<File, Intent>();
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
function admin() { const client = createAdminClient(); if (!client) throw new Error("Upload processing is unavailable."); return client; }
export async function authorizeUpload(kind: UploadKind, form: FormData) {
  metadataOnly(form);
  const { profile } = await requireProfile();
  if (!profile || profile.is_active !== true || !["owner", "manager"].includes(profile.role)) throw new Error("An active signed-in account is required.");
  if (["payroll", "sales-bulk", "sales-replacement"].includes(kind) && profile.role !== "owner") throw new Error("This upload requires the owner.");
  let storeId = String(form.get("storeId") ?? form.get("fallbackStoreId") ?? "");
  const client = await createClient();
  if (kind === "manager-updates" && form.get("updateId")) {
    const { data, error } = await client.from("manager_updates").select("store_id").eq("id", String(form.get("updateId"))).single();
    if (error || !data?.store_id) throw new Error("Store update unavailable.");
    storeId = data.store_id;
  }
  if (kind === "sales-replacement") {
    const { data, error } = await client.from("reports").select("store_id,report_type").eq("id", String(form.get("reportId") ?? "")).single();
    if (error || !data?.store_id || data.report_type !== "sales") throw new Error("Replacement report unavailable.");
    storeId = data.store_id;
  }
  if (kind === "payroll" && !storeId) storeId = (await getAccessibleStores(profile)).find(store => store.code === "GP")?.id ?? "";
  if (!storeId || !(await canAccessStore(storeId, profile))) throw new Error("This store is not assigned and active.");
  return { profile, storeId, client };
}
export async function prepareUpload(kind: UploadKind, file: UploadMetadata, form: FormData) {
  const metadata = validateUpload(kind, file);
  const { client, storeId } = await authorizeUpload(kind, form);
  const { data, error } = await client.rpc("create_upload_intent", { p_store: storeId, p_kind: kind, p_name: metadata.name, p_mime: metadata.mime, p_size: metadata.size, p_hash: metadata.sha256 });
  if (error || !data) throw new Error("Upload could not be authorized. Check your store assignment and file details.");
  const intent = data as unknown as Intent;
  return { id: intent.id, bucket: intent.bucket, path: intent.file_path, mime: intent.mime_type, expiresAt: intent.expires_at, status: intent.status };
}
export function verifiedSource(file: File) {
  const intent = verifiedFiles.get(file);
  if (!intent) throw new Error("A verified direct upload is required.");
  return intent;
}
export async function bindUpload(file: File, runId: string, payroll = false) {
  const intent = verifiedSource(file);
  const { error } = await admin().rpc("bind_upload_import", { p_id: intent.id, p_lease: intent.lease_id, p_run: runId, p_payroll: payroll });
  if (error) throw new Error("The verified source could not be attached to this import.");
}
function compact<T extends Result>(result: T): T {
  if (Buffer.byteLength(JSON.stringify(result)) <= 60000) return result;
  const trimmed = { ...result, preview: undefined, summary: undefined, comparison: Array.isArray(result.comparison) ? result.comparison.slice(0, 10).map(item => ({ ...item, employees: item.employees?.slice(0, 20) })) : undefined,
    message: result.message + " Large details are available in the report/batch view; this confirmation shows a sample." };
  if (Buffer.byteLength(JSON.stringify(trimmed)) <= 60000) return trimmed;
  throw new Error("Result exceeds the safe response limit.");
}
export async function withDirectUpload<T extends Result>(form: FormData, kind: UploadKind, execute: (trusted: FormData) => Promise<T>): Promise<T> {
  let intent: Intent | undefined;
  let processingSlot = false;
  try {
    const { profile, storeId } = await authorizeUpload(kind, form);
    if (kind === "payroll" && form.get("importId")) return compact(await execute(form));
    const id = String(form.get("uploadIntentId") ?? "");
    if (!id) {
      if (["rack", "cleaning", "manager-updates"].includes(kind) || (kind === "payroll" && form.get("importId"))) return compact(await execute(form));
      throw new Error("Choose a file and finish its direct upload first.");
    }
    if (activeProcessing >= 2) throw new Error("Upload processor is busy. Your source is retained; retry shortly.");
    activeProcessing++; processingSlot = true;
    const metadata = [...form.entries()].filter(([key]) => !["uploadIntentId", "confirmation"].includes(key)).sort(([a], [b]) => a.localeCompare(b));
    const { data, error } = await admin().rpc("claim_upload_intent", { p_id: id, p_actor: profile.id, p_kind: kind, p_request_hash: hash(JSON.stringify(metadata)) });
    if (error || !data) throw new Error("Upload unavailable, expired, or already processing. Wait before retrying; select the same file to resume.");
    intent = data as unknown as Intent;
    if (intent.store_id !== storeId) throw new Error("Upload belongs to another store.");
    if (intent.status === "processed") return compact((intent.result ?? { ok: true, message: "This upload was already completed." }) as T);
    validateUpload(kind, { name: intent.file_name, mime: intent.mime_type, size: intent.byte_size, sha256: intent.fingerprint });
    // Download only the DB-selected private object, never a browser URL/path.
    const { data: blob, error: downloadError } = await (await createClient()).storage.from(intent.bucket).download(intent.file_path, {}, { signal: AbortSignal.timeout(30000) });
    if (downloadError || !blob || blob.size !== intent.byte_size || blob.type.split(";")[0] !== intent.mime_type) throw new Error("Uploaded file size or type does not match. Original retained.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (hash(bytes) !== intent.fingerprint) throw new Error("File fingerprint differs. Select the original file again.");
    if (intent.bucket === "review-photos") {
      const valid = intent.mime_type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : intent.mime_type === "image/png" ? Buffer.from(bytes.slice(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10])) : Buffer.from(bytes.slice(0,4)).toString() === "RIFF" && Buffer.from(bytes.slice(8,12)).toString() === "WEBP";
      if (!valid) throw new Error("Photo bytes do not match their file type.");
    }
    const verified = await admin().rpc("verify_upload_intent", { p_id: intent.id, p_lease: intent.lease_id, p_hash: intent.fingerprint });
    if (verified.error) throw new Error("Upload verification expired. Retry safely.");
    const file = new File([bytes], intent.file_name, { type: intent.mime_type });
    verifiedFiles.set(file, intent);
    const trusted = new FormData(); for (const [key, value] of form.entries()) trusted.set(key, value);
    trusted.set(intent.bucket === "review-photos" ? "photo" : "file", file);
    // FormData creates a new File object; associate the actual value used below.
    verifiedFiles.set(trusted.get(intent.bucket === "review-photos" ? "photo" : "file") as File, intent);
    const result = compact(await execute(trusted));
    await admin().rpc("finish_upload_intent", { p_id: intent.id, p_lease: intent.lease_id, p_ok: result.ok, p_result: result as Json });
    return result;
  } catch (error) {
    // Next redirects are control flow. Photo publication already consumes its
    // intent atomically before redirect, so it must never be marked failed here.
    if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
    const result = { ok: false, message: error instanceof Error ? error.message : "Upload processing failed. The original is retained; retry safely." };
    if (intent?.lease_id) await admin().rpc("finish_upload_intent", { p_id: intent.id, p_lease: intent.lease_id, p_ok: false, p_result: result });
    return result as T;
  } finally {
    if (processingSlot) activeProcessing--;
  }
}

export async function resumeUpload(id: string, kind: UploadKind, file: UploadMetadata, form: FormData) {
  const metadata = validateUpload(kind, file);
  const { client, storeId, profile } = await authorizeUpload(kind, form);
  const { data, error } = await client.from("upload_intents").select("*").eq("id", id).single();
  if (error || !data || data.actor_id !== profile.id || data.store_id !== storeId || data.kind !== kind || data.fingerprint !== metadata.sha256 || data.byte_size !== metadata.size || data.file_name !== metadata.name || data.mime_type !== metadata.mime || (data.status !== "processed" && new Date(data.expires_at).getTime() <= Date.now())) return null;
  return { id: data.id, bucket: data.bucket, path: data.file_path, mime: data.mime_type, expiresAt: data.expires_at, status: data.status };
}

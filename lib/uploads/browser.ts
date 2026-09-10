"use client";
import { Upload } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { createDirectUpload, resumeDirectUpload } from "@/lib/uploads/actions";
import { metadataOnly, validateUpload, type UploadKind } from "@/lib/uploads/validation";
export type UploadProgress = { percent: number; message: string; intentId?: string };
export async function transferDirect(form: FormData, kind: UploadKind, progress: (state: UploadProgress) => void) {
  const metadata = new FormData(); let file: File | undefined;
  for (const [key, value] of form.entries()) { if (value instanceof File) { if (value.size) { if (file) throw new Error("Choose one file per upload."); file = value; } } else metadata.append(key, value); }
  metadataOnly(metadata);
  if (!file) return metadata;
  // Size/type fail before hashing or any request. Hash is checked again server-side.
  validateUpload(kind, { name: file.name, size: file.size, mime: file.type, sha256: "0".repeat(64) });
  progress({ percent: 0, message: "Valid file size/type. Computing fingerprint…" });
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))).map(n => n.toString(16).padStart(2, "0")).join("");
  const details = { name: file.name, size: file.size, mime: file.type, sha256 };
  const client = createClient(); const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error("Sign in again before uploading.");
  const contextHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([...metadata.entries()].filter(([k]) => k !== "confirmation")))))).map(n => n.toString(16).padStart(2, "0")).join("");
  const key = `retail-upload:${session.user.id}:${kind}:${sha256}:${contextHash}`;
  const cached = localStorage.getItem(key);
  let intent = cached ? await resumeDirectUpload(cached, kind, details, metadata) : null;
  if (!intent) intent = await createDirectUpload(kind, details, metadata);
  localStorage.setItem(key, intent.id);
  metadata.set("uploadIntentId", intent.id);
  if (!["created", "uploading"].includes(intent.status)) {
    progress({ percent: 100, message: "Original upload retained. Retrying processing without uploading again.", intentId: intent.id });
    return metadata;
  }
  const started = await client.rpc("start_upload_intent", { p_id: intent.id });
  if (started.error) throw new Error("Upload expired or access changed. Select the file again to start a new attempt.");
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (url.hostname.endsWith(".supabase.co")) url.hostname = url.hostname.replace(".supabase.co", ".storage.supabase.co");
  url.pathname = "/storage/v1/upload/resumable";
  const approved = intent;
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file!, {
      endpoint: url.toString(), chunkSize: 6 * 1024 * 1024,
      uploadDataDuringCreation: true, removeFingerprintOnSuccess: true,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      // XHR appends repeated headers: authorization must be set only in the hook.
      headers: { "x-upsert": "false" },
      metadata: { bucketName: approved.bucket, objectName: approved.path, contentType: approved.mime, cacheControl: "3600" },
      fingerprint: async () => `retail:${session.user.id}:${approved.id}`,
      onBeforeRequest: async request => { const current = (await client.auth.getSession()).data.session; if (!current) throw new Error("Session expired. Sign in and reselect the same file to resume."); request.setHeader("authorization", `Bearer ${current.access_token}`); },
      onShouldRetry: () => { progress({ percent: 0, message: "Connection interrupted. Retrying resumable upload…", intentId: approved.id }); return true; },
      onProgress: (sent, total) => progress({ percent: Math.round(sent / total * 100), message: "Uploading directly to private Storage…", intentId: approved.id }),
      onError: () => reject(new Error("Upload interrupted. Keep or reselect the same file and press retry to resume. The original is retained.")),
      onSuccess: () => resolve(),
    });
    upload.findPreviousUploads().then(previous => { if (previous[0]) { upload.resumeFromPreviousUpload(previous[0]); progress({ percent: 0, message: "Resuming saved upload…", intentId: approved.id }); } upload.start(); }).catch(reject);
  });
  progress({ percent: 100, message: "Upload complete. Verifying and processing; do not submit again.", intentId: intent.id });
  return metadata;
}

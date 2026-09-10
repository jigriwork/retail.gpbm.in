"use server";
import { prepareUpload, resumeUpload } from "@/lib/uploads/server";
import type { UploadKind, UploadMetadata } from "@/lib/uploads/validation";
export async function createDirectUpload(kind: UploadKind, file: UploadMetadata, metadata: FormData) {
  return prepareUpload(kind, file, metadata);
}

export async function resumeDirectUpload(id: string, kind: UploadKind, file: UploadMetadata, metadata: FormData) {
  return resumeUpload(id, kind, file, metadata);
}

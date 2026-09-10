export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_ACTION_BYTES = 32 * 1024;
export const uploadKinds = ["sales", "sales-bulk", "sales-replacement", "stock", "salary-attendance", "payroll", "rack", "cleaning", "manager-updates"] as const;
export type UploadKind = typeof uploadKinds[number];
export type UploadMetadata = { name: string; size: number; mime: string; sha256: string };
const spreadsheetMimes: Record<string, string[]> = {
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  xls: ["application/vnd.ms-excel"], csv: ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"],
};
export function validateUpload(kind: UploadKind, input: UploadMetadata) {
  if (!uploadKinds.includes(kind) || !input.name || input.name.length > 180 || /[\x00-\x1f\x7f/\\]/.test(input.name)) throw new Error("Choose a file with a valid filename.");
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > MAX_UPLOAD_BYTES) throw new Error("Choose a nonempty file no larger than 15 MiB.");
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new Error("File fingerprint is invalid. Select the file again.");
  const extension = input.name.split(".").pop()?.toLowerCase() ?? "";
  const photo = ["rack", "cleaning", "manager-updates"].includes(kind);
  const mimes = photo ? ({ jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"], webp: ["image/webp"] } as Record<string, string[]>) : { ...spreadsheetMimes, ...(kind === "salary-attendance" ? { pdf: ["application/pdf"] } : {}) };
  if (!mimes[extension] || (input.mime && !mimes[extension].includes(input.mime))) throw new Error("File extension and type do not match. Use a supported spreadsheet, PDF or JPEG/PNG/WebP photo.");
  return { ...input, mime: input.mime || mimes[extension][0], extension, bucket: photo ? "review-photos" : kind === "payroll" ? "payslips" : "reports" };
}
export function metadataOnly(form: FormData) {
  let bytes = 0;
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string") throw new Error("Upload files directly to Storage before submitting.");
    bytes += new TextEncoder().encode(key + value).length;
  }
  if (bytes > MAX_ACTION_BYTES) throw new Error("Form metadata is too large. Shorten the notes and retry.");
}

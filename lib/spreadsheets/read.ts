import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
import type { WorkBook } from "xlsx";

export const spreadsheetLimits = {
  bytes: 15 * 1024 * 1024,
  heapMb: 512,
  timeoutMs: 60000,
} as const;

type WorkerResult = {
  ok: boolean;
  workbook?: WorkBook;
  error?: { code?: string; message?: string };
};

function rejection(code: string, detail: string) {
  return new Error(`Spreadsheet rejected [${code}]: ${detail}`);
}

export async function readSpreadsheet(file: File): Promise<WorkBook> {
  if (!file.size) throw rejection("EMPTY_FILE", "The spreadsheet file is empty.");
  if (file.size > spreadsheetLimits.bytes) {
    throw rejection("FILE_SIZE_LIMIT", "The spreadsheet exceeds the 15 MiB file-size limit.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    const worker = spawn(process.execPath, [`--max-old-space-size=${spreadsheetLimits.heapMb}`, path.join(process.cwd(), "lib/spreadsheets/worker.cjs")], {
      env: { TZ: Intl.DateTimeFormat().resolvedOptions().timeZone, NODE_ENV: "production" },
      serialization: "advanced", stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let settled = false;
    let stderr = "";
    worker.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 16384) stderr += chunk.toString("utf8", 0, 16384 - stderr.length);
    });
    const finish = (workbook?: WorkBook, error?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); worker.kill("SIGKILL");
      if (workbook) resolve(workbook); else reject(error ?? rejection("SPREADSHEET_INTERNAL_ERROR", "The spreadsheet parser stopped unexpectedly."));
    };
    const timer = setTimeout(
      () => finish(undefined, rejection("PARSER_TIMEOUT", `Spreadsheet parsing exceeded ${spreadsheetLimits.timeoutMs / 1000} seconds.`)),
      spreadsheetLimits.timeoutMs,
    );
    worker.once("error", () => finish(undefined, rejection("PARSER_START_FAILED", "The isolated spreadsheet parser could not start.")));
    worker.once("exit", () => finish(undefined, /heap out of memory/i.test(stderr)
      ? rejection("PARSER_MEMORY_LIMIT", `Spreadsheet parsing exceeded the isolated ${spreadsheetLimits.heapMb} MiB memory limit.`)
      : rejection("PARSER_EXITED", "The isolated spreadsheet parser stopped before returning a result.")));
    worker.once("message", (result: WorkerResult) => {
      if (result.ok && result.workbook) return finish(result.workbook);
      const code = /^[A-Z0-9_]{3,64}$/.test(result.error?.code ?? "") ? result.error!.code! : "SPREADSHEET_INTERNAL_ERROR";
      const detail = typeof result.error?.message === "string" && result.error.message.length <= 240
        ? result.error.message
        : "The spreadsheet parser encountered an internal error.";
      finish(undefined, rejection(code, detail));
    });
    worker.send!({ bytes, name: file.name, mime: file.type }, error => {
      if (error) finish(undefined, rejection("PARSER_TRANSFER_FAILED", "The spreadsheet could not be transferred to the isolated parser."));
    });
  });
}

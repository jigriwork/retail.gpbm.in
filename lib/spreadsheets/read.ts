import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
import type { WorkBook } from "xlsx";

export const spreadsheetLimits = { bytes: 15 * 1024 * 1024, timeoutMs: 15000 } as const;
const message = "Spreadsheet rejected: invalid format or security limits exceeded (15 MB, 100,000 rows, 16 sheets, 256 columns, 2 million cells, 8,192 characters per cell).";

export async function readSpreadsheet(file: File): Promise<WorkBook> {
  if (!file.size || file.size > spreadsheetLimits.bytes) throw new Error(message);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    const worker = spawn(process.execPath, ["--max-old-space-size=256", path.join(process.cwd(), "lib/spreadsheets/worker.cjs")], {
      env: { TZ: Intl.DateTimeFormat().resolvedOptions().timeZone, NODE_ENV: "production" },
      serialization: "advanced", stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let settled = false;
    const finish = (workbook?: WorkBook) => {
      if (settled) return;
      settled = true; clearTimeout(timer); worker.kill("SIGKILL");
      if (workbook) resolve(workbook); else reject(new Error(message));
    };
    const timer = setTimeout(() => finish(), spreadsheetLimits.timeoutMs);
    worker.once("error", () => finish());
    worker.once("exit", () => finish());
    worker.once("message", (result: { ok: boolean; workbook?: WorkBook }) => finish(result.ok ? result.workbook : undefined));
    worker.send!({ bytes, name: file.name, mime: file.type }, error => { if (error) finish(); });
  });
}

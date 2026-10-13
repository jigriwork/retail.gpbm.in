"use client";

import { useMemo, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { importCustomerRows, startCustomerImport } from "@/lib/customers/actions";

type Store = { id: string; name: string };
type Sheet = { headers: string[]; rows: string[][]; name: string };

const mobileLike = (value: string) => /^[6-9]\d{9}$/.test(value.replace(/\D/g, "").replace(/^(?:91|0)(?=[6-9]\d{9}$)/, ""));
const cell = (value: unknown) => (typeof value === "number" ? String(Math.round(value)) : String(value ?? "")).trim();

/** Picks the header row and the mobile / name columns, by header words or by the values. */
function detect(table: string[][]) {
  const headerIndex = table.slice(0, 10).findIndex((row) => row.some((value) => /mob|phone|contact|number|whats ?app|cell/i.test(value)));
  const header = headerIndex >= 0 ? table[headerIndex] : null;
  const body = table.slice(headerIndex >= 0 ? headerIndex + 1 : 0).filter((row) => row.some(Boolean));
  const width = Math.max(0, ...table.slice(0, 50).map((row) => row.length));
  const sample = body.slice(0, 300);
  const score = (column: number, test: (value: string) => boolean) => sample.filter((row) => test(row[column] ?? "")).length / Math.max(1, sample.length);
  const columns = Array.from({ length: width }, (_, index) => index);
  let mobile = header ? columns.find((index) => /mob|phone|contact|number|whats ?app|cell/i.test(header[index] ?? "")) ?? -1 : -1;
  if (mobile < 0 || score(mobile, mobileLike) < 0.3) mobile = columns.reduce((best, index) => (score(index, mobileLike) > score(best, mobileLike) ? index : best), 0);
  let name = header ? columns.find((index) => index !== mobile && /name/i.test(header[index] ?? "") && !/store|staff|brand|father/i.test(header[index] ?? "")) ?? -1 : -1;
  if (name < 0) {
    const wordy = (value: string) => /^[a-z][a-z .']{1,60}$/i.test(value);
    name = columns.filter((index) => index !== mobile).reduce((best, index) => (best < 0 || score(index, wordy) > score(best, wordy) ? index : best), -1);
  }
  const headers = columns.map((index) => (header?.[index] ? `${header[index]}` : `Column ${String.fromCharCode(65 + (index % 26))}`));
  return { body, headers, mobile, name };
}

export function CustomerUpload({ stores }: { stores: Store[] }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mobileColumn, setMobileColumn] = useState(-1);
  const [nameColumn, setNameColumn] = useState(-1);
  const [consent, setConsent] = useState(true);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const rows = useMemo(() => (sheet && mobileColumn >= 0
    ? sheet.rows.map((row) => ({ m: row[mobileColumn] ?? "", n: nameColumn >= 0 ? row[nameColumn] ?? "" : "" }))
    : []), [sheet, mobileColumn, nameColumn]);
  const validCount = useMemo(() => new Set(rows.filter((row) => mobileLike(row.m)).map((row) => row.m.replace(/\D/g, "").slice(-10))).size, [rows]);

  async function readFile(picked: File | null) {
    setFile(picked); setSheet(null); setStatus(null); setProgress(null);
    if (!picked) return;
    if (picked.size > 10 * 1024 * 1024) return setStatus({ ok: false, text: "The file is larger than 10 MB." });
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await picked.arrayBuffer(), { type: "array", sheetRows: 50001 });
      const tables = book.SheetNames.map((name) => ({
        name,
        table: (XLSX.utils.sheet_to_json(book.Sheets[name], { blankrows: false, defval: "", header: 1, raw: true }) as unknown[][]).map((row) => row.map(cell)),
      }));
      const best = tables.sort((a, b) => b.table.length - a.table.length)[0];
      if (!best || !best.table.length) return setStatus({ ok: false, text: "The file has no rows." });
      const found = detect(best.table);
      setSheet({ headers: found.headers, name: best.name, rows: found.body.slice(0, 50000) });
      setMobileColumn(found.mobile); setNameColumn(found.name);
    } catch {
      setStatus({ ok: false, text: "This file could not be read. Use Excel (.xlsx, .xls) or CSV." });
    }
  }

  async function upload() {
    if (!file || !rows.length || !storeId) return;
    setStatus(null); setProgress(0);
    const started = await startCustomerImport(storeId, file.name, consent);
    if (!started.ok) { setProgress(null); return setStatus({ ok: false, text: started.message }); }
    let added = 0; let valid = 0;
    for (let index = 0; index < rows.length; index += 1000) {
      const part = await importCustomerRows(started.batchId, rows.slice(index, index + 1000));
      if (!part.ok) { setProgress(null); return setStatus({ ok: false, text: `${part.message} (${index} rows were saved before this.)` }); }
      added += part.new; valid += part.valid;
      setProgress(Math.min(100, Math.round(((index + 1000) / rows.length) * 100)));
    }
    setProgress(null);
    setStatus({ ok: true, text: `Done: ${valid} valid numbers saved, ${added} new to this store, ${rows.length - valid} rows skipped (invalid or repeated).` });
  }

  const select = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {stores.length > 1 ? (
          <label className="block text-sm font-medium">Store
            <select className={`mt-1 ${select}`} onChange={(event) => setStoreId(event.target.value)} value={storeId}>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
        ) : <p className="text-sm">Store: <span className="font-semibold">{stores[0]?.name}</span></p>}
        <label className="block text-sm font-medium">Excel or CSV file
          <input accept=".xlsx,.xls,.csv" className="mt-1 block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2.5 file:font-semibold file:text-white" onChange={(event) => readFile(event.target.files?.[0] ?? null)} type="file" />
        </label>
      </div>

      {sheet ? (
        <div className="space-y-4 rounded-2xl border border-border bg-background p-4">
          <p className="text-sm">Sheet <span className="font-semibold">{sheet.name}</span>: {sheet.rows.length} rows, <span className="font-semibold">{validCount}</span> different valid mobile numbers.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">Mobile number column
              <select className={`mt-1 ${select}`} onChange={(event) => setMobileColumn(Number(event.target.value))} value={mobileColumn}>
                {sheet.headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">Name column
              <select className={`mt-1 ${select}`} onChange={(event) => setNameColumn(Number(event.target.value))} value={nameColumn}>
                <option value={-1}>No names</option>
                {sheet.headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
              </select>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-xs uppercase text-muted"><th className="py-1 pr-4">Name</th><th className="py-1">Mobile</th></tr></thead>
              <tbody>
                {rows.slice(0, 5).map((row, index) => (
                  <tr className="border-t border-border" key={index}>
                    <td className="py-1.5 pr-4">{row.n || "—"}</td>
                    <td className={`py-1.5 ${mobileLike(row.m) ? "" : "text-danger"}`}>{row.m || "—"}{mobileLike(row.m) ? "" : " (not valid)"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input checked={consent} className="mt-1" onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
            <span>These customers agreed to receive offers on WhatsApp (they gave their number to the store). Customers who asked us to stop are never changed.</span>
          </label>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white disabled:opacity-60"
            disabled={progress !== null || !validCount}
            onClick={upload}
            type="button"
          >
            {progress !== null ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {progress !== null ? `Saving… ${progress}%` : `Add ${validCount} numbers`}
          </button>
        </div>
      ) : null}
      {status ? <p className={`text-sm ${status.ok ? "text-success" : "text-danger"}`} role="status">{status.text}</p> : null}
    </div>
  );
}

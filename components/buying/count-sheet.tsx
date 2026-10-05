"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2 } from "lucide-react";

import { BarcodeScanner, unlockScanSound } from "@/components/app/barcode-scanner";
import { addExtraItem, recordCount } from "@/lib/buying/actions";

type Line = { id: string; lot_code: string | null; item_name: string | null; size: string | null; counted_qty: number | null; is_extra: boolean };
type ScanEntry = {
  code: string; key: number; kind: "added" | "adding" | "error" | "ok" | "skipped" | "undone" | "unknown";
  label: string; lineId?: string; total?: number;
};

/** Enter the counted quantity per item; each entry saves on its own. No expected figures are shown. */
export function CountSheet({ codes = [], countId, editable, expectedPieces = null, lines }: {
  /** Codes each line can be scanned by (lot code, EAN, article code). */
  codes?: Array<{ codes: string[]; line: string }>;
  countId?: string;
  editable: boolean;
  /** Expected pieces (owner and managers only; a cashier counts blind). */
  expectedPieces?: number | null;
  lines: Line[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((line) => [line.id, line.counted_qty === null ? "" : String(Number(line.counted_qty))])));
  const [state, setState] = useState<Record<string, "saving" | "saved" | string>>({});
  const [scanning, setScanning] = useState(false);
  // Latest first; "unknown" entries wait for Add as extra / Skip.
  const [scanLog, setScanLog] = useState<ScanEntry[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const sequence = useRef(0);
  // Latest counts for rapid scans (state updates are not immediate).
  const current = useRef(values);
  useEffect(() => { current.current = values; }, [values]);
  const lineByCode = useMemo(() => {
    const map = new Map<string, Line>();
    const byId = new Map(lines.map((line) => [line.id, line]));
    for (const entry of codes) for (const code of entry.codes) { const line = byId.get(entry.line); if (line && !map.has(code)) map.set(code, line); }
    for (const line of lines) if (line.lot_code && !map.has(line.lot_code.toUpperCase())) map.set(line.lot_code.toUpperCase(), line);
    return map;
  }, [codes, lines]);

  const log = (entry: Omit<ScanEntry, "key">) => setScanLog((list) => [{ ...entry, key: ++sequence.current }, ...list].slice(0, 8));
  const update = (key: number, patch: Partial<ScanEntry>) => setScanLog((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  // Sets a line's count and saves it; returns the saved number or an error.
  const setCount = useCallback(async (line: Line, next: number) => {
    current.current = { ...current.current, [line.id]: String(next) };
    setValues((v) => ({ ...v, [line.id]: String(next) }));
    setState((s) => ({ ...s, [line.id]: "saving" }));
    // A connection problem is reported on the line, never as an error page.
    const result = await recordCount(line.id, next).catch(() => ({ ok: false, message: "Connection problem: not saved. Scan again." }));
    setState((s) => ({ ...s, [line.id]: result.ok ? "saved" : result.message }));
    return result;
  }, []);

  const onScan = useCallback((raw: string) => {
    const code = raw.trim().toUpperCase();
    const line = lineByCode.get(code);
    if (!line) {
      log({ code, kind: "unknown", label: code });
      return false;
    }
    const stored = current.current[line.id];
    const before = stored !== undefined && stored !== "" ? Number(stored) : Number(line.counted_qty ?? 0);
    const next = before + 1;
    const label = `${line.item_name ?? "Item"}${line.size ? ` · ${line.size}` : ""}`;
    setSessionCount((n) => n + 1);
    const key = sequence.current + 1;
    log({ code, kind: "ok", label, lineId: line.id, total: next });
    void setCount(line, next).then((result) => { if (!result.ok) update(key, { kind: "error", label: `${label}: ${result.message}` }); });
    return true;
  }, [lineByCode, setCount]);

  async function undo(entry: ScanEntry) {
    const line = lines.find((item) => item.id === entry.lineId);
    if (!line) return;
    const stored = current.current[line.id];
    const now = stored !== undefined && stored !== "" ? Number(stored) : Number(line.counted_qty ?? 0);
    const result = await setCount(line, Math.max(0, now - 1));
    if (result.ok) { update(entry.key, { kind: "undone" }); setSessionCount((n) => Math.max(0, n - 1)); }
  }

  async function addExtra(entry: ScanEntry) {
    if (!countId) return;
    update(entry.key, { kind: "adding" });
    const form = new FormData();
    form.set("countId", countId); form.set("code", entry.code); form.set("qty", "1");
    const result = await addExtraItem({ ok: false, message: "" }, form).catch(() => ({ ok: false, message: "Connection problem. Try again." }));
    if (result.ok) {
      update(entry.key, { kind: "added" });
      setSessionCount((n) => n + 1);
      router.refresh(); // the new line is then found by its code on the next scan
    } else update(entry.key, { kind: "error", label: `${entry.code}: ${result.message}` });
  }

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return lines.filter((line) => (!words || `${line.item_name} ${line.size} ${line.lot_code}`.toLowerCase().includes(words)) && (!onlyOpen || values[line.id] === ""));
  }, [lines, onlyOpen, query, values]);
  const done = lines.filter((line) => values[line.id] !== "").length;
  const pieces = lines.reduce((sum, line) => sum + (values[line.id] ? Number(values[line.id]) || 0 : 0), 0);
  const latest = scanLog[0];
  const scanPanel = (
    <div className="space-y-2">
      {latest ? (
        <div key={latest.key} className={`pop-in rounded-2xl p-3 ${latest.kind === "ok" || latest.kind === "added" ? "bg-success text-white" : latest.kind === "error" ? "bg-danger text-white" : latest.kind === "undone" ? "bg-white/15" : "bg-accent text-black"}`}>
          {latest.kind === "ok" ? <p className="text-base font-semibold">✓ +1 {latest.label} → {latest.total}</p>
            : latest.kind === "added" ? <p className="text-base font-semibold">✓ Added {latest.code} as a found extra (1 pc)</p>
            : latest.kind === "undone" ? <p className="font-semibold">Undone: {latest.label}</p>
            : latest.kind === "error" ? <p className="font-semibold">Could not save: {latest.label}</p>
            : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">⚠️ Not on this sheet: {latest.code}</p>
                <span className="flex gap-2">
                  {countId ? <button className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white" disabled={latest.kind === "adding"} onClick={() => addExtra(latest)} type="button">{latest.kind === "adding" ? "Adding…" : "Add as extra (1 pc)"}</button> : null}
                  <button className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black" onClick={() => update(latest.key, { kind: "skipped" })} type="button">Skip</button>
                </span>
              </div>
            )}
        </div>
      ) : <p className="rounded-2xl bg-white/10 p-3">Point the camera at each piece&apos;s tag. Every scan adds 1; keep going, it stays open.</p>}
      <p className="text-xs text-white/70">This session: {sessionCount} piece{sessionCount === 1 ? "" : "s"} · {done} of {lines.length} items counted · {pieces}{expectedPieces !== null ? ` of ${Number(expectedPieces)}` : ""} pieces in total</p>
      {scanLog.length > 1 ? (
        <ul className="space-y-1">
          {scanLog.slice(1, 6).map((entry) => (
            <li className="flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs" key={entry.key}>
              <span className="truncate">{entry.kind === "ok" ? `+1 ${entry.label} → ${entry.total}` : entry.kind === "added" ? `Extra ${entry.code}` : entry.kind === "undone" ? `Undone: ${entry.label}` : entry.kind === "skipped" ? `Skipped ${entry.code}` : entry.label}</span>
              {entry.kind === "ok" ? <button className="shrink-0 rounded-lg bg-white/20 px-2 py-1 font-semibold" onClick={() => undo(entry)} type="button">−1</button> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {latest?.kind === "ok" ? <button className="w-full rounded-xl bg-white/15 py-2 text-xs font-semibold" onClick={() => undo(latest)} type="button">Undo last scan (−1)</button> : null}
    </div>
  );

  async function save(line: Line) {
    const raw = values[line.id];
    const quantity = raw === "" ? null : Number(raw);
    if (raw !== "" && (!Number.isFinite(quantity) || (quantity ?? 0) < 0)) { setState((s) => ({ ...s, [line.id]: "Enter a number" })); return; }
    setState((s) => ({ ...s, [line.id]: "saving" }));
    const result = await recordCount(line.id, quantity).catch(() => ({ ok: false, message: "Connection problem: not saved. Try again." }));
    setState((s) => ({ ...s, [line.id]: result.ok ? "saved" : result.message }));
  }

  return (
    <div className="space-y-3">
      {scanning ? <BarcodeScanner onClose={() => setScanning(false)} onCode={onScan} status={scanPanel} title="Scan to count (+1 each)" /> : null}
      <div className="flex flex-wrap items-center gap-3">
        {editable ? (
          <button className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white" onClick={() => { unlockScanSound(); setScanning(true); }} type="button">
            <Camera className="size-4" /> Scan
          </button>
        ) : null}
        <input className="h-11 min-w-56 flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary" onChange={(event) => setQuery(event.target.value)} placeholder="Find item, size or lot code" value={query} />
        <label className="flex items-center gap-2 text-sm font-medium"><input checked={onlyOpen} className="size-4 accent-primary" onChange={(event) => setOnlyOpen(event.target.checked)} type="checkbox" />Not counted yet</label>
        <span className="text-sm font-semibold">{done} of {lines.length} items counted · {pieces}{expectedPieces !== null ? ` of ${Number(expectedPieces)}` : ""} pieces</span>
      </div>
      <ul className="divide-y divide-border/60 rounded-2xl border border-border bg-background">
        {shown.slice(0, 400).map((line) => (
          <li className="flex items-center gap-3 px-3 py-2 text-sm" key={line.id}>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{line.item_name ?? "Item"}{line.size ? ` · ${line.size}` : ""}{line.is_extra ? " · found extra" : ""}</span>
              <span className="block text-xs text-muted">{line.lot_code ?? ""}</span>
            </span>
            {editable ? (
              <input
                aria-label={`Counted ${line.item_name ?? ""} ${line.size ?? ""}`}
                className="h-10 w-20 rounded-xl border border-border bg-card px-2 text-right text-sm outline-none focus:border-primary"
                inputMode="numeric"
                onBlur={() => save(line)}
                onChange={(event) => setValues((v) => ({ ...v, [line.id]: event.target.value.replace(/[^0-9.]/g, "") }))}
                value={values[line.id]}
              />
            ) : <span className="w-20 text-right font-semibold">{values[line.id] || "—"}</span>}
            <span className="w-5">
              {state[line.id] === "saving" ? <Loader2 className="size-4 animate-spin text-muted" /> : state[line.id] === "saved" ? <Check className="size-4 text-success" /> : null}
            </span>
            {state[line.id] && !["saving", "saved"].includes(state[line.id]) ? <span className="text-xs text-danger">{state[line.id]}</span> : null}
          </li>
        ))}
      </ul>
      {shown.length > 400 ? <p className="text-xs text-muted">Showing 400 of {shown.length}. Search to narrow the list.</p> : null}
    </div>
  );
}

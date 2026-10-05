"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2 } from "lucide-react";

import { BarcodeScanner } from "@/components/app/barcode-scanner";
import { addExtraItem, recordCount } from "@/lib/buying/actions";

type Line = { id: string; lot_code: string | null; item_name: string | null; size: string | null; counted_qty: number | null; is_extra: boolean };

/** Enter the counted quantity per item; each entry saves on its own. No expected figures are shown. */
export function CountSheet({ codes = [], countId, editable, lines }: {
  /** Codes each line can be scanned by (lot code, EAN, article code). */
  codes?: Array<{ codes: string[]; line: string }>;
  countId?: string;
  editable: boolean;
  lines: Line[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((line) => [line.id, line.counted_qty === null ? "" : String(Number(line.counted_qty))])));
  const [state, setState] = useState<Record<string, "saving" | "saved" | string>>({});
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<React.ReactNode>(null);
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

  const onScan = useCallback(async (raw: string) => {
    const code = raw.trim().toUpperCase();
    const line = lineByCode.get(code);
    if (!line) {
      setScanStatus(
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span>Not on this sheet: <b>{code}</b></span>
          {countId ? (
            <button className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-black" onClick={async () => {
              const form = new FormData();
              form.set("countId", countId); form.set("code", code); form.set("qty", "1");
              const result = await addExtraItem({ ok: false, message: "" }, form);
              setScanStatus(result.ok ? <span>Added <b>{code}</b> as a found extra (1 pc).</span> : <span>{result.message}</span>);
              if (result.ok) router.refresh();
            }} type="button">Add as found extra</button>
          ) : null}
        </span>,
      );
      return;
    }
    const next = Number(current.current[line.id] || 0) + 1;
    current.current = { ...current.current, [line.id]: String(next) };
    setValues((v) => ({ ...v, [line.id]: String(next) }));
    setState((s) => ({ ...s, [line.id]: "saving" }));
    setScanStatus(<span>+1 <b>{line.item_name ?? "Item"}{line.size ? ` · ${line.size}` : ""}</b> → {next}</span>);
    const result = await recordCount(line.id, next);
    setState((s) => ({ ...s, [line.id]: result.ok ? "saved" : result.message }));
    if (!result.ok) setScanStatus(<span>Could not save: {result.message}</span>);
  }, [countId, lineByCode, router]);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return lines.filter((line) => (!words || `${line.item_name} ${line.size} ${line.lot_code}`.toLowerCase().includes(words)) && (!onlyOpen || values[line.id] === ""));
  }, [lines, onlyOpen, query, values]);
  const done = lines.filter((line) => values[line.id] !== "").length;

  async function save(line: Line) {
    const raw = values[line.id];
    const quantity = raw === "" ? null : Number(raw);
    if (raw !== "" && (!Number.isFinite(quantity) || (quantity ?? 0) < 0)) { setState((s) => ({ ...s, [line.id]: "Enter a number" })); return; }
    setState((s) => ({ ...s, [line.id]: "saving" }));
    const result = await recordCount(line.id, quantity);
    setState((s) => ({ ...s, [line.id]: result.ok ? "saved" : result.message }));
  }

  return (
    <div className="space-y-3">
      {scanning ? <BarcodeScanner onClose={() => setScanning(false)} onCode={onScan} status={scanStatus} title="Scan to count (+1 each)" /> : null}
      <div className="flex flex-wrap items-center gap-3">
        {editable ? (
          <button className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white" onClick={() => { setScanStatus(null); setScanning(true); }} type="button">
            <Camera className="size-4" /> Scan
          </button>
        ) : null}
        <input className="h-11 min-w-56 flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary" onChange={(event) => setQuery(event.target.value)} placeholder="Find item, size or lot code" value={query} />
        <label className="flex items-center gap-2 text-sm font-medium"><input checked={onlyOpen} className="size-4 accent-primary" onChange={(event) => setOnlyOpen(event.target.checked)} type="checkbox" />Not counted yet</label>
        <span className="text-sm font-semibold">{done} of {lines.length} counted</span>
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

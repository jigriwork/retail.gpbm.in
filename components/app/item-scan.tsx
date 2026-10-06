"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Loader2, ScanBarcode, Search } from "lucide-react";

import { BarcodeScanner, unlockScanSound } from "@/components/app/barcode-scanner";
import { ScannerGun, useScannerGunSetting } from "@/components/app/scanner-gun";
import { lookupItem, type LookupItem } from "@/lib/scan/actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
};
const units = (value: number | null) => Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 1 });

/** Scan or type a code; shows the item in each store with stock and recent sales. */
export function ItemScan() {
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ code: string; items: LookupItem[]; message?: string } | null>(null);
  const [pending, start] = useTransition();

  const latest = useRef(0);
  const [gun, toggleGun] = useScannerGunSetting();

  // Connection problems show "scan again" (never the error page); only the newest answer is shown.
  function search(value: string): Promise<boolean> {
    const clean = value.trim();
    if (!clean) return Promise.resolve(false);
    setCode(clean);
    const request = ++latest.current;
    return new Promise((resolve) => start(async () => {
      let next: { code: string; items: LookupItem[]; message?: string };
      try {
        next = { code: clean, ...(await lookupItem(clean)) };
      } catch {
        next = { code: clean, items: [], message: "Connection problem. Scan again." };
      }
      if (request === latest.current) setResult(next);
      resolve(next.items.length > 0);
    }));
  }

  return (
    <div className="space-y-4">
      {scanning ? (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onCode={search}
          status={
            pending ? <p className="rounded-2xl bg-white/10 p-3">Looking up {code}…</p>
              : !result ? <p className="rounded-2xl bg-white/10 p-3">Point the camera at any tag. It stays open: scan the next tag whenever you like.</p>
              : result.message ? <p className="rounded-2xl bg-danger p-3 font-semibold">{result.message}</p>
              : result.items.length ? (
                <div key={result.code} className="pop-in space-y-1.5 rounded-2xl bg-white p-3 text-black">
                  <p className="font-semibold">{result.items[0].item ?? "Item"}{result.items[0].size ? ` · ${result.items[0].size}` : ""}</p>
                  <p className="text-xs text-black/60">{[result.items[0].brand, `MRP ${result.items[0].mrp === null ? "—" : `₹${Number(result.items[0].mrp).toLocaleString("en-IN")}`}`].filter(Boolean).join(" · ")}</p>
                  {result.items.map((item) => (
                    <p className="flex justify-between gap-2 text-sm" key={`${item.store}-${item.lot_code}`}>
                      <span>{item.store}{result.items.length > 1 && item.size !== result.items[0].size ? ` · ${item.size ?? ""}` : ""}</span>
                      <span className="font-semibold">{units(item.on_hand)} in stock · sold {units(item.sold_30)} in 30 days</span>
                    </p>
                  ))}
                </div>
              ) : <p className="rounded-2xl bg-accent p-3 font-semibold text-black">{result.code} is not in the latest stock files. New arrivals show after the next weekly stock upload.</p>
          }
          title="Scan an item"
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button className="inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-white" onClick={() => { unlockScanSound(); setScanning(true); }} type="button">
          <Camera className="size-5" /> Scan a tag
        </button>
        <button aria-pressed={gun} className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold ${gun ? "bg-primary-deep text-white" : "border border-border bg-card"}`} onClick={toggleGun} type="button">
          <ScanBarcode className="size-5" /> Scanner gun{gun ? ": on" : ""}
        </button>
        <form className="flex min-w-60 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); search(code); }}>
          <input className="h-12 flex-1 rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-primary" inputMode="text" onChange={(event) => setCode(event.target.value)} placeholder="Or type barcode / lot code" value={code} />
          <button aria-label="Look up" className="inline-flex size-12 items-center justify-center rounded-2xl border border-border bg-card" type="submit">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </button>
        </form>
      </div>
      {gun && !scanning ? (
        <div className="rounded-2xl bg-primary-deep p-3 text-white shadow-md">
          <ScannerGun hint="Scan a tag to see its stock and recent sales. Works with any USB or Bluetooth barcode scanner." onCode={search} />
        </div>
      ) : null}

      {result ? (
        result.message ? <p className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm font-medium text-danger">{result.message}</p>
          : result.items.length ? (
            <ul className="space-y-3">
              {result.items.map((item) => (
                <li className="pop-in rounded-2xl border border-border bg-card p-4 shadow-sm" key={`${item.store}-${item.lot_code}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{item.item ?? "Item"}{item.size ? ` · ${item.size}` : ""}</p>
                    <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">{item.store}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{[item.brand, item.category, `lot ${item.lot_code}`].filter(Boolean).join(" · ")}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <Stat label="In stock" value={`${units(item.on_hand)} pcs`} strong />
                    <Stat label="MRP" value={item.mrp === null ? "—" : `₹${Number(item.mrp).toLocaleString("en-IN")}`} />
                    <Stat label="Sold 30 / 90 days" value={`${units(item.sold_30)} / ${units(item.sold_90)}`} />
                    <Stat label="Last sold" value={day(item.last_sale)} />
                  </div>
                  {item.snapshot_date ? <p className="mt-2 text-xs text-muted">Stock = report of {day(item.snapshot_date)} less sales since.</p> : null}
                </li>
              ))}
            </ul>
          ) : <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">No item found for <b>{result.code}</b> in the latest stock reports.</p>
      ) : null}
    </div>
  );
}

function Stat({ label, strong, value }: { label: string; strong?: boolean; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={strong ? "text-lg font-semibold" : "font-semibold"}>{value}</p>
    </div>
  );
}

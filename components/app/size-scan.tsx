"use client";

import { useState, useTransition } from "react";
import { Camera, Loader2, Search } from "lucide-react";

import { BarcodeScanner, unlockScanSound } from "@/components/app/barcode-scanner";
import { checkSizes, type SizeItem } from "@/lib/scan/size-actions";

type Result = { code: string; items: SizeItem[]; message?: string };

/** Big size chips: in stock (with count), sold out (crossed), the scanned size outlined. */
function SizeGrid({ dark = false, item }: { dark?: boolean; item: SizeItem }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-base font-semibold">{item.item}</p>
        <p className={`text-xs ${dark ? "text-black/60" : "text-muted"}`}>{[item.brand, item.mrp ? `MRP ₹${Number(item.mrp).toLocaleString("en-IN")}` : null].filter(Boolean).join(" · ")}</p>
      </div>
      {item.stores.map((store) => {
        const available = store.sizes.filter((size) => Number(size.on_hand) > 0);
        return (
          <div key={store.store}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide opacity-70">
              {store.store} · {available.length ? `${available.length} size${available.length === 1 ? "" : "s"} in stock` : "none in stock"}
            </p>
            <div className="flex flex-wrap gap-2">
              {store.sizes.map((size) => {
                const count = Number(size.on_hand);
                const scanned = item.scanned_size && size.size.toUpperCase() === item.scanned_size.toUpperCase();
                return (
                  <span
                    className={`inline-flex min-w-14 flex-col items-center rounded-2xl px-3 py-2 text-center ${count > 0 ? "bg-success text-white" : "bg-black/10 text-current line-through opacity-60"} ${scanned ? "ring-4 ring-primary ring-offset-2" : ""}`}
                    key={size.size}
                  >
                    <span className="text-base font-bold leading-tight">{size.size}</span>
                    <span className="text-[0.7rem] font-semibold">{count > 0 ? (count === 1 ? "last 1" : `${count} pcs`) : "sold out"}</span>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Scan a tag (camera stays open) or type the code to see the sizes in stock. */
export function SizeScan() {
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  function search(value: string) {
    const clean = value.trim();
    if (!clean) return;
    setCode(clean);
    start(async () => setResult({ code: clean, ...(await checkSizes(clean)) }));
  }

  const resultView = (dark: boolean) =>
    pending ? <p className={`rounded-2xl p-3 ${dark ? "bg-white/10" : "border border-border bg-card"}`}>Checking sizes for {code}…</p>
      : !result ? <p className={`rounded-2xl p-3 ${dark ? "bg-white/10" : ""}`}>Point the camera at the tag. It stays open: scan the next tag any time.</p>
      : result.message ? <p className="rounded-2xl bg-danger p-3 font-semibold text-white">{result.message}</p>
      : result.items.length ? (
        <div className="space-y-3">
          {result.items.map((item) => (
            <div className={`pop-in rounded-2xl p-4 ${dark ? "bg-white text-black" : "border border-border bg-card shadow-sm"}`} key={`${result.code}-${item.item}`}>
              <SizeGrid dark={dark} item={item} />
            </div>
          ))}
        </div>
      ) : <p className="rounded-2xl bg-accent p-3 font-semibold text-black">No item found for {result.code} in the latest stock report.</p>;

  return (
    <div className="space-y-4">
      {scanning ? <BarcodeScanner onClose={() => setScanning(false)} onCode={(value) => { search(value); }} status={resultView(true)} title="Check sizes" /> : null}
      <div className="flex flex-wrap gap-2">
        <button className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-semibold text-white sm:flex-none" onClick={() => { unlockScanSound(); setScanning(true); }} type="button">
          <Camera className="size-5" /> Scan a tag
        </button>
        <form className="flex min-w-60 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); search(code); }}>
          <input className="h-14 flex-1 rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-primary" onChange={(event) => setCode(event.target.value)} placeholder="Or type the barcode" value={code} />
          <button aria-label="Check sizes" className="inline-flex size-14 items-center justify-center rounded-2xl border border-border bg-card" type="submit">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </button>
        </form>
      </div>
      {!scanning && result ? resultView(false) : null}
    </div>
  );
}

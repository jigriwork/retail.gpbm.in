"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Keyboard, ScanBarcode } from "lucide-react";

import { scanFeedback, unlockScanSound } from "@/components/app/barcode-scanner";

// A USB or Bluetooth barcode scanner ("scanner gun") types the code very fast
// and presses Enter. A person types slower than this between keys.
const BURST_GAP_MS = 50;
const MIN_LENGTH = 3;

// Scanner-gun mode is remembered on this device (memory only if storage is blocked).
const settingKey = "gpbm-scanner-gun";
const listeners = new Set<() => void>();
let memory = false;
function readSetting() {
  try { return window.localStorage.getItem(settingKey) === "1"; } catch { return memory; }
}

/** [on, toggle] for scanner-gun mode. */
export function useScannerGunSetting() {
  const on = useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, readSetting, () => false);
  const toggle = () => {
    memory = !on;
    try { window.localStorage.setItem(settingKey, on ? "0" : "1"); } catch { /* storage blocked */ }
    listeners.forEach((listener) => listener());
  };
  return [on, toggle] as const;
}

const editable = (element: EventTarget | null): element is HTMLInputElement | HTMLTextAreaElement =>
  element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;

/** Puts back what a field held before the scanner typed into it (works with React inputs). */
function restore(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Scanner-gun input. While shown, every scan anywhere on the page calls
 * `onCode` (with a beep), even if another box has the cursor: a fast burst of
 * keys ending in Enter is a scan, and anything it typed into that other box is
 * taken out again. `onCode` returns false for "not found" (two low beeps).
 */
export function ScannerGun({ hint = "Scan any tag with the scanner gun.", onCode }: {
  hint?: string;
  onCode: (code: string) => boolean | void | Promise<boolean | void>;
}) {
  const box = useRef<HTMLInputElement>(null);
  const handler = useRef(onCode);
  const [typing, setTyping] = useState(false);
  const [focused, setFocused] = useState(false);
  const [last, setLast] = useState("");

  useEffect(() => { handler.current = onCode; }, [onCode]);
  useEffect(() => { unlockScanSound(); box.current?.focus(); }, []);

  useEffect(() => {
    let buffer = "";
    let lastKey = 0;
    let target: HTMLInputElement | HTMLTextAreaElement | null = null;
    let before = "";
    const fire = (code: string) => {
      setLast(code);
      void Promise.resolve(handler.current(code)).then((ok) => scanFeedback(ok !== false), () => scanFeedback(false));
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Our own box handles its Enter in onKeyDown below.
      if (event.target === box.current) return;
      const now = performance.now();
      // A slower key starts a new possible burst: typing by hand never adds up.
      if (now - lastKey > BURST_GAP_MS) {
        buffer = "";
        target = editable(event.target) ? event.target : null;
        before = target?.value ?? "";
      }
      lastKey = now;
      if (event.key === "Enter") {
        if (buffer.length >= MIN_LENGTH) {
          event.preventDefault();
          event.stopPropagation();
          if (target && target.value !== before) restore(target, before);
          fire(buffer);
        }
        buffer = "";
        return;
      }
      if (event.key.length === 1) buffer += event.key;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="space-y-1.5">
      <div className={`flex items-center gap-2 rounded-2xl border-2 px-3 ${focused ? "border-success bg-success/10" : "border-white/30 bg-white/10"}`}>
        <ScanBarcode className={`size-5 shrink-0 ${focused ? "text-success" : "opacity-70"}`} />
        <input
          aria-label="Scanner gun"
          autoComplete="off"
          className="h-12 min-w-0 flex-1 bg-transparent text-base font-semibold tracking-wide text-current outline-none placeholder:text-current placeholder:opacity-60"
          enterKeyHint="go"
          inputMode={typing ? "text" : "none"}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const code = event.currentTarget.value.trim();
            event.currentTarget.value = "";
            if (code.length >= 1) {
              setLast(code);
              void Promise.resolve(handler.current(code)).then((ok) => scanFeedback(ok !== false), () => scanFeedback(false));
            }
          }}
          placeholder={focused ? "Ready: scan now" : "Tap here, then scan"}
          ref={box}
        />
        <button
          aria-label={typing ? "Hide keyboard" : "Type a code"}
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl ${typing ? "bg-white text-black" : "bg-white/15"}`}
          onClick={() => { setTyping((value) => !value); box.current?.blur(); setTimeout(() => box.current?.focus(), 50); }}
          type="button"
        >
          <Keyboard className="size-4" />
        </button>
      </div>
      <p className="text-xs opacity-70">{hint}{last ? ` Last scan: ${last}` : ""}</p>
    </div>
  );
}

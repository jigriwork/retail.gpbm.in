"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

type Detector = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type DetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

const formats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "codabar", "itf", "qr_code"];
const repeatGapMs = 1500;

function feedback() {
  try { navigator.vibrate?.(60); } catch { /* not supported */ }
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.frequency.value = 1200;
    gain.gain.value = 0.08;
    tone.connect(gain).connect(context.destination);
    tone.start();
    tone.stop(context.currentTime + 0.08);
    tone.onended = () => void context.close();
  } catch { /* sound is optional */ }
}

/**
 * Full-screen camera scanner. Uses the phone's built-in barcode reader when
 * it has one (Chrome on Android) and the ZXing reader otherwise (iPhone).
 * The same code is ignored for 1.5 s so one tag is not read twice.
 */
export function BarcodeScanner({ onClose, onCode, status, title = "Scan a barcode" }: {
  onClose: () => void;
  onCode: (code: string) => void;
  status?: React.ReactNode;
  title?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const handler = useRef(onCode);
  const [error, setError] = useState("");
  const [engine, setEngine] = useState("");

  useEffect(() => { handler.current = onCode; }, [onCode]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    let zxingControls: { stop: () => void } | null = null;
    let last = { code: "", at: 0 };
    const emit = (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const now = Date.now();
      if (code === last.code && now - last.at < repeatGapMs) return;
      last = { code, at: now };
      feedback();
      handler.current(code);
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser cannot use the camera. Open the app in Chrome or Safari.");
        return;
      }
      const Native = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
      const supported = Native?.getSupportedFormats ? await Native.getSupportedFormats().catch(() => []) : [];
      const usable = formats.filter((format) => supported.includes(format));
      try {
        if (Native && usable.length) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
          if (stopped || !video.current) return;
          video.current.srcObject = stream;
          await video.current.play();
          setEngine("built-in reader");
          const detector = new Native({ formats: usable });
          const tick = async () => {
            if (stopped || !video.current) return;
            if (video.current.readyState >= 2) {
              const found = await detector.detect(video.current).catch(() => []);
              if (found[0]?.rawValue) emit(found[0].rawValue);
            }
            frame = window.setTimeout(tick, 120);
          };
          void tick();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (stopped || !video.current) return;
          const reader = new BrowserMultiFormatReader();
          setEngine("ZXing reader");
          zxingControls = await reader.decodeFromConstraints(
            { audio: false, video: { facingMode: { ideal: "environment" } } },
            video.current,
            (result) => { if (result) emit(result.getText()); },
          );
          if (stopped) zxingControls.stop();
        }
      } catch (reason) {
        const name = reason instanceof Error ? reason.name : "";
        setError(name === "NotAllowedError"
          ? "Camera access was refused. Allow the camera for retail.gpbm.in in the browser settings, then try again."
          : name === "NotFoundError" ? "No camera was found on this device." : "The camera could not be started. Close other apps using the camera and try again.");
      }
    }
    void start();
    return () => {
      stopped = true;
      window.clearTimeout(frame);
      zxingControls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div aria-modal className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog">
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="flex items-center gap-2 font-semibold"><Camera className="size-5" /> {title}</p>
        <button aria-label="Close scanner" className="inline-flex size-10 items-center justify-center rounded-full bg-white/15" onClick={onClose} type="button"><X className="size-5" /></button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video className="absolute inset-0 size-full object-cover" muted playsInline ref={video} />
        <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-40 -translate-y-1/2 rounded-3xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        {error ? <p className="absolute inset-x-4 top-4 rounded-2xl bg-danger/90 p-4 text-sm font-semibold">{error}</p> : null}
      </div>
      <div className="space-y-2 p-4 text-sm">
        <div aria-live="polite" className="min-h-12 rounded-2xl bg-white/10 p-3">{status ?? "Point the camera at the barcode on the tag."}</div>
        {engine ? <p className="text-xs text-white/60">Using the {engine}.</p> : null}
      </div>
    </div>
  );
}

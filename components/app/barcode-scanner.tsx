"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Flashlight, X } from "lucide-react";

import { readCounts } from "@/lib/scan/repeat";

type Detector = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type DetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

const formats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "codabar", "itf", "qr_code"];
const video = { facingMode: { ideal: "environment" }, height: { ideal: 1080 }, width: { ideal: 1920 } } as const;

// One shared sound context. iPhones only allow sound when it is started by a
// tap, so the Scan buttons call unlockScanSound() in their click handler.
let sound: AudioContext | null = null;

export function unlockScanSound() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    sound ??= new AudioContextClass();
    if (sound.state === "suspended") void sound.resume();
    // A silent blip inside the tap fully unlocks audio on iOS.
    const gain = sound.createGain();
    gain.gain.value = 0;
    const tone = sound.createOscillator();
    tone.connect(gain).connect(sound.destination);
    tone.start();
    tone.stop(sound.currentTime + 0.01);
  } catch { /* sound is optional */ }
}

function beep(frequency: number, start: number, length: number) {
  if (!sound) return;
  const tone = sound.createOscillator();
  const gain = sound.createGain();
  tone.type = "square";
  tone.frequency.value = frequency;
  gain.gain.setValueAtTime(0.6, sound.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.001, sound.currentTime + start + length);
  tone.connect(gain).connect(sound.destination);
  tone.start(sound.currentTime + start);
  tone.stop(sound.currentTime + start + length + 0.02);
}

/** Loud, short beep for a good scan; two low beeps when not found. */
function feedback(ok: boolean) {
  try { navigator.vibrate?.(ok ? 70 : [60, 80, 60]); } catch { /* not supported */ }
  try {
    if (!sound) unlockScanSound();
    if (sound?.state === "suspended") void sound.resume();
    if (ok) beep(1800, 0, 0.12);
    else { beep(400, 0, 0.14); beep(400, 0.2, 0.14); }
  } catch { /* sound is optional */ }
}

/**
 * Full-screen camera scanner that stays open: every read calls `onCode`, and
 * the caller shows the result in `status` (with its own buttons). Uses the
 * phone's built-in barcode reader when available (Chrome on Android) and the
 * ZXing reader otherwise (iPhone). `onCode` returns false for a "not found"
 * sound and buzz.
 */
export function BarcodeScanner({ onClose, onCode, status, title = "Scan a barcode" }: {
  onClose: () => void;
  onCode: (code: string) => boolean | void | Promise<boolean | void>;
  status?: React.ReactNode;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handler = useRef(onCode);
  const torchRef = useRef<((on: boolean) => Promise<void>) | null>(null);
  const [error, setError] = useState("");
  const [torch, setTorch] = useState<boolean | null>(null);

  useEffect(() => { handler.current = onCode; }, [onCode]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let zxingControls: { stop: () => void; switchTorch?: (on: boolean) => Promise<void> } | null = null;
    let last = { code: "", seen: 0 };
    const seen = (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const read = readCounts(last, code, Date.now());
      last = read.last;
      if (!read.counts) return;
      void Promise.resolve(handler.current(code)).then((ok) => feedback(ok !== false));
    };
    const enableTorch = (track: MediaStreamTrack | undefined) => {
      const capabilities = track?.getCapabilities?.() as { torch?: boolean } | undefined;
      if (track && capabilities?.torch) {
        torchRef.current = (on) => track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
        setTorch(false);
      }
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
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
          if (stopped || !videoRef.current) return;
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          enableTorch(stream.getVideoTracks()[0]);
          const detector = new Native({ formats: usable });
          const tick = async () => {
            if (stopped || !videoRef.current) return;
            if (videoRef.current.readyState >= 2) {
              const found = await detector.detect(videoRef.current).catch(() => []);
              if (found[0]?.rawValue) seen(found[0].rawValue);
            }
            timer = window.setTimeout(tick, 50);
          };
          void tick();
        } else {
          const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
          if (stopped || !videoRef.current) return;
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.CODABAR, BarcodeFormat.ITF, BarcodeFormat.QR_CODE,
          ]);
          hints.set(DecodeHintType.TRY_HARDER, true);
          const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 30, delayBetweenScanSuccess: 80 });
          zxingControls = await reader.decodeFromConstraints({ audio: false, video }, videoRef.current, (result) => {
            if (result) seen(result.getText());
          });
          if (stopped) { zxingControls.stop(); return; }
          if (zxingControls.switchTorch) {
            torchRef.current = (on) => zxingControls!.switchTorch!(on);
            setTorch(false);
          }
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
      window.clearTimeout(timer);
      zxingControls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function toggleTorch() {
    if (!torchRef.current || torch === null) return;
    try { await torchRef.current(!torch); setTorch(!torch); } catch { setTorch(null); }
  }

  return (
    <div aria-modal className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog">
      <div className="flex items-center justify-between gap-3 p-3">
        <p className="flex items-center gap-2 font-semibold"><Camera className="size-5" /> {title}</p>
        <div className="flex items-center gap-2">
          {torch !== null ? (
            <button aria-label={torch ? "Torch off" : "Torch on"} className={`inline-flex size-10 items-center justify-center rounded-full ${torch ? "bg-accent text-black" : "bg-white/15"}`} onClick={toggleTorch} type="button">
              <Flashlight className="size-5" />
            </button>
          ) : null}
          <button className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-black" onClick={onClose} type="button">
            <X className="size-4" /> Done
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video className="absolute inset-0 size-full object-cover" muted playsInline ref={videoRef} />
        <div aria-hidden className="pointer-events-none absolute inset-x-6 top-1/2 h-36 -translate-y-1/2 rounded-3xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        {error ? <p className="absolute inset-x-4 top-4 rounded-2xl bg-danger/90 p-4 text-sm font-semibold">{error}</p> : null}
      </div>
      <div aria-live="polite" className="max-h-[45dvh] overflow-y-auto p-3 text-sm">
        {status ?? <p className="rounded-2xl bg-white/10 p-3">Point the camera at the barcode on the tag. Keep scanning; it stays open.</p>}
      </div>
    </div>
  );
}

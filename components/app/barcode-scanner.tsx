"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Flashlight, RefreshCcw, X, ZoomIn } from "lucide-react";

import { acceptRead, emptyReadState } from "@/lib/scan/repeat";

type Detector = { detect(source: HTMLVideoElement): Promise<Array<{ format?: string; rawValue: string }>> };
type DetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

// Only the barcodes used on tags: fewer types = fewer misreads.
const formats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"];
const size = { height: { ideal: 1080 }, width: { ideal: 1920 } } as const;

type CameraCapabilities = { focusMode?: string[]; pointsOfInterest?: unknown; torch?: boolean; zoom?: { max: number; min: number } };

// The camera that worked is remembered on this phone (Switch camera).
const cameraKey = "gpbm-scan-camera";
function rememberedCamera() {
  try { return window.localStorage.getItem(cameraKey) ?? ""; } catch { return ""; }
}
function rememberCamera(id: string) {
  try { window.localStorage.setItem(cameraKey, id); } catch { /* storage blocked */ }
}

const isBack = (camera: MediaDeviceInfo) => /back|rear|environment/i.test(camera.label);
const isFrontName = (camera: MediaDeviceInfo) => /front|user|selfie|facetime/i.test(camera.label);

// Cameras found to face the user (old Androids often name cameras just
// "Camera 1"), remembered on this phone so Switch camera never picks them.
const frontKey = "gpbm-front-cameras";
function knownFront() {
  try { return new Set<string>(JSON.parse(window.localStorage.getItem(frontKey) ?? "[]")); } catch { return new Set<string>(); }
}
function markFront(id: string) {
  const ids = knownFront();
  ids.add(id);
  try { window.localStorage.setItem(frontKey, JSON.stringify([...ids].slice(-10))); } catch { /* storage blocked */ }
}
const facesUser = (track: MediaStreamTrack | undefined) => (track?.getSettings() as { facingMode?: string } | undefined)?.facingMode === "user";

/**
 * The back camera that focuses on a tag held close: on iPhone Pro models the
 * multi-lens "Back Triple / Dual Wide Camera" switches to macro by itself (the
 * plain wide camera cannot focus that close); on Android "camera2 0" is the
 * main lens (others are often ultra-wide or zoom lenses that blur up close).
 */
function preferredBack(cameras: MediaDeviceInfo[]) {
  for (const pattern of [/back triple camera/i, /back dual wide camera/i, /camera2 0\b/i, /^back camera$/i]) {
    const hit = cameras.find((camera) => pattern.test(camera.label));
    if (hit) return hit;
  }
  return null;
}

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
export function scanFeedback(ok: boolean) {
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
 * ZXing reader otherwise (iPhone), which reads only the band around the scan
 * box. Continuous autofocus where the phone allows it; tap to focus; 2× zoom;
 * Switch camera for phones with several back lenses. `onCode` returns false
 * for a "not found" sound and buzz.
 */
export function BarcodeScanner({ onClose, onCode, status, title = "Scan a barcode" }: {
  onClose: () => void;
  onCode: (code: string) => boolean | void | Promise<boolean | void>;
  status?: React.ReactNode;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handler = useRef(onCode);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const capsRef = useRef<CameraCapabilities>({});
  const torchRef = useRef<((on: boolean) => Promise<void>) | null>(null);
  const [error, setError] = useState("");
  const [torch, setTorch] = useState<boolean | null>(null);
  const [cameraId, setCameraId] = useState("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [zoom, setZoom] = useState<{ max: number; value: number } | null>(null);
  const [focusAt, setFocusAt] = useState<{ key: number; x: number; y: number } | null>(null);

  useEffect(() => { handler.current = onCode; }, [onCode]);

  // Phone Back (or an edge swipe) closes the scanner instead of leaving the
  // page: opening adds a "#scanner" history step; Done removes it again.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    let closedByBack = false;
    window.history.pushState(null, "", `${window.location.pathname}${window.location.search}#scanner`);
    const onPop = () => { closedByBack = true; closeRef.current(); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!closedByBack && window.location.hash === "#scanner") window.history.back();
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let reads = emptyReadState;
    // Check-digit and double-read rules (lib/scan/repeat) keep misreads out.
    const seen = (raw: string, format: string) => {
      const result = acceptRead(reads, raw, format, Date.now());
      reads = result.state;
      if (!result.accept) return;
      void Promise.resolve(handler.current(raw.trim())).then((ok) => scanFeedback(ok !== false), () => scanFeedback(false));
    };
    const open = (camera: string) => navigator.mediaDevices.getUserMedia({
      audio: false,
      video: camera ? { ...size, deviceId: { exact: camera } } : { ...size, facingMode: { ideal: "environment" } },
    });

    // Sharp picture: continuous autofocus, torch and zoom where the phone has them.
    async function tune(track: MediaStreamTrack) {
      const caps = (track.getCapabilities?.() ?? {}) as CameraCapabilities;
      capsRef.current = caps;
      trackRef.current = track;
      if (caps.focusMode?.includes("continuous")) {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
      }
      if (caps.torch) {
        torchRef.current = (on) => track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
        setTorch(false);
      } else { torchRef.current = null; setTorch(null); }
      if (caps.zoom && caps.zoom.max >= 1.5) {
        const current = Number((track.getSettings() as { zoom?: number }).zoom ?? 1);
        setZoom({ max: Math.min(caps.zoom.max, 2), value: current });
      } else setZoom(null);
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser cannot use the camera. Open the app in Chrome or Safari.");
        return;
      }
      try {
        const chosen = cameraId || rememberedCamera();
        stream = await open(chosen).catch((reason) => {
          if (!chosen) throw reason;
          rememberCamera("");
          return open("");
        });
        if (stopped) return;
        // Camera names are readable once the camera is allowed. Only back
        // cameras are offered: never one named or found to face the user.
        const front = knownFront();
        const all = (await navigator.mediaDevices.enumerateDevices().catch(() => []))
          .filter((device) => device.kind === "videoinput" && device.deviceId && !isFrontName(device) && !front.has(device.deviceId));
        const named = all.filter(isBack);
        const backs = named.length ? named : all;
        if (stopped) return;
        if (!chosen) {
          const best = preferredBack(named);
          const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
          if (best && best.deviceId && best.deviceId !== current) {
            stream.getTracks().forEach((track) => track.stop());
            stream = await open(best.deviceId).catch(() => open(""));
            if (stopped) return;
          }
        }
        // Opened the front camera after all? Note it, and open a back one.
        if (facesUser(stream.getVideoTracks()[0])) {
          const wrong = stream.getVideoTracks()[0]?.getSettings().deviceId;
          if (wrong) markFront(wrong);
          rememberCamera("");
          stream.getTracks().forEach((track) => track.stop());
          const other = backs.find((camera) => camera.deviceId !== wrong);
          stream = await (other ? open(other.deviceId) : Promise.reject(new Error("no back camera")))
            .catch(() => navigator.mediaDevices.getUserMedia({ audio: false, video: { ...size, facingMode: { exact: "environment" } } }));
          if (stopped) return;
        }
        const usedId = stream.getVideoTracks()[0]?.getSettings().deviceId;
        const switchable = backs.filter((camera) => !(facesUser(stream?.getVideoTracks()[0]) && camera.deviceId === usedId));
        setCameras(switchable.length > 1 ? switchable : []);
        const track = stream.getVideoTracks()[0];
        if (!videoRef.current || !track) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
        await tune(track);
        if (stopped) return;

        const Native = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
        const supported = Native?.getSupportedFormats ? await Native.getSupportedFormats().catch(() => []) : [];
        const usable = formats.filter((format) => supported.includes(format));
        if (Native && usable.length) {
          const detector = new Native({ formats: usable });
          const tick = async () => {
            if (stopped || !videoRef.current) return;
            if (videoRef.current.readyState >= 2) {
              const found = await detector.detect(videoRef.current).catch(() => []);
              if (found[0]?.rawValue) seen(found[0].rawValue, found[0].format ?? "");
            }
            timer = window.setTimeout(tick, 50);
          };
          void tick();
          return;
        }

        // ZXing: read the band around the scan box (faster, and other tags in
        // the picture do not interfere); every 4th try reads the whole picture.
        const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        if (stopped) return;
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatOneDReader(hints);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        let attempt = 0;
        const tick = () => {
          if (stopped || !videoRef.current || !context) return;
          const view = videoRef.current;
          const width = view.videoWidth;
          const height = view.videoHeight;
          if (view.readyState >= 2 && width && height) {
            const whole = ++attempt % 4 === 0;
            const sw = whole ? width : width * 0.9;
            const sh = whole ? height : Math.min(height * 0.4, width * 0.6);
            const scale = Math.min(1, 1280 / sw);
            canvas.width = Math.round(sw * scale);
            canvas.height = Math.round(sh * scale);
            context.drawImage(view, (width - sw) / 2, (height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
            try {
              const result = reader.decodeFromCanvas(canvas);
              seen(result.getText(), BarcodeFormat[result.getBarcodeFormat()] ?? "");
            } catch { /* nothing readable in this picture */ }
          }
          timer = window.setTimeout(tick, 60);
        };
        tick();
      } catch (reason) {
        const name = reason instanceof Error ? reason.name : "";
        setError(name === "NotAllowedError"
          ? "Camera access was refused. Allow the camera for retail.gpbm.in in the browser settings, then try again."
          : name === "NotFoundError" ? "No camera was found on this device."
          : name === "NotReadableError" ? "The camera is busy. Close other apps using the camera and try again."
          : "The camera could not be started. Tap Switch camera or try again.");
      }
    }
    void start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      trackRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraId]);

  async function toggleTorch() {
    if (!torchRef.current || torch === null) return;
    try { await torchRef.current(!torch); setTorch(!torch); } catch { setTorch(null); }
  }

  function switchCamera() {
    if (cameras.length < 2) return;
    const current = trackRef.current?.getSettings().deviceId ?? cameraId;
    const next = cameras[(cameras.findIndex((camera) => camera.deviceId === current) + 1) % cameras.length];
    rememberCamera(next.deviceId);
    setError("");
    setCameraId(next.deviceId);
  }

  async function toggleZoom() {
    const track = trackRef.current;
    if (!track || !zoom) return;
    const value = zoom.value > 1.2 ? Math.max(capsRef.current.zoom?.min ?? 1, 1) : zoom.max;
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
      setZoom({ ...zoom, value });
    } catch { setZoom(null); }
  }

  // Tap the picture to focus there (phones that allow it).
  async function focusHere(event: React.PointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    setFocusAt({ key: Date.now(), x: event.clientX - box.left, y: event.clientY - box.top });
    if (!track) return;
    const caps = capsRef.current;
    const set: Record<string, unknown> = {};
    if (caps.pointsOfInterest) set.pointsOfInterest = [{ x, y }];
    if (caps.focusMode?.includes("single-shot")) set.focusMode = "single-shot";
    else if (caps.focusMode?.includes("manual") && caps.focusMode.includes("continuous")) set.focusMode = "continuous";
    if (!Object.keys(set).length) return;
    await track.applyConstraints({ advanced: [set as MediaTrackConstraintSet] }).catch(() => undefined);
    if (set.focusMode === "single-shot" && caps.focusMode?.includes("continuous")) {
      window.setTimeout(() => { void trackRef.current?.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined); }, 1500);
    }
  }

  const round = "inline-flex size-10 items-center justify-center rounded-full";
  return (
    <div aria-modal className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog">
      <div className="flex items-center justify-between gap-2 p-3">
        <p className="flex min-w-0 items-center gap-2 font-semibold"><Camera className="size-5 shrink-0" /> <span className="truncate">{title}</span></p>
        <div className="flex shrink-0 items-center gap-2">
          {zoom ? (
            <button aria-label="Zoom" className={`${round} text-xs font-bold ${zoom.value > 1.2 ? "bg-accent text-black" : "bg-white/15"}`} onClick={toggleZoom} type="button">
              {zoom.value > 1.2 ? `${Math.round(zoom.value * 10) / 10}×` : <ZoomIn className="size-5" />}
            </button>
          ) : null}
          {cameras.length > 1 ? (
            <button aria-label="Switch camera" className={`${round} bg-white/15`} onClick={switchCamera} type="button">
              <RefreshCcw className="size-5" />
            </button>
          ) : null}
          {torch !== null ? (
            <button aria-label={torch ? "Torch off" : "Torch on"} className={`${round} ${torch ? "bg-accent text-black" : "bg-white/15"}`} onClick={toggleTorch} type="button">
              <Flashlight className="size-5" />
            </button>
          ) : null}
          <button className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-black" onClick={onClose} type="button">
            <X className="size-4" /> Done
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden" onPointerDown={focusHere}>
        <video className="absolute inset-0 size-full object-cover" muted playsInline ref={videoRef} />
        <div aria-hidden className="pointer-events-none absolute inset-x-6 top-1/2 h-36 -translate-y-1/2 rounded-3xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        {focusAt ? <span aria-hidden className="pointer-events-none absolute size-16 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-accent" key={focusAt.key} style={{ left: focusAt.x, top: focusAt.y }} /> : null}
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-white/80">Hold 15–20 cm from the tag · tap the picture to focus{cameras.length > 1 ? " · blurry? tap ⟳ to switch camera" : ""}</p>
        {error ? <p className="absolute inset-x-4 top-4 rounded-2xl bg-danger/90 p-4 text-sm font-semibold">{error}</p> : null}
      </div>
      <div aria-live="polite" className="max-h-[45dvh] overflow-y-auto p-3 text-sm">
        {status ?? <p className="rounded-2xl bg-white/10 p-3">Point the camera at the barcode on the tag. Keep scanning; it stays open.</p>}
      </div>
    </div>
  );
}

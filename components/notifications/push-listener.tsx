"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";

let audio: AudioContext | null = null;

/** A short, soft two-note chime. */
function chime() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    audio ??= new AudioContextClass();
    if (audio.state === "suspended") void audio.resume();
    [[880, 0], [1318.5, 0.16]].forEach(([frequency, start]) => {
      const tone = audio!.createOscillator();
      const gain = audio!.createGain();
      tone.type = "sine";
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, audio!.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.35, audio!.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio!.currentTime + start + 0.5);
      tone.connect(gain).connect(audio!.destination);
      tone.start(audio!.currentTime + start);
      tone.stop(audio!.currentTime + start + 0.55);
    });
  } catch { /* sound is optional */ }
}

type Toast = { body: string; key: number; title: string; url: string };

/** While the app is open: a chime and a banner for each new notification, and a fresh 🔔 count. */
export function PushListener() {
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const unlock = () => { try { audio?.resume(); } catch { /* optional */ } };
    window.addEventListener("pointerdown", unlock, { once: true });
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { body?: string; silent?: boolean; title?: string; type?: string; url?: string } | null;
      if (data?.type !== "gpbm-push") return;
      if (!data.silent) chime();
      setToast({ body: data.body ?? "", key: Date.now(), title: data.title ?? "New notification", url: data.url ?? "/" });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(null), 8000);
      router.refresh();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => { navigator.serviceWorker.removeEventListener("message", onMessage); window.removeEventListener("pointerdown", unlock); };
  }, [router]);

  if (!toast) return null;
  return (
    <div className="fixed inset-x-3 top-[max(env(safe-area-inset-top),0.75rem)] z-50 mx-auto max-w-md" key={toast.key}>
      <div className="pop-in flex items-start gap-3 rounded-2xl border border-border bg-card p-3 shadow-xl">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white"><Bell className="size-4" /></span>
        <Link className="min-w-0 flex-1" href={toast.url} onClick={() => setToast(null)}>
          <p className="truncate text-sm font-semibold">{toast.title}</p>
          {toast.body ? <p className="line-clamp-2 text-xs text-muted">{toast.body}</p> : null}
        </Link>
        <button aria-label="Close" className="shrink-0 text-muted" onClick={() => setToast(null)} type="button"><X className="size-4" /></button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useSyncExternalStore } from "react";
import { BellRing, X } from "lucide-react";

import { savePushSubscription } from "@/lib/notifications/actions";
import { VAPID_PUBLIC_KEY } from "@/lib/notifications/keys";

const laterKey = "gpbm-notify-later";
const changed = () => window.dispatchEvent(new Event("gpbm-notify"));
const read = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* storage blocked */ } };

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(base64: string) {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** Subscribes this phone / browser and saves it (also refreshes an existing subscription). */
async function subscribe() {
  const registration = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? (await registration.pushManager.subscribe({ applicationServerKey: keyBytes(VAPID_PUBLIC_KEY), userVisibleOnly: true }));
  const json = subscription.toJSON() as { endpoint: string; keys: { auth: string; p256dh: string } };
  await savePushSubscription(json, navigator.userAgent);
}

type Mode = "ask" | "blocked" | "hidden";
function mode(): Mode {
  if (!supported()) return "hidden";
  if (Notification.permission === "granted") return "hidden";
  if (Date.now() < Number(read(laterKey) ?? 0)) return "hidden";
  return Notification.permission === "denied" ? "blocked" : "ask";
}
const subscribeStore = (listener: () => void) => { window.addEventListener("gpbm-notify", listener); return () => window.removeEventListener("gpbm-notify", listener); };

/**
 * "Turn on notifications" card. Once allowed, it stays hidden and keeps this
 * phone's subscription up to date. On iPhone, notifications need the app
 * installed on the home screen first (the Install card covers that).
 */
export function EnableNotifications() {
  const current = useSyncExternalStore(subscribeStore, mode, () => "hidden" as Mode);

  // Already allowed: make sure the server knows this phone (once per visit).
  useEffect(() => {
    if (!supported() || Notification.permission !== "granted") return;
    try { if (window.sessionStorage.getItem("gpbm-push-synced")) return; window.sessionStorage.setItem("gpbm-push-synced", "1"); } catch { /* storage blocked */ }
    void subscribe().catch(() => undefined);
  }, []);

  if (current === "hidden") return null;
  const later = () => { write(laterKey, String(Date.now() + 3 * 86_400_000)); changed(); };
  async function allow() {
    const permission = await Notification.requestPermission();
    if (permission === "granted") await subscribe().catch(() => undefined);
    changed();
  }

  return (
    <section className="pop-in relative mb-4 rounded-2xl border border-accent/40 bg-accent-soft p-4 shadow-sm">
      <button aria-label="Not now" className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full text-muted" onClick={later} type="button"><X className="size-4" /></button>
      <div className="flex items-start gap-3 pr-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-black"><BellRing className="size-5" /></span>
        <div className="min-w-0">
          <p className="font-semibold">{current === "blocked" ? "Notifications are blocked" : "Turn on notifications"}</p>
          <p className="mt-0.5 text-sm leading-5 text-muted">
            {current === "blocked"
              ? "Allow notifications for retail.gpbm.in in your phone's browser or app settings to hear about new tasks, replies and notices."
              : "Hear a sound when you get a new task, a reply to your request, or a notice from the owner."}
          </p>
        </div>
      </div>
      {current === "ask" ? (
        <div className="mt-3 flex gap-2">
          <button className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white" onClick={allow} type="button"><BellRing className="size-4" /> Turn on</button>
          <button className="h-11 rounded-xl border border-border bg-card px-4 text-sm font-semibold" onClick={later} type="button">Not now</button>
        </div>
      ) : null}
    </section>
  );
}

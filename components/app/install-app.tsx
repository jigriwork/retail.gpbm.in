"use client";

import { useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Mode = "hidden" | "prompt" | "ios";

// The root layout's early script keeps Chrome's install event in
// window.__gpbmInstall and fires "gpbm-install" when anything changes.
const installedKey = "gpbm-installed";
const laterKey = "gpbm-install-later";
const read = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* storage blocked */ } };
const changed = () => window.dispatchEvent(new Event("gpbm-install"));

function mode(): Mode {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (standalone || read(installedKey) === "1") return "hidden";
  if (Date.now() < Number(read(laterKey) ?? 0)) return "hidden";
  if ((window as { __gpbmInstall?: InstallEvent | null }).__gpbmInstall) return "prompt";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "hidden";
}

function subscribe(listener: () => void) {
  window.addEventListener("gpbm-install", listener);
  return () => window.removeEventListener("gpbm-install", listener);
}

/**
 * "Install the app" for people using the website in the browser. Android and
 * desktop Chrome get the real install button; iPhone gets the Add to Home
 * Screen steps. Never shown inside the installed app or after installing;
 * "Not now" hides it for 7 days.
 */
export function InstallApp() {
  const current = useSyncExternalStore(subscribe, mode, () => "hidden" as Mode);
  if (current === "hidden") return null;

  async function install() {
    const event = (window as { __gpbmInstall?: InstallEvent | null }).__gpbmInstall;
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    (window as { __gpbmInstall?: InstallEvent | null }).__gpbmInstall = null;
    if (choice.outcome === "accepted") write(installedKey, "1");
    else write(laterKey, String(Date.now() + 7 * 86_400_000));
    changed();
  }
  const later = () => { write(laterKey, String(Date.now() + 7 * 86_400_000)); changed(); };
  const done = () => { write(installedKey, "1"); changed(); };

  return (
    <section className="pop-in relative mb-4 rounded-2xl border border-primary/30 bg-primary-soft p-4 shadow-sm">
      <button aria-label="Not now" className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full text-muted" onClick={later} type="button"><X className="size-4" /></button>
      <div className="flex items-start gap-3 pr-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" className="size-11 shrink-0 rounded-xl" height={44} src="/icon-192.png" width={44} />
        <div className="min-w-0">
          <p className="font-semibold">Install the GPBM app</p>
          <p className="mt-0.5 text-sm leading-5 text-muted">Opens faster, full screen, from your home screen like any app.</p>
        </div>
      </div>
      {current === "prompt" ? (
        <div className="mt-3 flex gap-2">
          <button className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white" onClick={install} type="button"><Download className="size-4" /> Install</button>
          <button className="h-11 rounded-xl border border-border bg-card px-4 text-sm font-semibold" onClick={later} type="button">Not now</button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-sm leading-6">In Safari: tap <Share aria-label="Share" className="inline size-4 align-text-bottom" /> <b>Share</b> at the bottom, then <b>Add to Home Screen</b>, then <b>Add</b>.</p>
          <div className="flex gap-2">
            <button className="h-11 flex-1 rounded-xl bg-primary px-4 text-sm font-semibold text-white" onClick={done} type="button">I&apos;ve added it</button>
            <button className="h-11 rounded-xl border border-border bg-card px-4 text-sm font-semibold" onClick={later} type="button">Not now</button>
          </div>
        </div>
      )}
    </section>
  );
}

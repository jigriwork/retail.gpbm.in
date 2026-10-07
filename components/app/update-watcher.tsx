"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import packageJson from "@/package.json";

const CHECK_EVERY_MS = 5 * 60_000;

/** Something is being typed: a reload would lose it. */
function busyTyping() {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && !["button", "checkbox", "radio", "submit"].includes(active.type))) {
    return active.value.trim().length > 0;
  }
  return false;
}

/**
 * Keeps every phone on the latest version: when the app is opened or brought
 * back (and every 5 minutes while in use) it asks the server for the live
 * version and reloads itself if a newer one is out. If something is being
 * typed it shows an "update" bar instead, so nothing is lost.
 */
export function UpdateWatcher() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let checking = false;
    async function check() {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const { version } = (await response.json()) as { version?: string };
        if (!version || version === packageJson.version) return;
        // Never loop: reload at most once per new version in this tab.
        const key = `gpbm-reloaded-${version}`;
        if (window.sessionStorage.getItem(key)) return;
        if (busyTyping()) { setReady(true); return; }
        window.sessionStorage.setItem(key, "1");
        window.location.reload();
      } catch { /* offline: try again later */ } finally { checking = false; }
    }
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    void check();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  if (!ready) return null;
  return (
    <button
      className="fixed inset-x-3 bottom-[max(env(safe-area-inset-bottom),5.5rem)] z-50 mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-xl"
      onClick={() => window.location.reload()}
      type="button"
    >
      <RefreshCw className="size-4" /> New version ready: tap to update
    </button>
  );
}

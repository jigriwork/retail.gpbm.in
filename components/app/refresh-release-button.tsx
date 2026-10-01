"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

export function RefreshReleaseButton() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function refreshApp() {
    setIsRefreshing(true);

    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(registrations.map((registration) => registration.update()));
      }
    } finally {
      window.location.reload();
    }
  }

  return (
    <button
      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-deep disabled:opacity-60"
      disabled={isRefreshing}
      onClick={refreshApp}
      type="button"
    >
      <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
      {isRefreshing ? "Refreshing" : "Refresh app"}
    </button>
  );
}

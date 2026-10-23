"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type RevealPhase = "show" | "exit" | "hidden";

/**
 * A short brand reveal on every full app load. It lives in the root layout so
 * owners, managers, staff and signed-out users all get the same welcome, while
 * client-side navigation stays instant.
 */
export function OpeningReveal() {
  const [phase, setPhase] = useState<RevealPhase>("show");

  useEffect(() => {
    const startExit = window.setTimeout(() => setPhase("exit"), 760);
    const remove = window.setTimeout(() => setPhase("hidden"), 1080);
    return () => {
      window.clearTimeout(startExit);
      window.clearTimeout(remove);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden="true"
      className={`app-opening-reveal pointer-events-none fixed inset-0 z-[100] grid place-items-center overflow-hidden ${phase === "exit" ? "app-opening-reveal-exit" : ""}`}
    >
      <div className="app-opening-orb app-opening-orb-one" />
      <div className="app-opening-orb app-opening-orb-two" />
      <div className="relative flex flex-col items-center">
        <div className="app-opening-logo-wrap relative grid size-24 place-items-center sm:size-28">
          <span className="app-opening-ring app-opening-ring-one" />
          <span className="app-opening-ring app-opening-ring-two" />
          <span className="app-opening-logo-glow" />
          <Image
            alt=""
            className="app-opening-logo relative z-10 rounded-[1.4rem] shadow-2xl sm:rounded-[1.65rem]"
            height={112}
            preload
            src="/icon-192.png"
            width={112}
          />
        </div>

        <svg className="app-opening-chart mt-6" fill="none" height="38" viewBox="0 0 150 38" width="150">
          <path className="app-opening-chart-line" d="M2 32 C18 29 23 22 37 24 S56 31 70 19 S91 22 105 12 S128 15 148 3" />
          <circle className="app-opening-chart-dot" cx="148" cy="3" r="3" />
        </svg>

        <p className="app-opening-title mt-3 font-display text-2xl font-bold tracking-[-0.03em] text-white sm:text-3xl">
          GPBM Retail
        </p>
        <p className="app-opening-caption mt-1 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-white/65">
          Sales · Stock · Team
        </p>
      </div>
    </div>
  );
}

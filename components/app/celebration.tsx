"use client";

import { useEffect, useState } from "react";

const colours = ["#4338CA", "#F59E0B", "#10B981", "#EC4899", "#3B82F6", "#F97316"];

/**
 * A short confetti burst, shown once per browser for each `id` (e.g. one
 * store's checklist for one day). Hidden for "reduce motion" and when
 * browser storage is unavailable it simply plays once per page view.
 */
export function Celebration({ id }: { id: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const key = `gpbm-celebrated:${id}`;
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      // Storage blocked: still celebrate this view.
    }
    // Starts after the page's entrance animation, so it covers the whole screen.
    const start = window.setTimeout(() => setShow(true), 450);
    const stop = window.setTimeout(() => setShow(false), 3650);
    return () => { window.clearTimeout(start); window.clearTimeout(stop); };
  }, [id]);

  if (!show) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 48 }, (_, index) => {
        const left = (index * 37) % 100;
        const style = {
          "--delay": `${(index % 12) * 0.06}s`,
          "--drift": `${((index * 53) % 120) - 60}px`,
          "--fall": `${2 + (index % 5) * 0.25}s`,
          "--spin": `${360 + (index % 4) * 180}deg`,
          backgroundColor: colours[index % colours.length],
          left: `${left}%`,
        } as React.CSSProperties;
        return <span className={`confetti-piece absolute top-0 block ${index % 3 ? "h-3 w-1.5" : "size-2 rounded-full"}`} key={index} style={style} />;
      })}
    </div>
  );
}

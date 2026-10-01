"use client";

import { useEffect } from "react";

// Publishes the app bar and bottom bar heights as CSS variables, so full-screen
// views (Tia's chat) can sit exactly between them on any phone or screen size.
export function ChromeMeasure() {
  useEffect(() => {
    const root = document.documentElement;
    const header = document.getElementById("app-header");
    const nav = document.getElementById("app-bottom-nav");
    const measure = () => {
      if (header) root.style.setProperty("--app-header-h", `${header.offsetHeight}px`);
      if (nav) root.style.setProperty("--app-nav-h", `${nav.offsetHeight}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (header) observer.observe(header);
    if (nav) observer.observe(nav);
    return () => observer.disconnect();
  }, []);
  return null;
}

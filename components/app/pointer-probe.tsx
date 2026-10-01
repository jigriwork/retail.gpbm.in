"use client";

import { useEffect } from "react";

import { pointerCookie } from "@/lib/auth/access";

/** Records whether this device is touch-first so the server can lay pages out for it. */
export function PointerProbe() {
  useEffect(() => {
    const value = window.matchMedia("(pointer: coarse)").matches ? "c" : "f";
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${pointerCookie}=${value}; path=/; max-age=31536000; samesite=lax${secure}`;
  }, []);
  return null;
}

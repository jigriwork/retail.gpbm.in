"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { markNotificationsRead } from "@/lib/notifications/actions";

/** Opening the inbox marks everything read (the 🔔 count updates). */
export function MarkRead() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setTimeout(() => { void markNotificationsRead().then(() => router.refresh()).catch(() => undefined); }, 1500);
    return () => window.clearTimeout(timer);
  }, [router]);
  return null;
}

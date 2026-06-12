"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils/cn";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Kolkata",
});

const compactTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export function LiveClock({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className={cn("text-right text-xs leading-5 text-muted", className)}>
      <p className={compact ? "hidden sm:block" : undefined}>
        {now ? dateFormatter.format(now) : "\u00a0"}
      </p>
      <p className="font-semibold text-foreground">
        {now ? (compact ? compactTimeFormatter.format(now) : timeFormatter.format(now)) : "\u00a0"}
      </p>
    </div>
  );
}

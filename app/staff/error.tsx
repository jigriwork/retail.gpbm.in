"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { isOutdatedApp, reloadForUpdate } from "@/lib/app-version/outdated";

export default function DataError({ error, reset }: { error: Error; reset: () => void }) {
  // A new version went live while this screen was open: load it.
  useEffect(() => { if (isOutdatedApp(error)) reloadForUpdate(); }, [error]);
  return (
    <div className="mx-auto max-w-xl rounded-[1.35rem] border border-border bg-card p-6 shadow-sm" role="alert">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <TriangleAlert className="size-5" />
      </span>
      <h1 className="mt-4 text-xl font-semibold">This page could not load completely</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        The internet was slow or the database was busy. You are still logged in. Totals and recommendations are hidden
        so you never act on partial numbers. Please try again.
      </p>
      <button
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-deep"
        onClick={reset}
        type="button"
      >
        <RotateCcw className="size-4" /> Try again
      </button>
    </div>
  );
}

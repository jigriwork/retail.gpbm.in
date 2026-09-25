import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import { getCurrentProfile } from "@/lib/auth/session";

type SafeMetric = {
  operation: string;
  requestId: string;
  roleClass: "anonymous" | "manager" | "owner" | "other";
  durationMs: number;
  payloadBytes: number;
  rowCount: number | null;
  status: "error" | "ok";
};

function emit(metric: SafeMetric) {
  console.info(JSON.stringify({ event: "gpbm.performance", ...metric }));
}

const getPerformanceContext = cache(async () => {
  const [headerStore, profile] = await Promise.all([headers(), getCurrentProfile()]);
  const role = profile?.role;
  return {
    requestId: headerStore.get("x-request-id") ?? headerStore.get("x-vercel-id") ?? crypto.randomUUID(),
    roleClass: role === "owner" || role === "manager" ? role : profile ? "other" : "anonymous",
  } as const;
});

function safeRowCount(value: unknown): number | null {
  if (Array.isArray(value)) return Array.isArray(value[0]) ? value[0].length : value.length;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const reconciliation = record.reconciliation;
  if (reconciliation && typeof reconciliation === "object") {
    const count = Number((reconciliation as Record<string, unknown>).source_row_count);
    if (Number.isFinite(count)) return count;
  }
  const summary = record.summary;
  if (summary && typeof summary === "object") {
    const count = Number((summary as Record<string, unknown>).row_count);
    if (Number.isFinite(count)) return count;
  }
  return Array.isArray(record.stores) ? record.stores.length : null;
}

export async function measureDataOperation<T>(operation: string, load: () => Promise<T>): Promise<T> {
  const context = await getPerformanceContext();
  const started = performance.now();

  try {
    const value = await load();
    emit({
      operation,
      ...context,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
      payloadBytes: Buffer.byteLength(JSON.stringify(value ?? null)),
      rowCount: safeRowCount(value),
      status: "ok",
    });
    return value;
  } catch (error) {
    emit({
      operation,
      ...context,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
      payloadBytes: 0,
      rowCount: null,
      status: "error",
    });
    throw error;
  }
}

export async function recordShadowComparison(operation: string, matches: boolean) {
  console.info(JSON.stringify({ event: "gpbm.analytics_shadow", ...(await getPerformanceContext()), operation, matches }));
}

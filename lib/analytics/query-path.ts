import "server-only";

export type AnalyticsQueryPath = "legacy" | "shadow" | "v2";

export function getAnalyticsQueryPath(): AnalyticsQueryPath {
  const value = process.env.ANALYTICS_QUERY_PATH;
  return value === "shadow" || value === "v2" ? value : "legacy";
}

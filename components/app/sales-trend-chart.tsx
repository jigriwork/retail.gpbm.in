"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils/cn";

// Indigo first, then marigold (darkened so the line reads on white), then teal and rose.
export const storeSeriesColors = ["#4338CA", "#C97C0A", "#0F766E", "#C2334D", "#7C3AED"];

export type TrendSeries = {
  name: string;
  points: Array<{ date: string; sale: number | null }>;
};

const ranges = [7, 14, 30] as const;

function compactMoney(value: number) {
  if (value >= 100000) return `₹${(value / 100000).toFixed(value >= 1000000 ? 1 : 2)}L`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}K`;
  return `₹${Math.round(value)}`;
}

function fullMoney(value: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(
    new Date(`${date}T00:00:00+05:30`),
  );
}

/** Net sales per day for each store, from reports the page already loaded. */
export function SalesTrendChart({ series }: { series: TrendSeries[] }) {
  const [range, setRange] = useState<(typeof ranges)[number]>(14);
  const dates = series[0]?.points.slice(-range).map((point) => point.date) ?? [];
  const rows = dates.map((date) => {
    const row: Record<string, number | string | null> = { date };
    for (const item of series) row[item.name] = item.points.find((point) => point.date === date)?.sale ?? null;
    return row;
  });
  const totals = series.map((item) =>
    item.points.slice(-range).reduce((sum, point) => sum + (point.sale ?? 0), 0),
  );
  const hasData = totals.some((total) => total > 0);

  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-xl font-semibold">Sales trend</h2>
        <div className="flex rounded-full bg-background p-1" role="group" aria-label="Date range">
          {ranges.map((value) => (
            <button
              aria-pressed={range === value}
              className={cn(
                "h-8 min-w-11 rounded-full px-3 text-xs font-semibold text-muted transition",
                range === value && "bg-card text-foreground shadow-sm",
              )}
              key={value}
              onClick={() => setRange(value)}
              type="button"
            >
              {value}D
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {series.map((item, index) => (
          <div key={item.name}>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span className="h-[3px] w-3 rounded-full" style={{ background: storeSeriesColors[index % storeSeriesColors.length] }} />
              {item.name}
            </p>
            <p className="font-display text-lg font-bold tabular-nums">{fullMoney(totals[index])}</p>
          </div>
        ))}
      </div>

      {hasData ? (
        <div className="mt-3 h-48 sm:h-56">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart data={rows} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
              <defs>
                {series.map((item, index) => (
                  <linearGradient id={`trend-${index}`} key={item.name} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={storeSeriesColors[index % storeSeriesColors.length]} stopOpacity={0.16} />
                    <stop offset="100%" stopColor={storeSeriesColors[index % storeSeriesColors.length]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="#ECEBF3" strokeDasharray="3 4" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="date"
                interval="preserveStartEnd"
                minTickGap={24}
                tick={{ fill: "#8C8AA3", fontSize: 11 }}
                tickFormatter={shortDate}
                tickLine={false}
              />
              <YAxis axisLine={false} tick={{ fill: "#8C8AA3", fontSize: 11 }} tickFormatter={compactMoney} tickLine={false} width={48} />
              <Tooltip
                contentStyle={{ border: "1px solid #E7E6F0", borderRadius: 12, boxShadow: "0 6px 20px rgb(23 22 46 / 0.08)", fontSize: 12 }}
                formatter={(value) => (typeof value === "number" ? fullMoney(value) : "Not uploaded")}
                labelFormatter={(label) => shortDate(String(label))}
              />
              {series.map((item, index) => (
                <Area
                  activeDot={{ r: 5, strokeWidth: 2 }}
                  connectNulls={false}
                  dataKey={item.name}
                  dot={false}
                  fill={`url(#trend-${index})`}
                  key={item.name}
                  stroke={storeSeriesColors[index % storeSeriesColors.length]}
                  strokeWidth={2.5}
                  type="monotone"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-background px-4 py-6 text-center text-sm text-muted">
          No sales uploaded in the last {range} days yet.
        </p>
      )}
      <p className="mt-2 text-xs text-muted">Net sale per day from uploaded sales reports. Gaps are days with no upload.</p>
    </section>
  );
}

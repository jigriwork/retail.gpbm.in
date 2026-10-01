"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function compactMoney(value: number) {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}K`;
  return `₹${Math.round(value)}`;
}

function fullMoney(value: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function shortDate(date: string) {
  const parsed = new Date(`${date}T00:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(parsed);
}

/** Net sale per day for the selected period; the best day is drawn in marigold. */
export function DailySalesBars({ points }: { points: Array<{ date: string; totalSale: number }> }) {
  if (!points.length) return null;
  const best = Math.max(...points.map((point) => point.totalSale));

  return (
    <div className="h-52">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={points} margin={{ bottom: 0, left: 0, right: 4, top: 8 }}>
          <CartesianGrid stroke="#ECEBF3" strokeDasharray="3 4" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="date"
            interval="preserveStartEnd"
            minTickGap={20}
            tick={{ fill: "#8C8AA3", fontSize: 11 }}
            tickFormatter={shortDate}
            tickLine={false}
          />
          <YAxis axisLine={false} tick={{ fill: "#8C8AA3", fontSize: 11 }} tickFormatter={compactMoney} tickLine={false} width={48} />
          <Tooltip
            contentStyle={{ border: "1px solid #E7E6F0", borderRadius: 12, fontSize: 12 }}
            cursor={{ fill: "#EEEDFC" }}
            formatter={(value) => [typeof value === "number" ? fullMoney(value) : String(value), "Net sale"]}
            labelFormatter={(label) => shortDate(String(label))}
          />
          <Bar
            dataKey="totalSale"
            radius={[6, 6, 0, 0]}
            shape={(props: { x?: number; y?: number; width?: number; height?: number; payload?: { totalSale: number } }) => (
              <rect
                fill={props.payload?.totalSale === best ? "#F4A938" : "#4338CA"}
                height={Math.max(props.height ?? 0, 0)}
                rx={5}
                width={props.width}
                x={props.x}
                y={props.y}
              />
            )}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

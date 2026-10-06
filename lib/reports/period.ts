import { addDays, getIndiaMonthStart, getIndiaToday, previousMonthRange, weekStartOf } from "@/lib/tasks/dates";

export type RangePreset = "today" | "yesterday" | "week" | "last7" | "month" | "last-month" | "last30";
export type PickedRange = { endDate: string; preset: RangePreset | null; startDate: string };

export const rangePresets: Array<{ label: string; value: RangePreset }> = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This week", value: "week" },
  { label: "Last 7 days", value: "last7" },
  { label: "This month", value: "month" },
  { label: "Last month", value: "last-month" },
  { label: "Last 30 days", value: "last30" },
];

export function presetRange(preset: RangePreset, today = getIndiaToday()) {
  switch (preset) {
    case "today": return { endDate: today, startDate: today };
    case "yesterday": return { endDate: addDays(today, -1), startDate: addDays(today, -1) };
    case "week": return { endDate: today, startDate: weekStartOf(today) };
    case "last7": return { endDate: addDays(today, -1), startDate: addDays(today, -7) };
    case "last-month": return previousMonthRange(today);
    case "last30": return { endDate: addDays(today, -1), startDate: addDays(today, -30) };
    default: return { endDate: today, startDate: getIndiaMonthStart(today) };
  }
}

const isDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));

/**
 * The period a page shows: chosen dates win (From/To), else a quick choice
 * (?period=…), else the page's default. Dates are put in order, never after
 * today and at most `maxDays` long.
 */
export function resolveRange(
  params: { end?: string; period?: string; start?: string },
  fallback: RangePreset,
  { maxDays = 400, today = getIndiaToday() }: { maxDays?: number; today?: string } = {},
): PickedRange {
  let range: { endDate: string; startDate: string };
  if (isDate(params.start) || isDate(params.end)) {
    const start = isDate(params.start) ? params.start! : params.end!;
    const end = isDate(params.end) ? params.end! : params.start!;
    range = start <= end ? { endDate: end, startDate: start } : { endDate: start, startDate: end };
  } else {
    const preset = rangePresets.find((item) => item.value === params.period)?.value ?? fallback;
    range = presetRange(preset, today);
  }
  if (range.endDate > today) range.endDate = today;
  if (range.startDate > range.endDate) range.startDate = range.endDate;
  if (range.startDate < addDays(range.endDate, -maxDays)) range.startDate = addDays(range.endDate, -maxDays);
  const preset = rangePresets.find((item) => {
    const candidate = presetRange(item.value, today);
    return candidate.startDate === range.startDate && candidate.endDate === range.endDate;
  })?.value ?? null;
  return { ...range, preset };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "6 Oct 2026", or "1 – 6 Oct 2026" / "28 Sep – 4 Oct 2026" for a range. */
export function rangeLabel({ endDate, startDate }: { endDate: string; startDate: string }) {
  const part = (date: string, year: boolean) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}${year ? ` ${date.slice(0, 4)}` : ""}`;
  if (startDate === endDate) return part(endDate, true);
  if (startDate.slice(0, 7) === endDate.slice(0, 7)) return `${Number(startDate.slice(8, 10))} – ${part(endDate, true)}`;
  return `${part(startDate, startDate.slice(0, 4) !== endDate.slice(0, 4))} – ${part(endDate, true)}`;
}

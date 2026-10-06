const indiaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Kolkata",
  year: "numeric",
});

function formatIndiaDate(date: Date) {
  return indiaDateFormatter.format(date);
}

export function getIndiaToday() {
  return formatIndiaDate(new Date());
}

// Calendar maths on "YYYY-MM-DD" text in UTC, so the answer is the same on
// any server clock (Vercel runs in UTC; local-time Date getters gave the
// previous day for India's midnight).
function calendarDate(dateText: string) {
  const [year, month, day] = dateText.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function calendarText(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(dateText: string, days: number) {
  const date = calendarDate(dateText);
  date.setUTCDate(date.getUTCDate() + days);
  return calendarText(date);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(dateText: string) {
  return calendarDate(dateText).getUTCDay();
}

/** Monday of the week the date is in. */
export function weekStartOf(dateText: string) {
  const day = weekdayOf(dateText);
  return addDays(dateText, day === 0 ? -6 : 1 - day);
}

/** Last day of the date's month. */
export function monthEndOf(dateText: string) {
  const [year, month] = dateText.slice(0, 7).split("-").map(Number);
  return calendarText(new Date(Date.UTC(year, month, 0)));
}

/** First and last day of the month before the date's month. */
export function previousMonthRange(dateText: string) {
  const endDate = addDays(`${dateText.slice(0, 7)}-01`, -1);
  return { endDate, startDate: `${endDate.slice(0, 7)}-01` };
}

export function getIndiaTomorrow() {
  return addDays(getIndiaToday(), 1);
}

export function isMondayInIndia(dateText = getIndiaToday()) {
  return weekdayOf(dateText) === 1;
}

export function getIndiaDayOfMonth(dateText = getIndiaToday()) {
  return Number(dateText.slice(8, 10));
}

export function getIndiaMonthStart(dateText = getIndiaToday()) {
  return `${dateText.slice(0, 7)}-01`;
}

export function getIndiaMonthInputValue(dateText = getIndiaToday()) {
  return dateText.slice(0, 7);
}

/** Salary processed this month normally belongs to the previous calendar month. */
export function getPreviousIndiaMonthInputValue(dateText = getIndiaToday()) {
  const [year, month] = getIndiaMonthInputValue(dateText).split("-").map(Number);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
}

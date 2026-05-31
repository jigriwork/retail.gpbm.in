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

export function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00+05:30`);
  date.setDate(date.getDate() + days);
  return formatIndiaDate(date);
}

export function getIndiaTomorrow() {
  return addDays(getIndiaToday(), 1);
}

export function isMondayInIndia(dateText = getIndiaToday()) {
  const date = new Date(`${dateText}T00:00:00+05:30`);
  return date.getDay() === 1;
}

export function getIndiaDayOfMonth(dateText = getIndiaToday()) {
  return Number(dateText.slice(8, 10));
}

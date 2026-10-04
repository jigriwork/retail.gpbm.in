const monthNumbers: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
  apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
  aug: "08", august: "08", sep: "09", sept: "09", september: "09", oct: "10", october: "10",
  nov: "11", november: "11", dec: "12", december: "12",
};

/** Detect an explicit month and four-digit year in a payroll filename. */
export function salaryMonthFromFileName(fileName: string) {
  const name = fileName.toLowerCase().replace(/\.[^.]+$/, "").replace(/[_]+/g, " ");
  const yearFirst = name.match(/\b(20\d{2})[\s-]+(0?[1-9]|1[0-2])\b/);
  if (yearFirst) return `${yearFirst[1]}-${yearFirst[2].padStart(2, "0")}`;
  const monthFirst = name.match(/\b(0?[1-9]|1[0-2])[\s-]+(20\d{2})\b/);
  if (monthFirst) return `${monthFirst[2]}-${monthFirst[1].padStart(2, "0")}`;

  const words = name.match(/[a-z]+|20\d{2}/g) ?? [];
  const year = words.find((word) => /^20\d{2}$/.test(word));
  const month = words.map((word) => monthNumbers[word]).find(Boolean);
  return year && month ? `${year}-${month}` : null;
}

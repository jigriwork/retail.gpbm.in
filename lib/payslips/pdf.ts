import { readFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import { rupeesInWords, slipBrand, slipFooter, slipLines } from "@/lib/payslips/layout";
import { formatMonth } from "@/lib/payslips/utils";
import type { Tables } from "@/lib/supabase/database.types";

export type PayslipRow = Tables<"payslip_rows">;

// Helvetica cannot draw the rupee sign, so amounts read "Rs 12,345".
function money(value: number) {
  const amount = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
  return `Rs ${amount}`;
}

const ink = rgb(0.09, 0.1, 0.15);
const muted = rgb(0.42, 0.44, 0.5);
const line = rgb(0.85, 0.86, 0.89);
const soft = rgb(0.96, 0.96, 0.98);
const accent = rgb(0.22, 0.19, 0.64);

async function logoImage(pdf: PDFDocument, logo: string | null): Promise<PDFImage | null> {
  if (!logo) return null;
  try {
    return await pdf.embedPng(await readFile(path.join(process.cwd(), "public", logo)));
  } catch {
    return null;
  }
}

function text(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size: number, color = ink) {
  page.drawText(value, { color, font, size, x, y });
}

function rightText(page: PDFPage, value: string, right: number, y: number, font: PDFFont, size: number, color = ink) {
  page.drawText(value, { color, font, size, x: right - font.widthOfTextAtSize(value, size), y });
}

export async function renderPayslipPdf(row: PayslipRow) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = slipBrand(row);
  const lines = slipLines(row);
  const left = 48;
  const right = page.getWidth() - 48;
  const month = formatMonth(row.salary_month);

  // Header: logo, store, and the slip title.
  const logo = await logoImage(pdf, brand.logo);
  let top = 790;
  if (logo) {
    const height = 52;
    const width = (logo.width / logo.height) * height;
    page.drawImage(logo, { height, width, x: left, y: top - height });
  } else {
    text(page, brand.name || "Salary slip", left, top - 30, bold, 20);
  }
  rightText(page, "SALARY SLIP", right, top - 18, bold, 18, accent);
  rightText(page, month, right, top - 36, regular, 11, muted);
  top -= 72;
  if (brand.legalName) text(page, brand.legalName, left, top, bold, 10.5);
  const contact = [brand.address, brand.gstin ? `GSTIN ${brand.gstin}` : ""].filter(Boolean).join("  |  ");
  if (contact) text(page, contact, left, top - 14, regular, 9.5, muted);
  top -= 30;
  page.drawLine({ color: line, end: { x: right, y: top }, start: { x: left, y: top }, thickness: 1 });

  // Employee details.
  top -= 26;
  const details: Array<[string, string]> = [
    ["Employee", row.staff_name ?? "—"],
    ["Store", row.store_name ?? brand.name],
    ["Salary month", month],
    ["Days in month", String(row.divided_by_days ?? "—")],
  ];
  details.forEach(([label, value], index) => {
    const x = index % 2 === 0 ? left : left + (right - left) / 2;
    const y = top - Math.floor(index / 2) * 34;
    text(page, label.toUpperCase(), x, y, bold, 7.5, muted);
    text(page, value, x, y - 14, bold, 11.5);
  });
  top -= 84;

  // Earnings and deductions side by side.
  const gap = 18;
  const columnWidth = (right - left - gap) / 2;
  const rowHeight = 24;
  const tableRows = Math.max(lines.earnings.length, lines.deductions.length, 1);
  const tableHeight = rowHeight * (tableRows + 2);
  for (const [index, [title, entries, total]] of ([
    ["Earnings", lines.earnings, lines.totalEarnings],
    ["Deductions", lines.deductions, lines.totalDeductions],
  ] as const).entries()) {
    const x = left + index * (columnWidth + gap);
    page.drawRectangle({ borderColor: line, borderWidth: 1, height: tableHeight, width: columnWidth, x, y: top - tableHeight });
    page.drawRectangle({ color: soft, height: rowHeight, width: columnWidth, x, y: top - rowHeight });
    text(page, title.toUpperCase(), x + 12, top - 16, bold, 8.5, muted);
    rightText(page, "AMOUNT", x + columnWidth - 12, top - 16, bold, 8.5, muted);
    entries.forEach(([label, value], row) => {
      const y = top - rowHeight * (row + 2) + 8;
      text(page, label, x + 12, y, regular, 10.5);
      rightText(page, money(value), x + columnWidth - 12, y, regular, 10.5);
    });
    if (!entries.length) text(page, "None", x + 12, top - rowHeight * 2 + 8, regular, 10.5, muted);
    const totalY = top - tableHeight;
    page.drawLine({ color: line, end: { x: x + columnWidth, y: totalY + rowHeight }, start: { x, y: totalY + rowHeight }, thickness: 1 });
    text(page, `Total ${title.toLowerCase()}`, x + 12, totalY + 8, bold, 10.5);
    rightText(page, money(total), x + columnWidth - 12, totalY + 8, bold, 10.5);
  }
  top -= tableHeight + 24;

  // Net payable.
  page.drawRectangle({ color: accent, height: 64, width: right - left, x: left, y: top - 64 });
  text(page, "NET PAYABLE", left + 16, top - 24, bold, 9.5, rgb(0.85, 0.85, 1));
  text(page, rupeesInWords(lines.net), left + 16, top - 44, regular, 9.5, rgb(1, 1, 1));
  rightText(page, money(lines.net), right - 16, top - 40, bold, 22, rgb(1, 1, 1));

  // Footer.
  const generated = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date());
  page.drawLine({ color: line, end: { x: right, y: 92 }, start: { x: left, y: 92 }, thickness: 1 });
  text(page, slipFooter, left, 74, bold, 9.5);
  text(page, `Generated on ${generated} by GPBM Retail.`, left, 59, regular, 8.5, muted);

  return pdf.save();
}

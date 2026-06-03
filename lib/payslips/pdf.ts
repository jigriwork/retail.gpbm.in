import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

import type { Tables } from "@/lib/supabase/database.types";
import { formatMonth, storePayslipHeading } from "@/lib/payslips/utils";

export type PayslipRow = Tables<"payslip_rows">;

function drawCenteredText({
  page,
  text,
  y,
  font,
  size,
}: {
  page: Parameters<PDFDocument["addPage"]>[0] extends never ? never : ReturnType<PDFDocument["addPage"]>;
  text: string;
  y: number;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  size: number;
}) {
  const width = page.getWidth();
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    font,
    size,
    x: (width - textWidth) / 2,
    y,
  });
}

function formatPdfMoney(value?: number | null) {
  const amount = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value ?? 0) ? 0 : 2,
  }).format(value ?? 0);

  return `Rs ${amount}`;
}

function tableRows(row: PayslipRow) {
  const rows = [
    ["Firm", row.firm_name],
    ["Store Name", row.store_name],
    ["Salary Month", formatMonth(row.salary_month)],
    ["Name", row.staff_name ?? ""],
    ["Salary Amount", formatPdfMoney(row.salary_amount)],
    ["Divided by Days", formatPdfMoney(row.divided_by_days)],
    ["Absent Days", String(row.abs_days ?? 0)],
    ["Absent Amount", formatPdfMoney(row.abs_amount)],
  ];

  if ((row.sunday_present ?? 0) > 0 || (row.sunday_pay_amount ?? 0) > 0) {
    rows.push(
      ["Sunday Pay Rate", formatPdfMoney(row.sunday_pay)],
      ["Sunday Present", String(row.sunday_present ?? 0)],
      ["Sunday Pay Amount", formatPdfMoney(row.sunday_pay_amount)],
    );
  }

  rows.push(
    ["Advance Deduction", formatPdfMoney(row.advance)],
    ["Commission", formatPdfMoney(row.commission)],
    ["Net Payable", formatPdfMoney(row.net_payable)],
  );

  return rows;
}

export async function renderPayslipPdf(row: PayslipRow) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = page.getWidth();
  const black = rgb(0, 0, 0);
  const red = rgb(0.78, 0.05, 0.05);
  const border = rgb(0.12, 0.12, 0.12);
  const labelFill = rgb(0.92, 0.92, 0.92);

  drawCenteredText({
    font: bold,
    page,
    size: 19,
    text: storePayslipHeading(row.store_name),
    y: 780,
  });
  drawCenteredText({
    font: regular,
    page,
    size: 12,
    text: `${row.store_name} | ${formatMonth(row.salary_month)}`,
    y: 758,
  });

  const tableWidth = 440;
  const left = (width - tableWidth) / 2;
  const labelWidth = 170;
  const rowHeight = 31;
  let top = 710;

  for (const [label, value] of tableRows(row)) {
    const y = top - rowHeight;

    page.drawRectangle({
      borderColor: border,
      borderWidth: 1,
      color: labelFill,
      height: rowHeight,
      width: labelWidth,
      x: left,
      y,
    });
    page.drawRectangle({
      borderColor: border,
      borderWidth: 1,
      height: rowHeight,
      width: tableWidth - labelWidth,
      x: left + labelWidth,
      y,
    });
    page.drawText(label, {
      color: red,
      font: bold,
      size: 10.5,
      x: left + 12,
      y: y + 10,
    });
    page.drawText(String(value ?? ""), {
      color: black,
      font: regular,
      size: 10.5,
      x: left + labelWidth + 12,
      y: y + 10,
    });

    top = y;
  }

  const footerY = 95;
  const footer = "Prepared By __________ | Verified By __________ | Received By __________";
  drawCenteredText({ font: regular, page, size: 10.5, text: footer, y: footerY });

  return pdf.save();
}

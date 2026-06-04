import { formatMoney, formatMonth } from "@/lib/payslips/utils";

type ProfessionalSalaryMessageInput = {
  absAmount?: number | null;
  absDays?: number | null;
  advance?: number | null;
  commission?: number | null;
  dividedByDays?: number | null;
  firmName?: string | null;
  netPayable?: number | null;
  salaryAmount?: number | null;
  salaryMonth: string;
  staffName: string;
  storeName: string;
  sundayPay?: number | null;
  sundayPayAmount?: number | null;
  sundayPresent?: number | null;
};

export function payslipWhatsAppMessage({
  salaryMonth,
  staffName,
  storeName,
}: {
  salaryMonth: string;
  staffName: string;
  storeName: string;
}) {
  return `Hi ${staffName}, your salary slip for ${formatMonth(salaryMonth)} is ready.

Please download or view the PDF salary slip shared separately.

Regards,
${storeName}`;
}

export function whatsAppLink(whatsappPhone: string, message: string) {
  return `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;
}

export function professionalSalaryWhatsAppMessage({
  absAmount,
  absDays,
  advance,
  commission,
  dividedByDays,
  firmName,
  netPayable,
  salaryAmount,
  salaryMonth,
  staffName,
  storeName,
  sundayPay,
  sundayPayAmount,
  sundayPresent,
}: ProfessionalSalaryMessageInput) {
  const sundayLines =
    (sundayPresent ?? 0) > 0 || (sundayPayAmount ?? 0) > 0
      ? [
          `Sunday Pay Rate: ${formatMoney(sundayPay)}`,
          `Sunday Present: ${sundayPresent ?? 0}`,
          `Sunday Pay Amount: ${formatMoney(sundayPayAmount)}`,
        ]
      : [];

  return [
    `Hi ${staffName},`,
    "",
    `Your salary slip for ${formatMonth(salaryMonth)} is ready.`,
    "",
    `Firm: ${firmName || storeName}`,
    `Store Name: ${storeName}`,
    `Salary Month: ${formatMonth(salaryMonth)}`,
    `Name: ${staffName}`,
    "",
    `Salary Amount: ${formatMoney(salaryAmount)}`,
    `Divided by Days: ${formatMoney(dividedByDays)}`,
    `Absent Days: ${absDays ?? 0}`,
    `Absent Amount: ${formatMoney(absAmount)}`,
    "",
    ...sundayLines,
    ...(sundayLines.length ? [""] : []),
    `Advance Deduction: ${formatMoney(advance)}`,
    `Commission: ${formatMoney(commission)}`,
    "",
    `Net Payable: ${formatMoney(netPayable)}`,
    "",
    "Please check and confirm once received.",
    "",
    "Regards,",
    storeName,
  ].join("\n");
}

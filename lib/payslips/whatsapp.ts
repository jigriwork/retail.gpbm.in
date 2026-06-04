import { formatMoney, formatMonth } from "@/lib/payslips/utils";

type ProfessionalSalaryMessageInput = {
  absAmount?: number | null;
  absDays?: number | null;
  advance?: number | null;
  commission?: number | null;
  firmName?: string | null;
  netPayable?: number | null;
  salaryAmount?: number | null;
  salaryMonth: string;
  staffName: string;
  storeName: string;
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
  firmName,
  netPayable,
  salaryAmount,
  salaryMonth,
  staffName,
  storeName,
  sundayPayAmount,
  sundayPresent,
}: ProfessionalSalaryMessageInput) {
  const sundayLines =
    (sundayPresent ?? 0) > 0 || (sundayPayAmount ?? 0) > 0
      ? [
          `Sunday Present: ${sundayPresent ?? 0}`,
          `Sunday Pay Amount: ${formatMoney(sundayPayAmount)}`,
        ]
      : [];

  return [
    `Hi ${staffName},`,
    "",
    `Your salary slip for ${formatMonth(salaryMonth)} is ready.`,
    "",
    `Store: ${storeName}`,
    `Firm: ${firmName || storeName}`,
    "",
    `Salary Amount: ${formatMoney(salaryAmount)}`,
    `Absent Days: ${absDays ?? 0}`,
    `Absent Deduction: ${formatMoney(absAmount)}`,
    ...sundayLines,
    `Advance Deduction: ${formatMoney(advance)}`,
    `Commission: ${formatMoney(commission)}`,
    `Net Payable: ${formatMoney(netPayable)}`,
    "",
    "Please check and confirm once received.",
    "",
    "Regards,",
    storeName,
  ].join("\n");
}

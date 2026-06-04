import { formatMonth } from "@/lib/payslips/utils";

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

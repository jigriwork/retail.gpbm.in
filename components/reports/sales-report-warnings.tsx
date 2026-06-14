import {
  salesReportMissingStaffWarningText,
  suspiciousSalesReportWarningText,
} from "@/lib/reports/sales-queries";

export function SuspiciousSalesReportWarning({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-background p-4 ${className}`}>
      <p className="text-sm font-semibold text-danger">Suspicious sales report</p>
      <p className="mt-2 text-sm leading-6 text-muted">{suspiciousSalesReportWarningText}</p>
    </div>
  );
}

export function MissingStaffSalesWarning({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-background p-4 ${className}`}>
      <p className="text-sm font-semibold text-danger">Staff sales warning</p>
      <p className="mt-2 text-sm leading-6 text-muted">{salesReportMissingStaffWarningText}</p>
    </div>
  );
}

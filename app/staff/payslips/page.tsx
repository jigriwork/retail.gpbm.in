import Link from "next/link";

import { PrivatePayslipPanel } from "@/components/staff/private-payslip-panel";
import { SalaryUnlockForm } from "@/components/staff/salary-unlock-form";

export default function MyPayslipsPage() {
  return <div className="min-w-0 space-y-5"><div><p className="text-sm font-medium text-muted">Private documents</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">My Payslips</h1><Link className="mt-2 inline-flex text-sm font-semibold text-muted" href="/staff/salary">View salary breakdown</Link><p className="mt-2 text-xs leading-5 text-muted">Payslips are system-generated and do not require a signature.</p></div><SalaryUnlockForm /><PrivatePayslipPanel /></div>;
}

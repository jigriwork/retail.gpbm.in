import Link from "next/link";

import { PrivatePayslipPanel } from "@/components/staff/private-payslip-panel";
import { SalaryUnlockForm } from "@/components/staff/salary-unlock-form";

export default function MyPayslipsPage() {
  return <div className="space-y-5"><div><p className="text-sm font-medium text-muted">Private documents</p><h1 className="mt-2 text-3xl font-semibold">My Payslips</h1><Link className="mt-2 inline-flex text-sm font-semibold text-muted" href="/staff/salary">View salary breakdown</Link></div><SalaryUnlockForm /><PrivatePayslipPanel /></div>;
}

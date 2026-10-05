import { PrivateSalaryPanel } from "@/components/staff/private-salary-panel";
import { SalaryUnlockForm } from "@/components/staff/salary-unlock-form";

export default function MySalaryPage() {
  return <div className="min-w-0 space-y-5"><div><p className="text-sm font-medium text-muted">Sensitive information</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">My Salary</h1></div><SalaryUnlockForm /><PrivateSalaryPanel /></div>;
}

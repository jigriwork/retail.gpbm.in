import { PrivateSalaryPanel } from "@/components/staff/private-salary-panel";
import { SalaryUnlockForm } from "@/components/staff/salary-unlock-form";

export default function MySalaryPage() {
  return <div className="space-y-5"><div><p className="text-sm font-medium text-muted">Sensitive information</p><h1 className="mt-2 text-3xl font-semibold">My Salary</h1></div><SalaryUnlockForm /><PrivateSalaryPanel /></div>;
}

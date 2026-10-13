import { AccessDenied } from "@/components/app/access-denied";
import { PrivatePayslipPanel } from "@/components/staff/private-payslip-panel";
import { PrivateSalaryPanel } from "@/components/staff/private-salary-panel";
import { SalaryUnlockForm } from "@/components/staff/salary-unlock-form";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Managers and cashiers on the payroll: their own salary and payslips. */
export default async function MySalaryPage() {
  const { profile } = await requireProfile();
  if (!["manager", "cashier"].includes(profile.role)) return <AccessDenied message="My salary is for managers and cashiers on the payroll." />;
  const supabase = await createClient();
  const { data: employeeId } = await supabase.rpc("current_payroll_employee_id");
  if (!employeeId) return <AccessDenied message="Your login is not linked to a salary record yet. Ask the owner." />;
  return (
    <div className="min-w-0 space-y-5">
      <div>
        <p className="text-sm font-medium text-muted">Private</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">My salary</h1>
        <p className="mt-2 text-xs leading-5 text-muted">Only you can see this. Payslips are system-generated and do not need a signature.</p>
      </div>
      <SalaryUnlockForm />
      <PrivateSalaryPanel />
      <h2 className="text-xl font-semibold">Payslips</h2>
      <PrivatePayslipPanel />
    </div>
  );
}

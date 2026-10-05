import { redirect } from "next/navigation";

// Cashiers use the staff list (Employees) like managers; adding needs owner approval.
export default function CashierStaffPage() {
  redirect("/app/employees");
}

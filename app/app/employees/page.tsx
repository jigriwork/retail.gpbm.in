import Link from "next/link";
import { Plus, Search, UserMinus, UserRoundPen } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { SyncStaffButton } from "@/components/employees/sync-staff-button";
import { deactivateEmployeeContact, syncStaffFromPayslips } from "@/lib/employees/actions";
import { getActiveEmployeeStores, getEmployeeContacts } from "@/lib/employees/queries";
import { requireProfile } from "@/lib/auth/session";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ missing?: string; q?: string; store?: string }>;
}) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role)) {
    return <AccessDenied message="Staff phone directory is available to owner and assigned managers." />;
  }

  const { missing = "", q = "", store = "" } = await searchParams;
  const [stores, employees] = await Promise.all([
    getActiveEmployeeStores(profile),
    getEmployeeContacts({ missingOnly: missing === "1", query: q, storeId: store }),
  ]);
  const allowedStoreIds = new Set(stores.map((item) => item.id));
  const selectedStore = allowedStoreIds.has(store) ? store : "";
  const visibleEmployees = employees.filter((employee) =>
    employee.store_id ? allowedStoreIds.has(employee.store_id) : profile.role === "owner",
  );
  const filteredEmployees =
    selectedStore || profile.role === "owner" || stores.length !== 1
      ? visibleEmployees
      : visibleEmployees.filter((employee) => employee.store_id === stores[0]?.id);
  const helperText =
    profile.role === "owner"
      ? "Staff names are auto-created from salary sheet and payslip uploads. Add phone numbers once; future payslips will auto-fill them."
      : "Add or update staff phone numbers for your assigned store. Salary slips and salary details are owner-only.";

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Staff</p>
            <h1 className="mt-2 text-3xl font-semibold">Staff Phone Directory</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              {helperText}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {profile.role === "owner" ? <SyncStaffButton action={syncStaffFromPayslips} /> : null}
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
              href="/app/employees/new"
            >
              <Plus className="size-4" />
              Manual Add Employee
            </Link>
          </div>
        </div>
      </section>

      {!stores.length ? (
        <div className="rounded-[1.35rem] border border-border bg-card p-5 text-sm leading-6 text-muted shadow-sm">
          No store assigned. Please contact owner.
        </div>
      ) : null}

      <form className="grid gap-3 rounded-[1.35rem] border border-border bg-card p-4 shadow-sm md:grid-cols-[1fr_12rem_auto_auto]" action="/app/employees">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            className="h-11 w-full rounded-2xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-foreground"
            defaultValue={q}
            name="q"
            placeholder="Search staff or phone"
          />
        </label>
        <select
          className="h-11 rounded-2xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
          defaultValue={selectedStore}
          name="store"
        >
          <option value="">{profile.role === "owner" ? "All stores" : "All assigned stores"}</option>
          {stores.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-border bg-background px-3 text-sm font-semibold">
          <input className="size-4 accent-black" defaultChecked={missing === "1"} name="missing" type="checkbox" value="1" />
          Missing phones
        </label>
        <button className="h-11 rounded-2xl bg-foreground px-5 text-sm font-semibold text-background" type="submit">
          Filter
        </button>
      </form>

      <section className="grid gap-3">
        {filteredEmployees.length ? (
          filteredEmployees.map((employee) => (
            <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={employee.id}>
              <div className="grid gap-4 md:grid-cols-[1.1fr_0.8fr_1fr_1fr_auto] md:items-center">
                <div>
                  <p className="text-lg font-semibold">{employee.staff_name}</p>
                  <p className="mt-1 text-xs font-medium text-muted">{employee.stores?.name ?? "No store"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted">Phone</p>
                  <p className="mt-1 font-semibold">{employee.phone || "Missing"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted">WhatsApp Number</p>
                  <p className="mt-1 font-semibold">{employee.whatsapp_phone || "Missing"}</p>
                </div>
                <div>
                  <p className={employee.whatsapp_phone ? "text-sm font-semibold text-success" : "text-sm font-semibold text-warning"}>
                    {employee.whatsapp_phone ? "Phone Ready" : "Phone Missing"}
                  </p>
                  <p className={employee.is_active === false ? "mt-1 text-xs font-semibold text-danger" : "mt-1 text-xs font-semibold text-success"}>
                    {employee.is_active === false ? "Inactive" : "Active"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                    href={`/app/employees/${employee.id}`}
                  >
                    <UserRoundPen className="size-4" />
                    Edit Phone
                  </Link>
                  <form action={deactivateEmployeeContact}>
                    <input name="employeeId" type="hidden" value={employee.id} />
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                      type="submit"
                    >
                      <UserMinus className="size-4" />
                      {employee.is_active !== false ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[1.35rem] border border-border bg-card p-5 text-sm text-muted shadow-sm">
            No employees found.
          </div>
        )}
      </section>
    </div>
  );
}

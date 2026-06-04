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
  searchParams: Promise<{ q?: string; store?: string }>;
}) {
  const { profile } = await requireProfile();
  if (profile?.role !== "owner") {
    return <AccessDenied message="Employee phone directory is reserved for the owner account." />;
  }

  const { q = "", store = "" } = await searchParams;
  const [stores, employees] = await Promise.all([
    getActiveEmployeeStores(),
    getEmployeeContacts({ query: q, storeId: store }),
  ]);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Staff</p>
            <h1 className="mt-2 text-3xl font-semibold">Staff Phone Directory</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Staff names are auto-created from salary sheet and payslip uploads. Add phone numbers once; future payslips will auto-fill them.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <SyncStaffButton action={syncStaffFromPayslips} />
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

      <form className="grid gap-3 rounded-[1.35rem] border border-border bg-card p-4 shadow-sm md:grid-cols-[1fr_12rem_auto]" action="/app/employees">
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
          defaultValue={store}
          name="store"
        >
          <option value="">All stores</option>
          {stores.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button className="h-11 rounded-2xl bg-foreground px-5 text-sm font-semibold text-background" type="submit">
          Filter
        </button>
      </form>

      <section className="grid gap-3">
        {employees.length ? (
          employees.map((employee) => (
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
                  {employee.is_active !== false ? (
                    <form action={deactivateEmployeeContact}>
                      <input name="employeeId" type="hidden" value={employee.id} />
                      <button
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                        type="submit"
                      >
                        <UserMinus className="size-4" />
                        Deactivate
                      </button>
                    </form>
                  ) : null}
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

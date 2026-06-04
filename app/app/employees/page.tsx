import Link from "next/link";
import { Plus, Search, UserRoundPen } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
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
            <h1 className="mt-2 text-3xl font-semibold">Employee Directory</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Owner-only phone book for payslip WhatsApp sharing.
            </p>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
            href="/app/employees/new"
          >
            <Plus className="size-4" />
            Add Employee
          </Link>
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
              <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center">
                <div>
                  <p className="text-lg font-semibold">{employee.staff_name}</p>
                  <p className="mt-1 text-xs font-medium text-muted">{employee.stores?.name ?? "No store"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted">Phone</p>
                  <p className="mt-1 font-semibold">{employee.phone || "Missing"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted">WhatsApp-ready number</p>
                  <p className="mt-1 font-semibold">{employee.whatsapp_phone || "Missing"}</p>
                  <p className={employee.is_active === false ? "mt-1 text-xs font-semibold text-danger" : "mt-1 text-xs font-semibold text-success"}>
                    {employee.is_active === false ? "Inactive" : "Active"}
                  </p>
                </div>
                <Link
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                  href={`/app/employees/${employee.id}`}
                >
                  <UserRoundPen className="size-4" />
                  Edit
                </Link>
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

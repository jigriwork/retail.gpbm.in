import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { requireProfile } from "@/lib/auth/session";
import { updateEmployeeContact } from "@/lib/employees/actions";
import { getActiveEmployeeStores, getEmployeeContact } from "@/lib/employees/queries";

export default async function EditEmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ error?: string; returnTo?: string; saved?: string }>;
}) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role)) {
    return <AccessDenied message="Staff phone directory is available to owner and assigned managers." />;
  }

  const { employeeId } = await params;
  const [{ error, returnTo = "", saved }, stores, employee] = await Promise.all([
    searchParams,
    getActiveEmployeeStores(profile),
    getEmployeeContact(employeeId),
  ]);

  if (!employee) {
    notFound();
  }
  if (employee.store_id && !stores.some((store) => store.id === employee.store_id)) {
    return <AccessDenied message="This staff contact is outside your assigned stores." />;
  }
  const backHref = returnTo.startsWith("/app/employees") ? returnTo : "/app/employees";

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href={backHref}>
          Back to Staff Phone Directory
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Edit Employee</h1>
      </div>

      <form action={updateEmployeeContact} className="space-y-4 rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <input name="employeeId" type="hidden" value={employee.id} />
        <input name="returnTo" type="hidden" value={backHref} />
        {saved ? <p className="text-sm font-semibold text-success">Employee saved.</p> : null}
        {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
        <label className="block">
          <span className="text-sm font-semibold">Store</span>
          <select className="mt-2 h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground" defaultValue={employee.store_id ?? ""} name="storeId" required>
            <option value="">Select store</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Staff Name</span>
          <input className="mt-2 h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground" defaultValue={employee.staff_name} name="staffName" required />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Phone Number</span>
          <input className="mt-2 h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground" defaultValue={employee.phone ?? ""} name="phone" inputMode="tel" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Notes</span>
          <textarea className="mt-2 min-h-28 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-foreground" defaultValue={employee.notes ?? ""} name="notes" />
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input className="size-4 accent-black" defaultChecked={employee.is_active !== false} name="isActive" type="checkbox" />
          Active
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="h-11 rounded-2xl bg-foreground px-5 text-sm font-semibold text-background" type="submit">
            Save and Back
          </button>
          <Link className="inline-flex h-11 items-center justify-center rounded-2xl border border-border px-5 text-sm font-semibold transition hover:bg-black/[0.03]" href={backHref}>
            Back
          </Link>
        </div>
      </form>
    </div>
  );
}

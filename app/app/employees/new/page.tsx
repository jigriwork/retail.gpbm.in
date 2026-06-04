import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { requireProfile } from "@/lib/auth/session";
import { createEmployeeContact } from "@/lib/employees/actions";
import { getActiveEmployeeStores } from "@/lib/employees/queries";

export default async function NewEmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role)) {
    return <AccessDenied message="Staff phone directory is available to owner and assigned managers." />;
  }

  const { error } = await searchParams;
  const stores = await getActiveEmployeeStores(profile);
  const singleStore = stores.length === 1 ? stores[0] : null;

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/employees">
          Back to employees
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Add Employee</h1>
      </div>

      <form action={createEmployeeContact} className="space-y-4 rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
        {!stores.length ? (
          <p className="text-sm leading-6 text-muted">No store assigned. Please contact owner.</p>
        ) : null}
        <label className="block">
          <span className="text-sm font-semibold">Store</span>
          <select className="mt-2 h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground" defaultValue={singleStore?.id ?? ""} name="storeId" required>
            <option value="">Select store</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Staff Name</span>
          <input className="mt-2 h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground" name="staffName" required />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Phone Number</span>
          <input className="mt-2 h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground" name="phone" inputMode="tel" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Notes</span>
          <textarea className="mt-2 min-h-28 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-foreground" name="notes" />
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input className="size-4 accent-black" defaultChecked name="isActive" type="checkbox" />
          Active
        </label>
        <button className="h-11 rounded-2xl bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-50" disabled={!stores.length} type="submit">
          Save Employee
        </button>
      </form>
    </div>
  );
}

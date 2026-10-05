import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { requireProfile } from "@/lib/auth/session";
import { ActionForm } from "@/components/accounts/action-form";
import { Field, inputClass } from "@/components/accounts/fields";
import { indiaToday } from "@/lib/accounts/format";
import { requestStaffMember } from "@/lib/cashier/actions";
import { createEmployeeContact } from "@/lib/employees/actions";
import { getActiveEmployeeStores } from "@/lib/employees/queries";

export default async function NewEmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager", "cashier"].includes(profile.role)) {
    return <AccessDenied message="Staff phone directory is available to owner, assigned managers and cashiers." />;
  }

  const { error, returnTo = "" } = await searchParams;
  const stores = await getActiveEmployeeStores(profile);
  // A cashier's new staff go to the owner for approval before they are added.
  if (profile.role === "cashier") {
    return (
      <div className="space-y-5">
        <div>
          <Link className="text-sm font-semibold text-muted" href="/app/employees">Back to staff</Link>
          <h1 className="mt-2 text-3xl font-semibold">Add a staff member</h1>
          <p className="mt-2 text-sm leading-6 text-muted">The owner approves every new staff member before they appear in the staff list and payroll.</p>
        </div>
        {!stores.length ? <p className="text-sm text-muted">No store assigned. Please contact owner.</p> : (
          <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
            <ActionForm action={requestStaffMember} className="grid gap-4 sm:grid-cols-2" submitLabel="Send for approval">
              {stores.length > 1 ? (
                <Field label="Store">
                  <select className={inputClass} name="storeId">{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select>
                </Field>
              ) : <input name="storeId" type="hidden" value={stores[0].id} />}
              <Field label="Full name"><input className={inputClass} name="staffName" required /></Field>
              <Field label="Mobile number"><input className={inputClass} inputMode="tel" name="phone" placeholder="98765 43210" required /></Field>
              <Field label="Designation"><input className={inputClass} name="designation" placeholder="Salesman, Helper, Tailor…" /></Field>
              <Field label="Joining date"><input className={inputClass} defaultValue={indiaToday()} name="joiningDate" type="date" /></Field>
              <div className="sm:col-span-2"><Field label="Note (optional)"><input className={inputClass} name="note" placeholder="Salary agreed, reference…" /></Field></div>
            </ActionForm>
          </section>
        )}
      </div>
    );
  }
  const singleStore = stores.length === 1 ? stores[0] : null;
  const backHref = returnTo.startsWith("/app/employees") ? returnTo : "/app/employees";

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href={backHref}>
          Back to Staff Phone Directory
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Add Employee</h1>
      </div>

      <form action={createEmployeeContact} className="space-y-4 rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <input name="returnTo" type="hidden" value={backHref} />
        {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
        {!stores.length ? (
          <p className="text-sm leading-6 text-muted">No store assigned. Please contact owner.</p>
        ) : null}
        <label className="block">
          <span className="text-sm font-semibold">Store</span>
          <select className="mt-2 h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" defaultValue={singleStore?.id ?? ""} name="storeId" required>
            <option value="">Select store</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Staff Name</span>
          <input className="mt-2 h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" name="staffName" required />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Phone Number</span>
          <input className="mt-2 h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" name="phone" inputMode="tel" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Notes</span>
          <textarea className="mt-2 min-h-28 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary" name="notes" />
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input className="size-4 accent-black" defaultChecked name="isActive" type="checkbox" />
          Active
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="h-11 rounded-2xl bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={!stores.length} type="submit">
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

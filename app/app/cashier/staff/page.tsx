import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Badge, Empty, Field, inputClass, Panel } from "@/components/accounts/fields";
import { indiaToday, shortDate } from "@/lib/accounts/format";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { requestStaffMember } from "@/lib/cashier/actions";
import { createClient } from "@/lib/supabase/server";

export default async function CashierStaffPage() {
  const { profile } = await requireProfile();
  if (profile?.role !== "cashier") return <AccessDenied message="This page is for cashiers. Owners add staff under Employees." />;
  const stores = await getAccessibleStores(profile);
  if (!stores.length) return <AccessDenied message="No store is assigned to you. Ask the owner." />;
  const supabase = await createClient();
  const { data: requests } = await supabase.from("staff_requests").select("id,staff_name,phone,designation,status,requested_at,decision_note,stores(name)")
    .eq("requested_by", profile.id).order("requested_at", { ascending: false }).limit(50);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Staff</p>
        <h1 className="mt-2 text-3xl font-semibold">Add a new staff member</h1>
        <p className="mt-2 text-sm leading-6 text-muted">The owner approves every new staff member before they appear in the staff list and payroll.</p>
      </section>
      <Panel title="New staff member">
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
      </Panel>
      <Panel title="Your requests">
        {requests?.length ? (
          <ul className="space-y-2 text-sm">
            {requests.map((request) => (
              <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-background p-3" key={request.id}>
                <span><span className="font-semibold">{request.staff_name}</span> · {request.designation ?? "Staff"} · {request.stores?.name} · sent {shortDate(request.requested_at.slice(0, 10))}{request.decision_note ? ` · “${request.decision_note}”` : ""}</span>
                <Badge tone={request.status === "approved" ? "good" : request.status === "rejected" ? "bad" : "warn"}>{request.status === "approved" ? "Approved" : request.status === "rejected" ? "Rejected" : "Waiting for owner"}</Badge>
              </li>
            ))}
          </ul>
        ) : <Empty>No requests yet.</Empty>}
      </Panel>
    </div>
  );
}

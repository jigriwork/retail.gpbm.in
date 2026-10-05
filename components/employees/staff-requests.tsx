import { ActionForm } from "@/components/accounts/action-form";
import { inputClass } from "@/components/accounts/fields";
import { shortDate } from "@/lib/accounts/format";
import { decideStaffRequest } from "@/lib/cashier/actions";
import { createClient } from "@/lib/supabase/server";

/** Owner: new staff sent by cashiers, waiting for approval. Renders nothing when none are waiting. */
export async function StaffRequests() {
  const supabase = await createClient();
  const selection = "id,staff_name,phone,designation,joining_date,note,status,requested_at,decided_at,stores(name),profiles!staff_requests_requested_by_fkey(full_name)";
  const [{ data: waiting }, { data: latestDecision }] = await Promise.all([
    supabase.from("staff_requests").select(selection).eq("status", "pending").order("requested_at").limit(50),
    supabase.from("staff_requests").select(selection).neq("status", "pending").order("decided_at", { ascending: false }).limit(1),
  ]);
  const data = [...(waiting ?? []), ...(latestDecision ?? [])];
  if (!data?.length) return null;
  const pending = data.filter((request) => request.status === "pending").length;
  return (
    <section className="rounded-[1.35rem] border border-accent/40 bg-accent-soft p-5 shadow-sm">
      <h2 className="text-xl font-semibold">New staff requests</h2>
      <p className="mt-1 text-sm text-accent-ink">{pending ? `${pending} waiting for approval. ` : ""}Approving adds them to the staff list with their phone, so payslips and staff sales can match them.</p>
      <ul className="mt-4 space-y-3">
        {data.map((request) => (
          <li className="rounded-2xl border border-border bg-card p-4 text-sm" key={request.id}>
            <p className="font-semibold">{request.staff_name} · {request.designation ?? "Staff"} · {request.stores?.name}</p>
            <p className="mt-1 text-muted">
              {request.phone}{request.joining_date ? ` · joining ${shortDate(request.joining_date)}` : ""}{request.note ? ` · ${request.note}` : ""} · sent by {request.profiles?.full_name ?? "—"} on {shortDate(request.requested_at.slice(0, 10))}
            </p>
            {request.status === "pending" ? (
              <div className="mt-3 flex flex-wrap gap-3">
                <ActionForm action={decideStaffRequest} className="flex" submitLabel="Approve">
                  <input name="requestId" type="hidden" value={request.id} />
                  <input name="decision" type="hidden" value="approve" />
                </ActionForm>
                <ActionForm action={decideStaffRequest} className="flex flex-wrap items-end gap-2" submitLabel="Reject" variant="secondary">
                  <input name="requestId" type="hidden" value={request.id} />
                  <input name="decision" type="hidden" value="reject" />
                  <input className={`${inputClass} max-w-60`} name="reason" placeholder="Why" required />
                </ActionForm>
              </div>
            ) : (
              <p className={`mt-3 text-sm font-medium ${request.status === "approved" ? "text-success" : "text-danger"}`} role="status">
                {request.status === "approved" ? `${request.staff_name} added to the staff list.` : `${request.staff_name}'s request was rejected.`}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Cashier: the staff they sent for approval, with the owner's decision. */
export async function MyStaffRequests({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("staff_requests").select("id,staff_name,designation,status,requested_at,decision_note,stores(name)")
    .eq("requested_by", userId).order("requested_at", { ascending: false }).limit(20);
  if (!data?.length) return null;
  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <h2 className="text-xl font-semibold">Staff you added</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {data.map((request) => (
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-background p-3" key={request.id}>
            <span><span className="font-semibold">{request.staff_name}</span> · {request.designation ?? "Staff"} · {request.stores?.name} · sent {shortDate(request.requested_at.slice(0, 10))}{request.decision_note ? ` · “${request.decision_note}”` : ""}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${request.status === "approved" ? "bg-success text-white" : request.status === "rejected" ? "bg-danger text-white" : "bg-accent-soft text-accent-ink"}`}>
              {request.status === "approved" ? "Approved" : request.status === "rejected" ? "Rejected" : "Waiting for owner"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

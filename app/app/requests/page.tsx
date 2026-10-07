import { ActionForm } from "@/components/accounts/action-form";
import { inputClass } from "@/components/accounts/fields";
import { MyRequests, RequestForm } from "@/components/notifications/request-form";
import { requireProfile } from "@/lib/auth/session";
import { answerRequest } from "@/lib/notifications/actions";
import { categoryLabel } from "@/lib/notifications/labels";
import { createClient } from "@/lib/supabase/server";

type Request = { category: string; created_at: string; id: string; message: string; reply: string | null; status: string; store: string | null; writer: string | null; writer_role: string };

export default async function RequestsPage() {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  if (profile.role !== "owner") {
    const { data } = await supabase.rpc("my_team_requests");
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-semibold">Requests to owner</h1>
          <p className="mt-2 text-sm leading-6 text-muted">Stock needed, shop supplies, leave, a problem or an idea: the owner gets a notification and replies.</p>
        </div>
        <RequestForm />
        <h2 className="text-xl font-semibold">My requests</h2>
        <MyRequests items={(data ?? []) as never} />
      </div>
    );
  }
  const { data } = await supabase.rpc("owner_team_requests");
  const requests = (data ?? []) as unknown as Request[];
  const open = requests.filter((item) => item.status === "open");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold">Requests from the team</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{open.length} waiting. Mark done or declined with a short reply: the person gets a notification.</p>
      </div>
      {requests.length ? requests.map((item) => (
        <div className={`rounded-2xl border p-4 shadow-sm ${item.status === "open" ? "border-accent/50 bg-card" : "border-border bg-card opacity-80"}`} key={item.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-semibold">{categoryLabel[item.category] ?? item.category} · {item.writer ?? "Someone"} <span className="text-xs font-medium text-muted">({item.writer_role}{item.store ? `, ${item.store}` : ""})</span></p>
            <span className="text-xs text-muted">{new Date(item.created_at).toLocaleString("en-IN", { day: "numeric", hour: "numeric", minute: "2-digit", month: "short", timeZone: "Asia/Kolkata" })}</span>
          </div>
          <p className="mt-1 whitespace-pre-line text-sm">{item.message}</p>
          {item.status === "open" ? (
            <ActionForm action={answerRequest} className="mt-3 flex flex-wrap items-center gap-2" submitLabel="Send reply" variant="secondary">
              <input name="requestId" type="hidden" value={item.id} />
              <input className={`${inputClass} min-w-48 flex-1`} maxLength={600} name="reply" placeholder="Short reply (optional)" />
              <select className={`${inputClass} w-auto`} defaultValue="done" name="status">
                <option value="done">Done ✅</option>
                <option value="declined">Declined</option>
              </select>
            </ActionForm>
          ) : <p className="mt-2 text-sm text-muted">{item.status === "done" ? "✅ Done" : "Declined"}{item.reply ? `: ${item.reply}` : ""}</p>}
        </div>
      )) : <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">No requests yet.</p>}
    </div>
  );
}

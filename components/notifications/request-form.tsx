import { ActionForm } from "@/components/accounts/action-form";
import { inputClass } from "@/components/accounts/fields";
import { createRequest } from "@/lib/notifications/actions";
import { categoryLabel, requestCategories } from "@/lib/notifications/labels";

/** Write a request to the owners (they get a notification). */
export function RequestForm() {
  return (
    <ActionForm action={createRequest} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm" submitLabel="Send to owner">
      <label className="block text-sm font-medium">About
        <select className={`${inputClass} mt-1`} defaultValue="stock" name="category">
          {requestCategories.map((category) => <option key={category} value={category}>{categoryLabel[category]}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Message
        <textarea className="mt-1 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" maxLength={1000} minLength={3} name="message" placeholder="e.g. Size M of UCB tee is finished, customers are asking" required />
      </label>
    </ActionForm>
  );
}

type Mine = { category: string; created_at: string; id: string; message: string; replied_at: string | null; reply: string | null; status: string };

export function MyRequests({ items }: { items: Mine[] }) {
  if (!items.length) return <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">No requests yet.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li className="rounded-2xl border border-border bg-card p-4 text-sm" key={item.id}>
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">{categoryLabel[item.category] ?? item.category}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${item.status === "done" ? "bg-success/15 text-success" : item.status === "declined" ? "bg-danger/10 text-danger" : "bg-accent-soft text-accent-ink"}`}>{item.status === "open" ? "Waiting" : item.status === "done" ? "Done" : "Declined"}</span>
          </div>
          <p className="mt-1 whitespace-pre-line">{item.message}</p>
          {item.reply ? <p className="mt-2 rounded-xl bg-primary-soft p-2 text-sm"><b>Owner:</b> {item.reply}</p> : null}
          <p className="mt-1 text-xs text-muted">{new Date(item.created_at).toLocaleString("en-IN", { day: "numeric", hour: "numeric", minute: "2-digit", month: "short", timeZone: "Asia/Kolkata" })}</p>
        </li>
      ))}
    </ul>
  );
}

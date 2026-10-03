import { Panel } from "@/components/accounts/fields";

type Event = { id: number; action: string; actor_role: string | null; created_at: string; before: unknown; after: unknown };

const hidden = new Set(["id", "created_at", "updated_at", "created_by", "normalized"]);

function changes(event: Event) {
  const before = (event.before ?? {}) as Record<string, unknown>;
  const after = (event.after ?? {}) as Record<string, unknown>;
  if (event.action === "insert") return "Added";
  return Object.keys(after)
    .filter((key) => !hidden.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => `${key.replaceAll("_", " ")}: ${before[key] ?? "—"} → ${after[key] ?? "—"}`)
    .join("; ") || "No visible change";
}

/** Change history from finance_events (who, when, what). */
export function History({ events }: { events: Event[] }) {
  return (
    <Panel title="Change history">
      {events.length ? (
        <ul className="space-y-2 text-sm">
          {events.map((event) => (
            <li className="rounded-xl border border-border bg-background p-3" key={event.id}>
              <span className="font-semibold">{new Date(event.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</span>
              <span className="text-muted"> · {event.actor_role ?? "system"}</span>
              <p className="mt-1 break-words text-muted">{changes(event)}</p>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">No changes recorded yet.</p>}
    </Panel>
  );
}

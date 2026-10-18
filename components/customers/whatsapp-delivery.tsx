import { Badge, Empty } from "@/components/accounts/fields";
import type { DeliveryCounts, DeliveryRow } from "@/lib/msg91/delivery-report";

const kindLabels: Record<string, string> = {
  account_ready: "Account ready",
  customer_campaign: "Festive offer",
  customer_follow_up: "We miss you",
  customer_thank_you: "Thank you",
  owner_night_plan: "Owner night plan",
  owner_summary: "Owner morning summary",
  payslip: "Payslip",
};

// Meta / MSG91 reasons seen most often for retail sends.
const failureReasons: Record<string, string> = {
  "130472": "Meta held it back (number in a Meta test group)",
  "131026": "Not on WhatsApp, or can't receive it",
  "131047": "Outside the 24-hour reply window",
  "131049": "Meta limited marketing messages to this customer",
  "131050": "Customer stopped marketing messages",
  "131056": "Too many messages to this number",
  "132001": "Template missing or not approved",
  msg91_timeout: "MSG91 did not answer in time",
  not_in_msg91_logs: "MSG91 has no record (never sent)",
  msg91_unavailable: "MSG91 not configured",
};

const timeFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", hour: "numeric", minute: "2-digit", month: "short", timeZone: "Asia/Kolkata" });

function when(value: string | null) {
  return value ? timeFormat.format(new Date(value)) : "";
}

function failureReason(code: string | null) {
  if (!code) return "Failed";
  const known = failureReasons[code] ?? failureReasons[code.match(/\d{6}/)?.[0] ?? ""];
  if (known) return known;
  if (/^msg91_http_/.test(code)) return `MSG91 error ${code.replace("msg91_http_", "")}`;
  return code;
}

export function DeliveryStatus({ row }: { row: DeliveryRow }) {
  if (row.status === "read") return <Badge tone="good">✓✓ Read {when(row.read_at)}</Badge>;
  if (row.status === "delivered") return <Badge>✓✓ Delivered {when(row.delivered_at)}</Badge>;
  if (row.status === "failed") return <Badge tone="bad">Failed · {failureReason(row.error_code)}</Badge>;
  if (row.status === "accepted") return <Badge>✓ Sent to MSG91 {when(row.accepted_at)}</Badge>;
  return <Badge tone="warn">Sending…</Badge>;
}

function percent(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "–";
}

export function DeliveryTiles({ counts, name }: { counts: DeliveryCounts; name: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <p className="font-semibold">{name}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Tile label="Sent" value={String(counts.total)} />
        <Tile hint={percent(counts.reached, counts.total)} label="Delivered" value={String(counts.reached)} />
        <Tile hint={percent(counts.read, counts.total)} label="Read" value={String(counts.read)} />
        <Tile hint={percent(counts.failed, counts.total)} label="Failed" tone={counts.failed ? "bad" : undefined} value={String(counts.failed)} />
      </dl>
      {counts.waiting ? <p className="mt-2 text-xs text-muted">{counts.waiting} without a report: just sent, or older than the 4 days MSG91 keeps logs.</p> : null}
    </div>
  );
}

function Tile({ hint, label, tone, value }: { hint?: string; label: string; tone?: "bad"; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`mt-0.5 text-xl font-semibold ${tone === "bad" ? "text-danger" : ""}`}>
        {value}{hint ? <span className="ml-1 text-xs font-medium text-muted">{hint}</span> : null}
      </dd>
    </div>
  );
}

export function DeliveryList({ rows, showRecipient = true }: { rows: DeliveryRow[]; showRecipient?: boolean }) {
  if (!rows.length) return <Empty>No WhatsApp messages sent through MSG91 yet.</Empty>;
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-background p-3 text-sm" key={row.id}>
          <span>
            <span className="font-semibold">{kindLabels[row.kind] ?? row.kind}</span>
            <span className="text-muted">
              {showRecipient ? ` · ${row.recipient.replace(/^91(?=\d{10}$)/, "")}` : ""} · {row.stores?.name ?? ""} · {when(row.created_at)}
            </span>
          </span>
          <DeliveryStatus row={row} />
        </li>
      ))}
    </ul>
  );
}

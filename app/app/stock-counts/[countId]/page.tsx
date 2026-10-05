import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Badge, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { CountSheet } from "@/components/buying/count-sheet";
import { money, shortDate } from "@/lib/accounts/format";
import { requireProfile } from "@/lib/auth/session";
import { isLimitedView } from "@/lib/auth/view";
import { addExtraItem, reviewCount, submitCount } from "@/lib/buying/actions";
import { stockCount, stockCountCodes } from "@/lib/buying/queries";

export default async function StockCountPage({ params }: { params: Promise<{ countId: string }> }) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager", "cashier"].includes(profile.role)) return <AccessDenied message="Stock counts are for the owner, store managers and cashiers." />;
  const { countId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(countId)) return <AccessDenied message="Count not found." />;
  const [{ count, sheet, summary }, phone, codes] = await Promise.all([stockCount(countId), isLimitedView(profile), stockCountCodes(countId)]);
  const limited = phone || profile.role === "cashier";
  if (!count) return <AccessDenied message="Count not found." />;
  const counting = count.status === "counting";
  const differences = counting ? [] : sheet.filter((line) => Number(line.counted_qty ?? 0) !== Number(line.expected_qty ?? 0));

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Link className="text-sm font-medium text-muted" href={`/app/stock-counts?store=${count.store_id}`}>← Stock counts</Link>
        <h1 className="mt-2 text-3xl font-semibold">{count.title}</h1>
        <p className="mt-2 text-sm text-muted">{count.stores?.name} · started {shortDate(count.created_at.slice(0, 10))}{count.snapshot_date ? ` · expected stock from the report of ${shortDate(count.snapshot_date)} less sales since` : ""}</p>
        <div className="mt-3"><Badge tone={counting ? "warn" : count.status === "reviewed" ? "good" : "muted"}>{counting ? "Counting" : count.status === "reviewed" ? "Reviewed" : "Submitted"}</Badge></div>
      </section>

      {!counting && summary && !limited ? (
        <Panel title="Result">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Short" value={`${Number(summary.short_units ?? 0)} pcs`} />
            <Stat label="Extra" value={`${Number(summary.over_units ?? 0)} pcs`} />
            <Stat label="Short at MRP" value={money(summary.short_value_mrp ?? 0)} />
            <Stat label="Net at cost" value={summary.net_value_cost === null ? "No cost in stock file" : money(summary.net_value_cost)} />
          </div>
          {Number(summary.expected_value_mrp) > 0 ? <p className="mt-3 text-sm text-muted">Net difference {money(summary.net_value_mrp ?? 0)} at MRP, {(Math.abs(Number(summary.net_value_mrp ?? 0)) / Number(summary.expected_value_mrp) * 100).toFixed(1)}% of the expected stock value.</p> : null}
          {differences.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th className="py-1">Item</th><th>Size</th><th>Lot</th><th className="text-right">Expected</th><th className="text-right">Counted</th><th className="text-right">Difference</th></tr></thead>
                <tbody>
                  {differences.map((line) => {
                    const diff = Number(line.counted_qty ?? 0) - Number(line.expected_qty ?? 0);
                    return (
                      <tr className="border-t border-border/60" key={line.id}>
                        <td className="py-1.5">{line.item_name}{line.is_extra ? " (found extra)" : ""}</td><td>{line.size ?? "—"}</td><td className="text-muted">{line.lot_code ?? "—"}</td>
                        <td className="text-right">{Number(line.expected_qty ?? 0)}</td><td className="text-right">{Number(line.counted_qty ?? 0)}</td>
                        <td className={`text-right font-semibold ${diff < 0 ? "text-danger" : "text-accent-ink"}`}>{diff > 0 ? `+${diff}` : diff}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="mt-3 text-sm font-medium text-success">Everything matched.</p>}
          {profile.role === "owner" && count.status === "submitted" ? (
            <ActionForm action={reviewCount} className="mt-4 flex flex-wrap items-end gap-3" submitLabel="Mark reviewed" variant="secondary">
              <input name="countId" type="hidden" value={count.id} />
              <div className="min-w-64 flex-1"><Field label="Note"><input className={inputClass} name="note" placeholder="What was found / action taken" /></Field></div>
            </ActionForm>
          ) : count.review_note ? <p className="mt-3 text-sm text-muted">Owner: “{count.review_note}”</p> : null}
        </Panel>
      ) : null}

      <Panel description={counting ? "Each line is one item and size (so the number of lines is not the number of pieces). Tap Scan and scan every piece's tag: each scan adds 1 and saves. Or type the number on the shelf. Enter 0 for items you cannot find." : undefined} title="Count sheet">
        {sheet.length ? <CountSheet codes={codes} countId={count.id} editable={counting} lines={sheet} /> : <Empty>No items.</Empty>}
      </Panel>

      {counting ? (
        <>
          <Panel description="Something of this brand on the shelf that is not on the sheet." title="Found an extra item">
            <ActionForm action={addExtraItem} className="flex flex-wrap items-end gap-3" submitLabel="Add" variant="secondary">
              <input name="countId" type="hidden" value={count.id} />
              <Field label="Item name"><input className={inputClass} name="item" /></Field>
              <Field label="Lot code / barcode"><input className={inputClass} name="code" /></Field>
              <Field label="Size"><input className={`${inputClass} max-w-24`} name="size" /></Field>
              <Field label="Pieces"><input className={`${inputClass} max-w-24`} inputMode="numeric" name="qty" required /></Field>
            </ActionForm>
          </Panel>
          <Notice>Submit only when every item is counted. After submitting, the count is locked and the difference is shown.</Notice>
          <ActionForm action={submitCount} submitLabel="Submit count">
            <input name="countId" type="hidden" value={count.id} />
          </ActionForm>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

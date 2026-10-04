import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Badge, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { MoneyHeader, MoneyNav } from "@/components/money/money-nav";
import { indiaToday, money, shortDate } from "@/lib/accounts/format";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { isLimitedView } from "@/lib/auth/view";
import { reviewDayClose, submitDayClose } from "@/lib/money/actions";
import { addDays, differenceLabel } from "@/lib/money/format";
import { dayCloseFor, listDayCloses, missingDayCloses, previousDayClose } from "@/lib/money/queries";

export default async function DayClosePage({ searchParams }: { searchParams: Promise<{ store?: string; date?: string }> }) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager", "cashier"].includes(profile.role)) return <AccessDenied message="Day close is for the owner, store managers and cashiers." />;
  const stores = await getAccessibleStores(profile);
  const params = await searchParams;
  const store = stores.find((item) => item.id === params.store) ?? stores[0];
  if (!store) return <AccessDenied message="No store is assigned to you." />;
  const isOwner = profile.role === "owner";
  const cashier = profile.role === "cashier";
  // Cashiers and managers on a phone never see Logic's sale or the expected cash.
  const limited = cashier || await isLimitedView(profile);
  const today = indiaToday();
  const earliest = isOwner ? addDays(today, -60) : addDays(today, -3);
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && params.date <= today && params.date >= earliest ? params.date : today;
  const [closes, missing, previous, existing] = await Promise.all([
    listDayCloses(store.id, addDays(today, -45), today),
    missingDayCloses(store.id, 14),
    previousDayClose(store.id, date),
    dayCloseFor(store.id, date),
  ]);
  const locked = existing && existing.status !== "reopened";

  return (
    <div className="space-y-5">
      <MoneyHeader
        description="Count the cash at closing and enter UPI, card and other payments from the machines. The app compares them with the day's Logic sales report; the counter does not see the expected figure."
        title="Day close"
      />
      <MoneyNav active="/app/money" isOwner={isOwner} storeId={store.id} stores={stores} />

      {missing.length ? (
        <Notice>{store.name}: no close for {missing.slice(0, 5).map(shortDate).join(", ")}{missing.length > 5 ? ` and ${missing.length - 5} more` : ""}. {isOwner ? "Only you can enter closes older than 3 days." : "Closes older than 3 days can only be entered by the owner."}</Notice>
      ) : null}

      <Panel
        action={
          <form className="flex items-end gap-2" method="get">
            <input name="store" type="hidden" value={store.id} />
            <Field label="Date"><input className={inputClass} defaultValue={date} max={today} min={earliest} name="date" type="date" /></Field>
            <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Open</button>
          </form>
        }
        description={previous ? `Opening cash ${money(Number(previous.cash_counted) - Number(previous.cash_deposited))} is what was kept in the drawer after ${shortDate(previous.close_date)}.` : "First close for this store: enter the cash that was in the drawer when the day started."}
        title={`${store.name} · ${shortDate(date)}`}
      >
        {locked ? (
          <Notice tone="info">This day is closed{existing?.status === "reviewed" ? " and checked by the owner" : ""}. If something is wrong, ask the owner to reopen it.</Notice>
        ) : (
          <ActionForm action={submitDayClose} className="grid gap-4 sm:grid-cols-2" submitLabel="Close the day">
            <input name="storeId" type="hidden" value={store.id} />
            <input name="closeDate" type="hidden" value={date} />
            {previous ? null : <Field hint="Cash in the drawer at the start of the day." label="Opening cash (₹)"><input className={inputClass} inputMode="decimal" name="opening" required /></Field>}
            <Field hint="All notes and coins in the drawer now, before taking any out." label="Cash counted (₹)"><input className={inputClass} inputMode="decimal" name="cash" required /></Field>
            <Field hint="Total from the UPI app / QR settlement for the day." label="UPI (₹)"><input className={inputClass} defaultValue="0" inputMode="decimal" name="upi" /></Field>
            <Field hint="Total from the card machine's day-end slip." label="Card (₹)"><input className={inputClass} defaultValue="0" inputMode="decimal" name="card" /></Field>
            <Field hint="Credit notes, gift vouchers, wallet… say what below." label="Other payments (₹)"><input className={inputClass} defaultValue="0" inputMode="decimal" name="other" /></Field>
            <Field label="What were the other payments?"><input className={inputClass} name="otherNote" placeholder="Credit note CN-12" /></Field>
            <Field hint="Cash taken out to the bank or handed to the owner tonight. The rest stays as tomorrow's opening cash." label="Cash deposited / handed over (₹)"><input className={inputClass} defaultValue="0" inputMode="decimal" name="deposited" /></Field>
            <Field label="Note (optional)"><input className={inputClass} name="note" placeholder="Anything unusual today" /></Field>
            <p className="text-xs leading-5 text-muted sm:col-span-2">Cash expenses paid from the counter today are taken from the Expenses page; enter them there before closing.</p>
          </ActionForm>
        )}
      </Panel>

      <Panel description={limited ? "Closes for the last 45 days." : "Expected cash = opening cash + (Logic net sale − UPI − card − other) − cash expenses. Differences within ₹10 count as balanced."} title="Recent closes">
        {closes.length ? (
          <div className="space-y-3">
            {closes.map((close) => {
              const result = differenceLabel(close.difference, money);
              return (
                <details className="rounded-2xl border border-border bg-background p-4" key={close.id}>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{shortDate(close.close_date)}</span>
                    <span className="flex flex-wrap gap-2">
                      {cashier ? null : <Badge tone={result.tone}>{result.label}</Badge>}
                      <Badge tone={close.status === "reviewed" ? "good" : close.status === "reopened" ? "warn" : "muted"}>{close.status === "reviewed" ? "Checked" : close.status === "reopened" ? "Reopened" : "Waiting for owner"}</Badge>
                    </span>
                  </summary>
                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <Row label="Opening cash" value={money(close.opening_cash)} />
                    <Row label="Cash counted" value={money(close.cash_counted)} />
                    <Row label="UPI" value={money(close.upi_amount)} />
                    <Row label="Card" value={money(close.card_amount)} />
                    <Row label={`Other${close.other_note ? ` (${close.other_note})` : ""}`} value={money(close.other_amount)} />
                    <Row label="Deposited / handed over" value={money(close.cash_deposited)} />
                    <Row label="Cash expenses" value={money(close.cash_expenses)} />
                    <Row label="Kept for tomorrow" value={money(Number(close.cash_counted) - Number(close.cash_deposited))} />
                    {limited ? null : <Row label="Logic net sale" value={close.sales_report_uploaded ? money(close.logic_net_sale) : "Report not uploaded"} />}
                    {limited ? null : <Row label="Expected cash" value={close.expected_cash === null ? "—" : money(close.expected_cash)} />}
                  </dl>
                  <p className="mt-2 text-xs text-muted">Closed by {close.submitted_by_name ?? "—"}{close.note ? ` · “${close.note}”` : ""}{close.review_note ? ` · Owner: “${close.review_note}”` : ""}</p>
                  {isOwner && close.status !== "reopened" ? (
                    <div className="mt-3 flex flex-wrap gap-4">
                      {close.status !== "reviewed" ? (
                        <ActionForm action={reviewDayClose} className="flex flex-wrap items-end gap-2" submitLabel="Mark checked" variant="secondary">
                          <input name="closeId" type="hidden" value={close.id} />
                          <input name="action" type="hidden" value="review" />
                          <input className={`${inputClass} max-w-64`} name="note" placeholder="Note (optional)" />
                        </ActionForm>
                      ) : null}
                      <ActionForm action={reviewDayClose} className="flex flex-wrap items-end gap-2" submitLabel="Reopen for correction" variant="secondary">
                        <input name="closeId" type="hidden" value={close.id} />
                        <input name="action" type="hidden" value="reopen" />
                        <input className={`${inputClass} max-w-64`} name="note" placeholder="Why it needs correcting" required />
                      </ActionForm>
                    </div>
                  ) : null}
                </details>
              );
            })}
          </div>
        ) : <Empty>No closes yet for {store.name}.</Empty>}
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 py-1">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

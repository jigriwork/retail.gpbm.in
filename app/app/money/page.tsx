import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { Celebration } from "@/components/app/celebration";
import { StoreChecklistCard } from "@/components/app/store-checklist";
import { ActionForm } from "@/components/accounts/action-form";
import { Badge, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { CashEntryFields } from "@/components/money/cash-entry-fields";
import { MoneyHeader, MoneyNav } from "@/components/money/money-nav";
import { indiaToday, money, shortDate } from "@/lib/accounts/format";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { isLimitedView } from "@/lib/auth/view";
import {
  addCashEntry, closeCashDay, deleteCashEntry, receiveCashTransfer, reopenCashDay, reviewCashDay, setBankHoliday, setCashBookStart,
} from "@/lib/cash-book/actions";
import { CASH_TOLERANCE, cashCategoryLabel, cashEntryLabel, type CashEntryType } from "@/lib/cash-book/labels";
import {
  getBankHolidays, getCashDay, getCashHistory, getOtherStores, getStoreStaff, nextCashDate, type CashEntry,
} from "@/lib/cash-book/queries";
import { addDays } from "@/lib/money/format";

function Row({ label, strong, value }: { label: string; strong?: boolean; value: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${strong ? "border-t border-border pt-2 font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function differenceBadge(difference: number | null) {
  if (difference === null) return null;
  if (Math.abs(difference) <= CASH_TOLERANCE) return <Badge tone="good">Cash matched</Badge>;
  return difference < 0
    ? <Badge tone="bad">Short {money(Math.abs(difference))}</Badge>
    : <Badge tone="warn">Excess {money(difference)}</Badge>;
}

function entryText(entry: CashEntry) {
  const parts = [entry.type === "expense" ? cashCategoryLabel(entry.category) : cashEntryLabel[entry.type]];
  if (entry.staff_name) parts.push(entry.staff_name);
  if (entry.other_store) parts.push(entry.type === "to_store" ? `to ${entry.other_store}` : `from ${entry.other_store}`);
  if (entry.note) parts.push(entry.note);
  return parts.join(" · ");
}

const outOrder: CashEntryType[] = ["edc", "expense", "staff_payment", "owner", "home", "donation", "bank_deposit", "to_store", "other_out"];

export default async function CashBookPage({ searchParams }: { searchParams: Promise<{ store?: string; date?: string }> }) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager", "cashier"].includes(profile.role)) return <AccessDenied message="The cash book is for the owner, store managers and cashiers." />;
  const stores = await getAccessibleStores(profile);
  const params = await searchParams;
  const store = stores.find((item) => item.id === params.store) ?? stores[0];
  if (!store) return <AccessDenied message="No store is assigned to you." />;
  const isOwner = profile.role === "owner";
  const isCashier = profile.role === "cashier";
  // Cashiers and managers on a phone are not shown Logic's report figure.
  const limited = isCashier || await isLimitedView(profile);
  const today = indiaToday();
  const history = await getCashHistory(store.id, addDays(today, -45), today);
  const probe = await getCashDay(store.id, today);
  const requested = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && params.date <= today ? params.date : null;
  const date = requested ?? nextCashDate(history, probe.start?.date ?? null, today);
  const day = date === today ? probe : await getCashDay(store.id, date);
  const [staff, otherStores, holidays] = await Promise.all([
    day.can_edit ? getStoreStaff(store.id) : Promise.resolve([]),
    day.can_edit ? getOtherStores(store.id) : Promise.resolve([]),
    isOwner ? getBankHolidays(addDays(today, -7)) : Promise.resolve([]),
  ]);

  const received = day.entries.filter((entry) => entry.direction === "in").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const paid = day.entries.filter((entry) => entry.direction === "out").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const outByType = outOrder
    .map((type) => ({ type, total: day.entries.filter((entry) => entry.type === type).reduce((sum, entry) => sum + Number(entry.amount), 0) }))
    .filter((item) => item.total > 0);
  const closed = day.status === "closed" || day.status === "reviewed";
  const difference = closed && day.counted !== null && day.closing !== null ? Number(day.counted) - Number(day.closing) : null;
  const hasDeposit = day.entries.some((entry) => entry.type === "bank_deposit");
  // Consecutive closed days (latest first) where the counted cash matched the book.
  let matchedStreak = 0;
  for (const item of history) {
    if (item.status === "open") continue;
    if (item.difference === null || Math.abs(Number(item.difference)) > CASH_TOLERANCE) break;
    matchedStreak += 1;
  }
  const celebrate = closed && difference !== null && Math.abs(difference) <= CASH_TOLERANCE && date >= addDays(today, -1);
  const hidden = { date, store: store.id };

  return (
    <div className="space-y-5">
      <MoneyHeader
        description="Your daily cash book: OB (yesterday's counted cash) + today's sale − EDC − expenses and other payments = CB. Count the drawer at closing; the app shows if anything is short."
        title="Cash book"
      />
      <MoneyNav active="/app/money" isCashier={isCashier} isOwner={isOwner} storeId={store.id} stores={stores} />

      {isCashier ? <StoreChecklistCard firstName={profile.full_name?.split(" ")[0]} storeId={store.id} storeName={store.name} /> : null}

      {!day.start ? (
        isOwner ? (
          <Panel description="Choose the first day the app keeps this store's book, and the cash in the drawer at the start of that day (OB). From then on every day starts with the previous day's counted cash." title={`Start ${store.name}'s cash book`}>
            <ActionForm action={setCashBookStart} className="grid gap-4 sm:grid-cols-2" submitLabel="Start the cash book">
              <input name="storeId" type="hidden" value={store.id} />
              <Field label="First day"><input className={inputClass} defaultValue={today} max={today} name="date" type="date" /></Field>
              <Field label="Opening cash (OB) that morning (₹)"><input className={inputClass} inputMode="decimal" name="opening" required /></Field>
            </ActionForm>
          </Panel>
        ) : <Notice>The owner has to start {store.name}&apos;s cash book (first day and opening cash) before entries can be made.</Notice>
      ) : (
        <Panel
          action={
            <form className="flex items-end gap-2" method="get">
              <input name="store" type="hidden" value={store.id} />
              <Field label="Day"><input className={inputClass} defaultValue={date} max={today} min={day.start.date} name="date" type="date" /></Field>
              <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Open</button>
            </form>
          }
          description={day.bank_day ? "Bank day: deposit the cash in the bank." : "No bank deposit today (Saturday, Sunday or bank holiday)."}
          title={`${store.name} · ${shortDate(date)}`}
        >
          {celebrate ? <Celebration id={`cash:${store.id}:${date}`} /> : null}
          {celebrate ? (
            <p className="pop-in mb-3 rounded-2xl border border-success/40 bg-success/10 px-4 py-3 text-sm font-semibold">
              🎉 Cash matched{matchedStreak >= 2 ? ` · 🔥 ${matchedStreak} days in a row` : ""}. Well done{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!
            </p>
          ) : matchedStreak >= 2 ? <p className="mb-3 text-sm font-semibold text-success">🔥 {matchedStreak} days in a row cash matched</p> : null}
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone={closed ? "good" : "warn"}>{day.status === "reviewed" ? "Closed · checked" : closed ? "Closed" : "Open"}</Badge>
            {closed ? differenceBadge(difference) : null}
            {closed && day.bank_day && !hasDeposit ? <Badge tone="warn">No bank deposit</Badge> : null}
            {closed && day.report_matches === true ? <Badge tone="good">Sale matches Logic report</Badge> : null}
            {closed && day.report_matches === false ? <Badge tone="bad">Sale differs from Logic report</Badge> : null}
            {closed && !day.report_uploaded ? <Badge>Logic report not uploaded yet</Badge> : null}
          </div>

          {day.blocked === "previous_open" ? (
            <Notice>Close {shortDate(addDays(date, -1))} first: each day starts with the previous day&apos;s counted cash. <Link className="font-semibold underline" href={`/app/money?store=${store.id}&date=${addDays(date, -1)}`}>Open {shortDate(addDays(date, -1))}</Link></Notice>
          ) : day.blocked === "before_start" ? (
            <Notice tone="info">{store.name}&apos;s cash book starts on {shortDate(day.start.date)}.</Notice>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="text-sm">
                <Row label="OB (opening cash)" value={money(day.opening ?? 0)} />
                <Row label="+ Sale (Logic total)" value={closed ? money(day.sale ?? 0) : "at closing"} />
                {received ? <Row label="+ Cash received" value={money(received)} /> : null}
                {outByType.map((item) => (
                  <Row key={item.type} label={`− ${cashEntryLabel[item.type]}`} value={money(item.total)} />
                ))}
                {closed ? (
                  <>
                    <Row label="= CB (as per book)" strong value={money(day.closing ?? 0)} />
                    <Row label="Cash counted" value={money(day.counted ?? 0)} />
                  </>
                ) : (
                  <Row label="So far (without today's sale)" strong value={money(Number(day.opening ?? 0) + received - paid)} />
                )}
                {closed && !limited && day.report_sale !== null ? <Row label="Logic report sale" value={money(day.report_sale)} /> : null}
                {closed ? <p className="mt-2 text-xs text-muted">Closed by {day.closed_by ?? "—"}{day.reviewed_by ? ` · checked by ${day.reviewed_by}` : ""}{day.note ? ` · “${day.note}”` : ""}</p> : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Lines ({day.entries.length})</p>
                {day.entries.length ? (
                  <ul className="space-y-2 text-sm">
                    {day.entries.map((entry) => (
                      <li className="rounded-2xl border border-border bg-background p-3" key={entry.id}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span>{entryText(entry)}</span>
                          <span className={`font-semibold tabular-nums ${entry.direction === "in" ? "text-success" : ""}`}>{entry.direction === "in" ? "+" : "−"}{money(entry.amount)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                          <span>by {entry.by ?? "—"}{entry.type === "to_store" ? ` · ${entry.transfer_status === "received" ? "received there" : "waiting for them to receive"}` : ""}</span>
                          {day.can_edit && (entry.mine || !isCashier) ? (
                            <ActionForm action={deleteCashEntry} className="flex items-center gap-2" submitLabel="Remove" variant="secondary">
                              <input name="storeId" type="hidden" value={store.id} />
                              <input name="entryId" type="hidden" value={entry.id} />
                            </ActionForm>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <Empty>No lines yet.</Empty>}
              </div>
            </div>
          )}
        </Panel>
      )}

      {day.start && day.can_edit && day.incoming.length ? (
        <Panel description="Cash sent by the other store. Confirm when it is in your drawer; it is added to this day." title="Cash coming from another store">
          <ul className="space-y-2 text-sm">
            {day.incoming.map((item) => (
              <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-background p-3" key={item.id}>
                <span><span className="font-semibold">{money(item.amount)}</span> from {item.from} · sent {shortDate(item.sent_date)}{item.note ? ` · ${item.note}` : ""}</span>
                <ActionForm action={receiveCashTransfer} className="flex items-center gap-2" submitLabel="Received">
                  <input name="storeId" type="hidden" value={store.id} />
                  <input name="transferId" type="hidden" value={item.id} />
                  <input name="date" type="hidden" value={date} />
                </ActionForm>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {day.start && day.can_edit ? (
        <>
          <Panel description="Add each payment as it happens: EDC, tea, courier, staff, owner, bank deposit…" title="Add a line">
            <ActionForm action={addCashEntry} className="grid gap-4 sm:grid-cols-2" submitLabel="Add">
              {Object.entries(hidden).map(([name, value]) => <input key={name} name={name === "store" ? "storeId" : name} type="hidden" value={value} />)}
              <CashEntryFields staff={staff} stores={otherStores} />
            </ActionForm>
          </Panel>
          <Panel description="At closing: type the day's total sale from Logic and count all the cash in the drawer. The app works out CB and shows any difference." title="Close the day">
            <ActionForm action={closeCashDay} className="grid gap-4 sm:grid-cols-2" submitLabel="Close the day">
              <input name="storeId" type="hidden" value={store.id} />
              <input name="date" type="hidden" value={date} />
              <Field label="Sale (Logic total, ₹)"><input className={inputClass} defaultValue={day.sale ?? ""} inputMode="decimal" name="sale" required /></Field>
              <Field label="Cash counted in the drawer (₹)"><input className={inputClass} defaultValue={day.counted ?? ""} inputMode="decimal" name="counted" required /></Field>
              <div className="sm:col-span-2"><Field label="Note (optional)"><input className={inputClass} defaultValue={day.note ?? ""} name="note" placeholder="Anything unusual today" /></Field></div>
            </ActionForm>
          </Panel>
        </>
      ) : null}

      {day.start && closed && (isOwner || profile.role === "manager") ? (
        <Panel title="Owner and manager">
          <div className="flex flex-wrap gap-4">
            {day.status === "closed" ? (
              <ActionForm action={reviewCashDay} className="flex flex-wrap items-end gap-2" submitLabel="Mark as checked" variant="secondary">
                <input name="storeId" type="hidden" value={store.id} />
                <input name="date" type="hidden" value={date} />
                <Field label="Note (optional)"><input className={inputClass} name="note" /></Field>
              </ActionForm>
            ) : null}
            {isOwner ? (
              <ActionForm action={reopenCashDay} className="flex items-end gap-2" submitLabel="Reopen this day" variant="secondary">
                <input name="storeId" type="hidden" value={store.id} />
                <input name="date" type="hidden" value={date} />
              </ActionForm>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {day.start ? (
        <Panel description="Last 45 days. Tap a day to open it." title="Cash book history">
          {history.length ? (
            <ul className="space-y-2 text-sm">
              {history.map((item) => {
                const itemDifference = item.difference === null ? null : Number(item.difference);
                return (
                  <li className="rounded-2xl border border-border bg-background p-3" key={item.date}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link className="font-semibold underline" href={`/app/money?store=${store.id}&date=${item.date}`}>{shortDate(item.date)}</Link>
                      <div className="flex flex-wrap gap-1.5">
                        {item.status === "open" ? <Badge tone="warn">Open</Badge> : differenceBadge(itemDifference)}
                        {item.status !== "open" && item.bank_day && !Number(item.deposit) ? <Badge tone="warn">No bank deposit</Badge> : null}
                        {item.report_matches === false ? <Badge tone="bad">Sale ≠ Logic</Badge> : null}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      OB {money(item.opening)} · sale {item.sale === null ? "—" : money(item.sale)} · EDC {money(item.edc)} · paid out {money(Number(item.out) - Number(item.edc))}{Number(item.deposit) ? ` (bank ${money(item.deposit)})` : ""} · CB {item.closing === null ? "—" : money(item.closing)} · counted {item.counted === null ? "—" : money(item.counted)}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : <Empty>No days yet.</Empty>}
        </Panel>
      ) : null}

      {isOwner ? (
        <Panel description="Monday to Friday are bank days. Mark bank holidays so the app does not expect a deposit." title="Bank holidays">
          <div className="space-y-3">
            {holidays.length ? (
              <ul className="flex flex-wrap gap-2 text-sm">
                {holidays.map((holiday) => (
                  <li className="flex items-center gap-2 rounded-full border border-border px-3 py-1" key={holiday.day}>
                    {shortDate(holiday.day)}{holiday.note ? ` · ${holiday.note}` : ""}
                    <ActionForm action={setBankHoliday} className="flex items-center" submitLabel="×" variant="secondary">
                      <input name="day" type="hidden" value={holiday.day} />
                      <input name="remove" type="hidden" value="1" />
                    </ActionForm>
                  </li>
                ))}
              </ul>
            ) : <Empty>No holidays marked.</Empty>}
            <ActionForm action={setBankHoliday} className="flex flex-wrap items-end gap-2" submitLabel="Add holiday" variant="secondary">
              <Field label="Date"><input className={inputClass} name="day" required type="date" /></Field>
              <Field label="Note"><input className={inputClass} name="note" placeholder="Durga Puja" /></Field>
            </ActionForm>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

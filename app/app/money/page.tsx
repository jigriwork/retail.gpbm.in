import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { Celebration } from "@/components/app/celebration";
import { StoreChecklistCard } from "@/components/app/store-checklist";
import { ActionForm } from "@/components/accounts/action-form";
import { Badge, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { CashBookGrid, SoftwareCell } from "@/components/money/cash-book-grid";
import { CashDayForm } from "@/components/money/cash-day-form";
import { CashEntryForm } from "@/components/money/cash-entry-fields";
import { MoneyHeader, MoneyNav } from "@/components/money/money-nav";
import { indiaToday, shortDate } from "@/lib/accounts/format";
import { requireProfile } from "@/lib/auth/session";
import { isLimitedView } from "@/lib/auth/view";
import {
  addCashEntry, closeCashDay, closeReadyDays, deleteCashEntry, overrideSoftwareSales, receiveCashTransfer, reopenCashDay, restoreSoftwareSales,
  reviewCashDay, setBankHoliday, setCashBookStart,
} from "@/lib/cash-book/actions";
import { dayLabel, fmt, missingLabel, monthTitle, shiftMonth, signed, statusText } from "@/lib/cash-book/format";
import { CASH_TOLERANCE, cashCategoryLabel, cashEntryLabel, expensePaidFrom } from "@/lib/cash-book/labels";
import {
  getBankHolidays, getCashBookStores, getCashDay, getCashImports, getCashMonth, getOtherStores, getStoreStaff, workDay,
  type CashDay, type CashEntry,
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

function Stat({ hint, label, tone, value }: { hint?: string; label: string; tone?: "bad" | "good"; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3" title={hint}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone === "bad" ? "text-danger" : tone === "good" ? "text-success" : ""}`}>{value}</p>
    </div>
  );
}

function differenceBadge(difference: number | null) {
  if (difference === null) return null;
  if (Math.abs(difference) <= CASH_TOLERANCE) return <Badge tone="good">Cash matched</Badge>;
  return difference < 0
    ? <Badge tone="bad">Short ₹{fmt(Math.abs(difference))}</Badge>
    : <Badge tone="warn">Excess ₹{fmt(difference)}</Badge>;
}

function entryText(entry: CashEntry) {
  const parts = [entry.type === "expense" ? cashCategoryLabel(entry.category) : cashEntryLabel[entry.type]];
  if (entry.staff_name) parts.push(entry.staff_name);
  if (entry.other_store) parts.push(entry.type === "to_store" ? `to ${entry.other_store}` : `from ${entry.other_store}`);
  if (entry.note) parts.push(entry.note);
  if (entry.reference) parts.push(`ref ${entry.reference}`);
  return parts.join(" · ");
}

const eventLabel: Record<string, string> = {
  add_line: "Line added", add_paid_expense: "UPI/bank expense added", close: "Closed", legacy_import: "Imported", override_software: "Software Sales corrected",
  receive_transfer: "Cash received from other store", remove_line: "Line removed", reopen: "Reopened", restore_software: "Report value restored",
  review: "Checked", save: "Figures saved", set_start: "Cash book start set",
};

export default async function CashBookPage({ searchParams }: { searchParams: Promise<{ date?: string; month?: string; store?: string }> }) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager", "cashier", "accountant"].includes(profile.role)) {
    return <AccessDenied message="The cash book is for the owner, store managers, cashiers and accountants given cash book access." />;
  }
  const stores = await getCashBookStores();
  if (!stores.length) {
    return <AccessDenied message={profile.role === "accountant" ? "No cash book access has been given to you. Ask the owner (Accounts → Access)." : "No store is assigned to you."} />;
  }
  const params = await searchParams;
  const store = stores.find((item) => item.id === params.store) ?? stores[0];
  const isOwner = profile.role === "owner";
  const isCashier = profile.role === "cashier";
  const isAccountant = profile.role === "accountant";
  // Cashiers and managers on a phone are not shown the report's sale figure.
  const hideSoftware = isCashier || await isLimitedView(profile);
  const today = indiaToday();
  const requestedDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;
  const monthStart = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? `${params.month}-01`
    : requestedDate ? `${requestedDate.slice(0, 7)}-01` : `${today.slice(0, 7)}-01`;
  const month = await getCashMonth(store.id, monthStart);
  const monthKey = monthStart.slice(0, 7);
  const nav = (
    <>
      <MoneyHeader
        description="One continuous book: each day opens with the previous day's calculated closing, across months and years. Book Sales is typed from the paper book; Software Sales comes from the uploaded sales report. Count the drawer at closing; any shortage or excess stays visible."
        title="Cash book"
      />
      <MoneyNav active="/app/money" cashBookOnly={isAccountant} extra={{ month: monthKey }} isCashier={isCashier} isOwner={isOwner} storeId={store.id} stores={stores} />
      <MonthBar month={monthStart} storeId={store.id} />
    </>
  );
  if (!month) {
    return <div className="space-y-5">{nav}<Notice>You cannot open {store.name}&apos;s cash book for {monthTitle(monthStart)}.</Notice></div>;
  }
  const date = requestedDate && requestedDate.startsWith(monthKey) ? requestedDate : workDay(month);
  const day = date ? await getCashDay(store.id, date) : null;
  const [staff, otherStores, holidays, imports] = await Promise.all([
    day?.can_edit ? getStoreStaff(store.id) : Promise.resolve([]),
    day?.can_edit ? getOtherStores(store.id) : Promise.resolve([]),
    isOwner ? getBankHolidays(addDays(today, -7)) : Promise.resolve([]),
    isOwner || isAccountant ? getCashImports(store.id) : Promise.resolve([]),
  ]);
  const totals = month.totals;

  return (
    <div className="space-y-5">
      {nav}
      {isCashier ? <StoreChecklistCard firstName={profile.full_name?.split(" ")[0]} storeId={store.id} storeName={store.name} /> : null}

      {!month.start ? (
        isOwner ? (
          <Panel description="Choose the first day the app keeps this store's book and the cash in the drawer that morning. From then on every day opens with the previous day's calculated closing. To bring in an old month from a workbook, use the import instead (see below)." title={`Start ${store.name}'s cash book`}>
            <ActionForm action={setCashBookStart} className="grid gap-4 sm:grid-cols-2" submitLabel="Start the cash book">
              <input name="storeId" type="hidden" value={store.id} />
              <Field label="First day"><input className={inputClass} defaultValue={today} max={today} name="date" type="date" /></Field>
              <Field label="Opening cash that morning (₹)"><input className={inputClass} inputMode="decimal" name="opening" required /></Field>
            </ActionForm>
          </Panel>
        ) : <Notice>The owner has to start {store.name}&apos;s cash book (first day and opening cash) before entries can be made.</Notice>
      ) : null}

      <Panel
        description={month.complete
          ? "Every day of this month is closed."
          : month.closing_date ? `Incomplete: closed up to ${shortDate(month.closing_date)}.` : "Incomplete: no day of this month is closed yet."}
        title={`${store.name} · ${monthTitle(monthStart)}`}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat hint="Balance at the start of the month (never a sum)" label={`Opening${month.opening_date ? ` · ${dayLabel(month.opening_date)}` : ""}`} value={fmt(month.opening)} />
          <Stat hint="Calculated closing of the last closed day" label={`Closing${month.closing_date ? ` · ${dayLabel(month.closing_date)}` : ""}${month.complete ? "" : " (so far)"}`} value={fmt(month.closing)} />
          <Stat label="Book Sales" value={fmt(totals.book_sales)} />
          {hideSoftware ? <Stat label="Days with report pending" value={String(totals.days_software_pending ?? 0)} /> : <Stat hint="Software − Book" label="Software Sales · difference" value={`${fmt(totals.software_sales)} · ${signed(totals.sales_difference)}`} />}
          <Stat label="EDC / Card · UPI" value={`${fmt(Number(totals.card ?? 0) + Number(totals.edc_legacy ?? 0))} · ${fmt(totals.upi ?? 0)}`} />
          <Stat label="Bank deposits" value={fmt(totals.deposit ?? 0)} />
          <Stat hint="Shop expenses, staff payments and donations paid in cash" label="Cash expenses" value={fmt(totals.cash_expenses ?? 0)} />
          <Stat hint="Counted − calculated, closed days" label="Cash difference" tone={Math.abs(Number(totals.cash_difference ?? 0)) > CASH_TOLERANCE ? "bad" : undefined} value={signed(totals.cash_difference ?? 0)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={month.complete ? "good" : "warn"}>{month.complete ? "Complete month" : "Incomplete month"}</Badge>
          {Number(totals.days_closed) ? <Badge tone="good">{totals.days_closed} closed</Badge> : null}
          {Number(totals.days_open) ? <Badge tone="warn">{totals.days_open} open</Badge> : null}
          {Number(totals.days_missing) ? <Badge tone="warn">{totals.days_missing} not entered</Badge> : null}
          {Number(totals.days_software_pending) ? <Badge>{totals.days_software_pending} report pending</Badge> : null}
          {Number(totals.days_report_changed) ? <Badge tone="bad">{totals.days_report_changed} report changed after closing</Badge> : null}
          {Number(totals.days_overridden) ? <Badge tone="warn">{totals.days_overridden} Software Sales corrected</Badge> : null}
          {Number(totals.days_negative) ? <Badge tone="bad">{totals.days_negative} negative balance</Badge> : null}
          {Number(totals.legacy_combined) ? <Badge>Legacy combined deductions ₹{fmt(totals.legacy_combined)}</Badge> : null}
          {Number(totals.bank_paid_expenses) ? <Badge>Paid by UPI/bank ₹{fmt(totals.bank_paid_expenses)} (not from drawer)</Badge> : null}
        </div>
        {month.access.enter && Number(totals.days_open) ? (
          <ActionForm action={closeReadyDays} className="mt-3 flex flex-wrap items-center gap-3" submitLabel="Close ready days in order" variant="secondary">
            <input name="storeId" type="hidden" value={store.id} />
            <input name="to" type="hidden" value={month.to < today ? month.to : today} />
          </ActionForm>
        ) : null}
      </Panel>

      {month.start ? (
        <>
          <div className="hidden md:block">
            <CashBookGrid hideSoftware={hideSoftware} month={month} selectedDate={date} storeId={store.id} />
          </div>
          <nav aria-label="Days" className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 md:hidden">
            {month.days.map((item) => {
              const inactive = ["future", "before_start", "not_started", "no_access"].includes(item.status);
              const tone = item.status === "closed" || item.status === "reviewed" ? "border-success/40 bg-success/5"
                : item.status === "open" ? "border-accent/50 bg-accent-soft" : "border-border";
              return inactive ? (
                <span className="rounded-xl border border-border px-2 py-1.5 text-center text-xs text-muted opacity-50" key={item.date}>{Number(item.date.slice(8))}</span>
              ) : (
                <Link
                  aria-current={item.date === date ? "date" : undefined}
                  className={`rounded-xl border px-2 py-1.5 text-center text-xs font-semibold ${tone} ${item.date === date ? "ring-2 ring-primary" : ""}`}
                  href={`?store=${store.id}&month=${monthKey}&date=${item.date}#day`}
                  key={item.date}
                >
                  {Number(item.date.slice(8))}
                  <span className="block text-[0.6rem] font-normal text-muted">{statusText(item)}</span>
                </Link>
              );
            })}
          </nav>
        </>
      ) : null}

      {day && month.start ? <DayPanel day={day} hideSoftware={hideSoftware} isCashier={isCashier} isOwner={isOwner} monthKey={monthKey} otherStores={otherStores} profileName={profile.full_name} staff={staff} store={store} isManager={profile.role === "manager"} /> : null}

      {isOwner || isAccountant ? (
        <Panel description="Old months brought in from a workbook. Workbook 'Expenses' combine card/UPI deductions and expenses, so each day keeps one legacy combined deduction and no invented split, counted cash or adjustment." title="Imported history">
          {imports.length ? (
            <ul className="space-y-2 text-sm">
              {imports.map((item) => (
                <li className="rounded-2xl border border-border bg-background p-3" key={item.id}>
                  <span className="font-semibold">{shortDate(item.period_from)} – {shortDate(item.period_to)}</span> · {item.file_name} ({item.sheet}) · opening ₹{fmt(item.opening)} → closing ₹{fmt(item.closing)}
                  <span className="block text-xs text-muted">Imported {shortDate(item.imported_at)} by {item.by ?? "—"} · Book Sales ₹{fmt(item.totals.book_sales as number)} · combined deductions ₹{fmt(item.totals.combined_deduction as number)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing imported for {store.name}. The owner can import a checked workbook month (validated, imported once).</Empty>}
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

function MonthBar({ month, storeId }: { month: string; storeId: string }) {
  const link = (shift: number) => `?store=${storeId}&month=${shiftMonth(month, shift).slice(0, 7)}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link aria-label="Previous month" className="flex h-10 items-center gap-1 rounded-xl border border-border bg-card px-3 text-sm font-semibold" href={link(-1)}>
        <ChevronLeft className="size-4" />{monthTitle(shiftMonth(month, -1)).split(" ")[0]}
      </Link>
      <form className="flex items-center gap-2" method="get">
        <input name="store" type="hidden" value={storeId} />
        <label className="sr-only" htmlFor="cash-month">Month</label>
        <input className="h-10 rounded-xl border border-border bg-card px-3 text-sm font-semibold" defaultValue={month.slice(0, 7)} id="cash-month" name="month" type="month" />
        <button className="h-10 rounded-xl border border-border bg-card px-3 text-sm font-semibold">Open</button>
      </form>
      <Link aria-label="Next month" className="flex h-10 items-center gap-1 rounded-xl border border-border bg-card px-3 text-sm font-semibold" href={link(1)}>
        {monthTitle(shiftMonth(month, 1)).split(" ")[0]}<ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

function DayPanel({ day, hideSoftware, isCashier, isManager, isOwner, monthKey, otherStores, profileName, staff, store }: {
  day: CashDay; hideSoftware: boolean; isCashier: boolean; isManager: boolean; isOwner: boolean; monthKey: string;
  otherStores: Array<{ id: string; name: string }>; profileName: string | null; staff: Array<{ id: string; name: string }>;
  store: { id: string; name: string };
}) {
  const closed = day.status === "closed" || day.status === "reviewed";
  const difference = day.cash_difference === null ? null : Number(day.cash_difference);
  const hasDeposit = Number(day.deposit) > 0;
  const celebrate = closed && day.source === "app" && difference !== null && Math.abs(difference) <= CASH_TOLERANCE && day.date >= addDays(indiaToday(), -1);
  const sw = day.software;
  const minus = (label: string, value: number | null | undefined) => (Number(value) ? <Row label={`− ${label}`} value={fmt(value)} /> : null);
  const hidden = <><input name="storeId" type="hidden" value={store.id} /><input name="date" type="hidden" value={day.date} /></>;

  return (
    <div className="space-y-5" id="day">
      <Panel
        description={day.bank_day ? "Bank day: deposit the cash in the bank." : "No bank deposit expected (Saturday, Sunday or bank holiday)."}
        title={`${store.name} · ${shortDate(day.date)}`}
      >
        {celebrate ? <Celebration id={`cash:${store.id}:${day.date}`} /> : null}
        {celebrate ? <p className="pop-in mb-3 rounded-2xl border border-success/40 bg-success/10 px-4 py-3 text-sm font-semibold">🎉 Cash matched. Well done{profileName ? `, ${profileName.split(" ")[0]}` : ""}!</p> : null}
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge tone={closed ? "good" : day.can_close ? "good" : "warn"}>{statusText(day)}</Badge>
          {closed ? differenceBadge(difference) : null}
          {closed && day.bank_day && !hasDeposit && day.source === "app" ? <Badge tone="warn">No bank deposit</Badge> : null}
          {sw.matches === true ? <Badge tone="good">Book Sales matches the report</Badge> : null}
          {sw.matches === false ? <Badge tone="bad">Book Sales differs from the report</Badge> : null}
          {sw.status === "pending" || (sw.status === "report" && sw.report_status !== "ready") ? <Badge>Sales report {sw.report_status === "processing" ? "processing" : "not uploaded yet"}</Badge> : null}
          {sw.overridden ? <Badge tone="warn">Software Sales corrected</Badge> : null}
          {sw.changed_after_close ? <Badge tone="bad">Report changed after closing: reconcile</Badge> : null}
          {day.flags.includes("negative_closing") ? <Badge tone="bad">Negative balance</Badge> : null}
          {day.source === "legacy_import" ? <Badge>Imported from workbook</Badge> : null}
        </div>

        {day.blocked === "before_start" ? <Notice tone="info">{store.name}&apos;s cash book starts on {shortDate(day.start?.date)}.</Notice> : (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="text-sm">
              <Row label="Opening (previous day's calculated closing)" value={fmt(day.opening)} />
              <Row label="+ Book Sales" value={fmt(day.book_sales)} />
              {day.legacy_mode && day.edc_legacy ? minus("EDC (card + UPI, old combined line)", day.edc_legacy) : null}
              {day.card !== null ? <Row label="− EDC / Card" value={fmt(day.card)} /> : null}
              {day.upi !== null ? <Row label="− UPI" value={fmt(day.upi)} /> : null}
              {minus("Bank deposits", day.deposit)}
              {minus("Shop expenses", day.shop_expenses)}
              {minus("Staff payments", day.staff)}
              {minus("Donations", day.donation)}
              {minus("Owner / home", day.owner_home)}
              {minus("Sent to other store", day.to_store)}
              {minus("Other payouts / adjustments", day.other_out)}
              {Number(day.other_in) ? <Row label="+ Cash received / adjustments" value={fmt(day.other_in)} /> : null}
              {minus("Legacy combined deduction (payments + expenses)", day.legacy_combined)}
              <Row label="= Calculated closing" strong value={fmt(day.closing)} />
              <Row label="Counted cash" value={day.source === "legacy_import" && day.counted === null ? "not counted (imported)" : fmt(day.counted)} />
              <Row label="Cash difference (counted − calculated)" value={signed(day.cash_difference)} />
              {!hideSoftware ? (
                <>
                  <Row label="Software Sales" value={fmt(sw.amount)} />
                  <Row label="Sales difference (software − book)" value={signed(day.sales_difference)} />
                </>
              ) : null}
              {day.bank_paid_expenses ? <p className="mt-2 text-xs text-muted">Also paid by UPI/bank (not from the drawer): ₹{fmt(day.bank_paid_expenses)}.</p> : null}
              {day.missing.length && !closed && day.exists ? <p className="mt-2 text-xs text-danger">Before closing, enter: {day.missing.filter((item) => item !== "opening").map((item) => missingLabel[item] ?? item).join(", ")}. Type 0 when there was none.</p> : null}
              {closed ? <p className="mt-2 text-xs text-muted">Closed by {day.closed_by ?? "—"}{day.reviewed_by ? ` · checked by ${day.reviewed_by}` : ""}{day.note ? ` · “${day.note}”` : ""}</p> : null}
              {day.reopened_by ? <p className="mt-1 text-xs text-muted">Reopened by {day.reopened_by} on {shortDate(day.reopened_at)}: “{day.reopen_reason}”</p> : null}
            </div>

            <div className="space-y-3">
              {day.can_edit ? (
                <div className="md:hidden">
                  <CashDayForm key={`${day.date}:${day.revision}`} month={`${monthKey}-01`} row={day} storeId={store.id} />
                </div>
              ) : null}
              {day.can_edit ? <p className="hidden text-xs text-muted md:block">Type Book Sales, Card, UPI, bank deposit and counted cash in the table above. Add expenses and other cash below.</p> : null}
              <p className="text-sm font-semibold">Lines ({day.entries.length})</p>
              {day.entries.length ? (
                <ul className="space-y-2 text-sm">
                  {day.entries.map((entry) => (
                    <li className="rounded-2xl border border-border bg-background p-3" key={entry.id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span>{entryText(entry)}</span>
                        <span className={`font-semibold tabular-nums ${entry.direction === "in" ? "text-success" : ""}`}>{entry.direction === "in" ? "+" : "−"}{fmt(entry.amount)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                        <span>by {entry.by ?? "—"}{entry.type === "to_store" ? ` · ${entry.transfer_status === "received" ? "received there" : "waiting for them to receive"}` : ""}</span>
                        {day.can_edit && (entry.mine || !isCashier) && entry.type !== "legacy_combined" ? (
                          <ActionForm action={deleteCashEntry} className="flex items-center gap-2" submitLabel="Remove" variant="secondary">
                            <input name="storeId" type="hidden" value={store.id} />
                            <input name="entryId" type="hidden" value={entry.id} />
                          </ActionForm>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <Empty>No lines.</Empty>}
              {day.paid_expenses.length ? (
                <>
                  <p className="text-sm font-semibold">Paid by UPI / bank (not from the drawer)</p>
                  <ul className="space-y-1 text-sm">
                    {day.paid_expenses.map((item) => (
                      <li className="flex justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2" key={item.id}>
                        <span>{cashCategoryLabel(item.category)} · {expensePaidFrom.find((option) => option.value === item.paid_from)?.label.split(" (")[0]}{item.note ? ` · ${item.note}` : ""}{item.reference ? ` · ref ${item.reference}` : ""}{item.status === "rejected" ? " · rejected" : ""}</span>
                        <span className="tabular-nums">{fmt(item.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        )}
      </Panel>

      {!hideSoftware && day.blocked !== "before_start" ? (
        <Panel description="From the current processed sales report for this store and day: bill lines with returns netted (summary lines only when the report has no bill lines). A correction changes the cash book comparison only, never the uploaded report." title="Software Sales">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold tabular-nums"><SoftwareCell hide={false} row={day} /></span>
              <Badge tone={sw.status === "override" ? "warn" : sw.status === "report" ? "good" : "muted"}>
                {sw.status === "override" ? "Corrected" : sw.status === "workbook" ? "Workbook figure (imported)" : sw.report_status === "ready" ? (sw.basis === "zero_confirmed" ? "No-sale day confirmed" : sw.basis === "zero_report" ? "Report shows no sale" : sw.basis === "summary" ? "Report (summary lines)" : "Report (bill lines)") : sw.report_status === "processing" ? "Report processing" : "Pending: no report"}
              </Badge>
              {sw.summary_ignored ? <Badge>Summary lines ignored (bill lines present)</Badge> : null}
            </div>
            {sw.status === "override" || sw.overridden ? (
              <p className="text-muted">Report value: {sw.report_status === "ready" ? `₹${fmt(sw.report_amount)}` : "pending"} · corrected to ₹{fmt(sw.override?.corrected ?? sw.amount)} by {sw.override?.by ?? "—"} · “{sw.override?.reason}”</p>
            ) : null}
            {sw.changed_after_close && sw.at_close ? (
              <Notice>Closed with Software Sales ₹{fmt(sw.at_close.amount)} ({sw.at_close.source}); the current report shows {sw.report_status === "ready" ? `₹${fmt(sw.report_amount)}` : sw.report_status}. The closing record is unchanged. The owner can reopen the day to reconcile.</Notice>
            ) : null}
            {sw.legacy_workbook !== null ? <p className="text-muted">Workbook Software Sales (as imported, with the owner&apos;s corrections): ₹{fmt(sw.legacy_workbook)}{sw.report_status === "ready" ? ` · uploaded report: ₹${fmt(sw.report_amount)}` : " · no uploaded report for this day"}</p> : null}
            {day.can_override ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <ActionForm action={overrideSoftwareSales} className="space-y-3" submitLabel={sw.overridden ? "Change the correction" : "Correct Software Sales"} variant="secondary">
                  {hidden}
                  <Field label="Corrected Software Sales (₹)"><input className={inputClass} inputMode="decimal" name="amount" required /></Field>
                  <Field hint="Required. Kept with your name and the time." label="Reason"><input className={inputClass} minLength={5} name="reason" required /></Field>
                </ActionForm>
                {sw.overridden ? (
                  <ActionForm action={restoreSoftwareSales} className="space-y-3" submitLabel="Restore report value" variant="secondary">
                    {hidden}
                    <Field label="Note (optional)"><input className={inputClass} name="reason" /></Field>
                  </ActionForm>
                ) : null}
              </div>
            ) : closed && (isOwner || sw.overridden) ? <p className="text-xs text-muted">Closed days must be reopened by the owner before Software Sales can be corrected.</p> : null}
            {day.overrides.length ? (
              <details className="text-xs">
                <summary className="cursor-pointer font-semibold">Correction history ({day.overrides.length})</summary>
                <ul className="mt-2 space-y-1">
                  {day.overrides.map((item) => (
                    <li key={item.id}>
                      {shortDate(item.at)} · {item.by ?? "—"}: report {item.original === null ? item.original_status : `₹${fmt(item.original)}`} → ₹{fmt(item.corrected)} · “{item.reason}”
                      {item.restored_at ? ` · ended ${shortDate(item.restored_at)} by ${item.restored_by ?? "—"} (${item.restore_reason ?? ""})` : " · active"}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {day.can_edit && day.incoming.length ? (
        <Panel description="Cash sent by the other store. Confirm when it is in your drawer; it is added to this day." title="Cash coming from another store">
          <ul className="space-y-2 text-sm">
            {day.incoming.map((item) => (
              <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-background p-3" key={item.id}>
                <span><span className="font-semibold">₹{fmt(item.amount)}</span> from {item.from} · sent {shortDate(item.sent_date)}{item.note ? ` · ${item.note}` : ""}</span>
                <ActionForm action={receiveCashTransfer} className="flex items-center gap-2" submitLabel="Received">
                  {hidden}
                  <input name="transferId" type="hidden" value={item.id} />
                </ActionForm>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {day.can_edit ? (
        <Panel description="Expenses (with how they were paid), staff payments, owner/home cash, donations, transfers and cash received. Card and UPI collections are typed on the day, not here." title="Add a line">
          <CashEntryForm action={addCashEntry} date={day.date} isOwner={isOwner} staff={staff} storeId={store.id} stores={otherStores} />
        </Panel>
      ) : null}

      {day.can_close ? (
        <Panel description="All figures are entered and the previous day is closed. Closing freezes the opening, the calculated closing and the Software Sales used." title="Close the day">
          <ActionForm action={closeCashDay} className="flex flex-wrap items-end gap-3" submitLabel="Close the day">
            {hidden}
            <input name="revision" type="hidden" value={day.revision} />
          </ActionForm>
        </Panel>
      ) : null}

      {closed && (isOwner || isManager) ? (
        <Panel title="Owner and manager">
          <div className="grid gap-4 lg:grid-cols-2">
            {day.status === "closed" ? (
              <ActionForm action={reviewCashDay} className="space-y-3" submitLabel="Mark as checked" variant="secondary">
                {hidden}
                <Field label="Note (optional)"><input className={inputClass} name="note" /></Field>
              </ActionForm>
            ) : null}
            {isOwner ? (
              <ActionForm action={reopenCashDay} className="space-y-3" submitLabel="Reopen this day and later days" variant="secondary">
                {hidden}
                <Field hint="Required; recorded on every day reopened. Any later closed days reopen too, so their balances follow your correction. Close them again with “Close ready days in order”." label="Why reopen"><input className={inputClass} minLength={5} name="reason" required /></Field>
              </ActionForm>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {day.events.length ? (
        <details className="rounded-[1.35rem] border border-border bg-card p-5 text-sm shadow-sm">
          <summary className="cursor-pointer font-semibold">Who changed this day ({day.events.length})</summary>
          <ul className="mt-3 space-y-1 text-xs">
            {day.events.map((event, index) => (
              <li key={`${event.at}:${index}`}>
                {new Date(event.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} · {eventLabel[event.action] ?? event.action} · {event.by ?? event.role ?? "system"}{event.reason ? ` · “${event.reason}”` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

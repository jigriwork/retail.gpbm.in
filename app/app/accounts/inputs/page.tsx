import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { coverageLabels, indiaToday, money, shortDate } from "@/lib/accounts/format";
import { confirmZeroSalesDay } from "@/lib/accounts/master-actions";
import { listFinanceStores, listFirms, listStoreFirmPeriods, salesCoverage } from "@/lib/accounts/queries";

const tone = (status: string) => (status === "bill_level" || status === "zero_confirmed" ? "good" : status === "missing" ? "bad" : "warn") as "good" | "bad" | "warn";

export default async function SalesInputsPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Sales inputs are visible to the owner and people with accounts access." />;
  const params = await searchParams;
  const stores = (await listFinanceStores()).filter((store) => store.is_active);
  const store = stores.find((item) => item.id === params.store) ?? stores[0];
  const today = indiaToday();
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today.slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const days = store ? await salesCoverage(store.id, `${month}-01`, last < today ? last : today) : [];
  const [periods, firms] = await Promise.all([listStoreFirmPeriods(), listFirms()]);
  const firmName = (id: string) => firms.find((firm) => firm.id === id)?.name ?? "—";
  // The firm each day bills under; null when no single confirmed period covers it.
  const firmOn = (day: string) => {
    const matches = periods.filter((period) => period.store_id === store?.id && period.status === "confirmed"
      && (!period.valid_from || period.valid_from <= day) && (!period.valid_to || period.valid_to >= day));
    return matches.length === 1 ? firmName(matches[0].firm_id) : null;
  };
  const unconfirmedDays = days.filter((day) => !firmOn(day.day)).length;
  const incomplete = days.filter((day) => !["bill_level", "zero_confirmed"].includes(day.status));
  const unreconciled = days.reduce((sum, day) => sum + day.unreconciled_lines, 0);
  const months = Array.from({ length: 8 }, (_, index) => {
    const date = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - index, 1));
    return date.toISOString().slice(0, 7);
  });

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/inputs" session={session} />
      <AccountsHeader
        description="Company workings use the daily sales reports managers already upload. A day counts only when its report has bill and item lines, or when no sales are confirmed for that day."
        title="Sales inputs"
      />
      <Panel title="Choose store and month">
        <form className="flex flex-wrap gap-2">
          <select className={`${inputClass} max-w-56`} defaultValue={store?.id} name="store">
            {stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className={`${inputClass} max-w-40`} defaultValue={month} name="month">
            {months.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show</button>
        </form>
      </Panel>
      {unconfirmedDays ? (
        <Notice>
          {unconfirmedDays} day{unconfirmedDays > 1 ? "s" : ""} in {month} {unconfirmedDays > 1 ? "have" : "has"} no confirmed billing firm for {store?.name}.
          Their sales are not counted in either firm&apos;s workings until the date is confirmed under <Link className="font-semibold underline" href="/app/accounts/firms">Firms &amp; stores</Link>.
        </Notice>
      ) : null}
      {incomplete.length ? (
        <Notice>
          {incomplete.length} day{incomplete.length > 1 ? "s" : ""} in {month} {incomplete.length > 1 ? "are" : "is"} incomplete. Any company working covering
          {incomplete.length > 1 ? " these days" : " this day"} will show “Working incomplete” until the bill-level report is uploaded, or no sales are confirmed.
        </Notice>
      ) : days.length ? <Notice tone="info">Every day so far has bill-level sales or a confirmed zero.</Notice> : null}
      {unreconciled ? (
        <Notice tone="info">
          {unreconciled} line{unreconciled > 1 ? "s" : ""} where discount and tax columns do not add up to the net amount (usually a discount applied before tax). They keep their net
          amount; workings flag them for review.
        </Notice>
      ) : null}
      <Panel title={store ? `${store.name} · ${month}` : "No store"}>
        <div className="divide-y divide-border">
          {days.map((day) => (
            <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" key={day.day}>
              <span className="w-28 font-semibold">{shortDate(day.day)}</span>
              <span className="flex-1">
                <Badge tone={tone(day.status)}>{coverageLabels[day.status] ?? day.status}</Badge>
                {firmOn(day.day) ? <span className="ml-2 text-xs text-muted">Billed under {firmOn(day.day)}</span> : <span className="ml-2"><Badge tone="warn">firm to confirm</Badge></span>}
                {day.report_id ? <span className="ml-2 text-muted">{day.item_lines} lines · {money(day.net_sale)}{day.summary_lines ? ` · ${day.summary_lines} summary lines` : ""}{day.unreconciled_lines ? ` · ${day.unreconciled_lines} to check` : ""}</span> : null}
              </span>
              {day.status === "missing" ? (
                <ActionForm action={confirmZeroSalesDay} className="flex items-center gap-2" submitLabel="No sales this day" variant="secondary">
                  <input name="storeId" type="hidden" value={store!.id} />
                  <input name="saleDate" type="hidden" value={day.day} />
                  <input className={`${inputClass} h-9 w-40`} name="note" placeholder="Reason (closed…)" />
                </ActionForm>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Missing reports are uploaded by the store manager under <Link className="underline" href="/app/reports/sales">Reports → Sales</Link>.
        </p>
      </Panel>
    </div>
  );
}

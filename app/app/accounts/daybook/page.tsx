import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Empty, inputClass, Pager, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { labelFor, money, shortDate, voucherTypes } from "@/lib/accounts/format";
import { dayBook, monthRange } from "@/lib/accounts/ledger-queries";
import { listFirms } from "@/lib/accounts/queries";

export default async function DayBookPage({ searchParams }: { searchParams: Promise<{ firm?: string; month?: string; type?: string; page?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="The day book is visible to the owner and people with accounts access." />;
  const params = await searchParams;
  const firms = await listFirms();
  const firm = firms.find((item) => item.id === params.firm) ?? null;
  const { from, month, to } = monthRange(params.month);
  const type = voucherTypes.some((item) => item.value === params.type) ? params.type! : "";
  const page = Math.max(0, Number(params.page) || 0);
  const { vouchers, total, pageSize } = await dayBook(firm?.id ?? null, from, to, page, type);
  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/daybook" session={session} />
      <AccountsHeader description="Every posted voucher, newest first. Each opens its entries, adjustments and documents." title="Day book" />
      <Panel title="Filter">
        <form className="flex flex-wrap gap-2">
          <select className={`${inputClass} max-w-48`} defaultValue={firm?.id ?? ""} name="firm"><option value="">All firms</option>{firms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <input className={`${inputClass} max-w-40`} defaultValue={month} name="month" type="month" />
          <select className={`${inputClass} max-w-48`} defaultValue={type} name="type"><option value="">All entries</option>{voucherTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show</button>
          {firm ? <a className="inline-flex h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold" href={`/app/accounts/daybook/export?firm=${firm.id}&month=${month}`}>Download for CA / Tally (CSV)</a> : <span className="self-center text-xs text-muted">Choose a firm to download its day book.</span>}
        </form>
      </Panel>
      <Panel title={`${month}${firm ? ` · ${firm.name}` : " · all firms (each firm's books stay separate)"}`}>
        {vouchers.length ? (
          <div className="divide-y divide-border">
            {vouchers.map((voucher) => (
              <Link className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" href={`/app/accounts/vouchers/${voucher.id}`} key={voucher.id}>
                <span>
                  <span className="font-semibold">{voucher.voucher_no}</span> · {labelFor(voucherTypes, voucher.voucher_type)} · {voucher.parties?.legal_name ?? "—"}
                  <span className="block text-xs text-muted">{shortDate(voucher.voucher_date)} · {voucher.billing_firms?.name}{voucher.reference_no ? ` · ${voucher.reference_no}` : ""}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{money(voucher.amount)}</span>
                  {voucher.status === "reversed" ? <Badge>reversed</Badge> : null}
                </span>
              </Link>
            ))}
          </div>
        ) : <Empty>No entries.</Empty>}
        <Pager base="/app/accounts/daybook" page={page} pageSize={pageSize} query={{ ...(firm ? { firm: firm.id } : {}), month, ...(type ? { type } : {}) }} total={total} />
      </Panel>
    </div>
  );
}

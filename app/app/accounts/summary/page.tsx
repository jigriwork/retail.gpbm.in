import { AccessDenied } from "@/components/app/access-denied";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Empty, inputClass, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { financialYear, indiaToday, money } from "@/lib/accounts/format";
import { listAllBrands, listAllParties, listFinanceStores, listFirms } from "@/lib/accounts/queries";
import { createClient } from "@/lib/supabase/server";

export default async function SummaryPage({ searchParams }: { searchParams: Promise<{ firm?: string; store?: string; brand?: string; from?: string; to?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Reports are visible to the owner and people with accounts access." />;
  const params = await searchParams;
  const today = indiaToday();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "") ? params.from! : `${financialYear(today).slice(0, 4)}-04-01`;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "") ? params.to! : today;
  const [firms, stores, brands, parties] = await Promise.all([listFirms(), listFinanceStores(), listAllBrands(), listAllParties()]);
  const { data, error } = await (await createClient()).rpc("accounts_summary", {
    p_brand: params.brand || null, p_firm: params.firm || null, p_from: from, p_store: params.store || null, p_to: to,
  });
  if (error) throw new Error("The summary could not be loaded. Please retry.");
  const name = (list: Array<{ id: string }>, id: string | null, key: string) => (id ? ((list.find((item) => item.id === id) as Record<string, string> | undefined)?.[key] ?? "—") : "—");
  const rows = data ?? [];
  const paise = (field: "purchases_total" | "payments" | "credit_notes" | "debit_notes") => (firmId: string) =>
    rows.filter((row) => row.firm_id === firmId).reduce((sum, row) => sum + Math.round(Number(row[field]) * 100), 0) / 100;

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/summary" session={session} />
      <AccountsHeader description="Purchases, payments and notes by firm, store, supplier and brand. Each firm is shown on its own; nothing merges separate books." title="Summary" />
      <Panel title="Filter">
        <form className="flex flex-wrap gap-2">
          <select className={`${inputClass} max-w-44`} defaultValue={params.firm ?? ""} name="firm"><option value="">All firms</option>{firms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select className={`${inputClass} max-w-44`} defaultValue={params.store ?? ""} name="store"><option value="">All stores</option>{stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select className={`${inputClass} max-w-44`} defaultValue={params.brand ?? ""} name="brand"><option value="">All brands</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <input className={`${inputClass} max-w-40`} defaultValue={from} name="from" type="date" />
          <input className={`${inputClass} max-w-40`} defaultValue={to} name="to" type="date" />
          <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show</button>
        </form>
      </Panel>
      {firms.filter((firm) => rows.some((row) => row.firm_id === firm.id)).map((firm) => (
        <Panel description={`Purchases ${money(paise("purchases_total")(firm.id))} · payments ${money(paise("payments")(firm.id))} · credit notes ${money(paise("credit_notes")(firm.id))} · debit notes ${money(paise("debit_notes")(firm.id))}`} key={firm.id} title={firm.name}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-1 pr-3">Supplier</th><th className="pr-3">Brand</th><th className="pr-3">Store</th><th className="pr-3 text-right">Pieces</th><th className="pr-3 text-right">Purchases</th><th className="pr-3 text-right">Payments</th><th className="pr-3 text-right">CN</th><th className="text-right">DN</th></tr></thead>
              <tbody className="divide-y divide-border">
                {rows.filter((row) => row.firm_id === firm.id).map((row, index) => (
                  <tr key={index}>
                    <td className="py-1.5 pr-3">{name(parties, row.party_id, "legal_name")}</td><td className="pr-3">{row.brand_id ? name(brands, row.brand_id, "name") : ""}</td>
                    <td className="pr-3">{name(stores, row.store_id, "name")}</td><td className="pr-3 text-right">{Number(row.purchase_qty) || ""}</td>
                    <td className="pr-3 text-right">{Number(row.purchases_total) ? money(row.purchases_total) : ""}</td><td className="pr-3 text-right">{Number(row.payments) ? money(row.payments) : ""}</td>
                    <td className="pr-3 text-right">{Number(row.credit_notes) ? money(row.credit_notes) : ""}</td><td className="text-right">{Number(row.debit_notes) ? money(row.debit_notes) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
      {!rows.length ? <Panel title="No entries"><Empty>No posted entries for this filter.</Empty></Panel> : null}
    </div>
  );
}

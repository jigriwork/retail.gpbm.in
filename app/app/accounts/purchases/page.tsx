import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Empty, Pager, Panel } from "@/components/accounts/fields";
import { PurchaseHeaderFields } from "@/components/accounts/purchase-header-fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { money, shortDate } from "@/lib/accounts/format";
import { savePurchaseDraft } from "@/lib/accounts/ledger-actions";
import { listPurchases } from "@/lib/accounts/ledger-queries";
import { listAllParties, listFirms, storesWithFirmToday } from "@/lib/accounts/queries";

const statusTone = { cancelled: "muted", draft: "warn", posted: "good" } as const;

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Purchases are visible to the owner and people with accounts access." />;
  const params = await searchParams;
  const page = Math.max(0, Number(params.page) || 0);
  const status = ["draft", "posted", "cancelled"].includes(params.status ?? "") ? params.status! : "";
  const [{ purchases, total, pageSize }, parties, firms, stores] = await Promise.all([listPurchases(page, status), listAllParties(), listFirms(), storesWithFirmToday()]);

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/purchases" session={session} />
      <AccountsHeader
        description="Supplier invoices. Enter the invoice header as printed, add item lines by hand or from the supplier's item sheet, attach the PDF, and post once the totals agree. One supplier invoice number is entered only once per financial year."
        title="Purchases"
      />
      {session.can.post ? (
        <Panel description="The billing firm is picked from the store and invoice date. If the invoice is billed to a different firm, choose it." title="New purchase">
          <ActionForm action={savePurchaseDraft} submitLabel="Create draft">
            <PurchaseHeaderFields firms={firms} parties={parties} stores={stores} />
          </ActionForm>
        </Panel>
      ) : null}
      <Panel
        action={
          <div className="flex gap-1 text-xs font-semibold">
            {["", "draft", "posted", "cancelled"].map((item) => (
              <Link className={item === status ? "rounded-full bg-primary px-3 py-1 text-white" : "rounded-full border border-border px-3 py-1 text-muted"} href={item ? `/app/accounts/purchases?status=${item}` : "/app/accounts/purchases"} key={item}>
                {item || "All"}
              </Link>
            ))}
          </div>
        }
        title="Purchase invoices"
      >
        {purchases.length ? (
          <div className="divide-y divide-border">
            {purchases.map((purchase) => (
              <Link className="flex flex-wrap items-center justify-between gap-2 py-3" href={`/app/accounts/purchases/${purchase.id}`} key={purchase.id}>
                <span>
                  <span className="font-semibold">{purchase.parties?.legal_name} · {purchase.supplier_invoice_no}</span>
                  <span className="block text-sm text-muted">
                    {shortDate(purchase.invoice_date)} · {purchase.stores?.name} · Billed under {purchase.billing_firms?.name}
                    {purchase.due_date ? ` · due ${shortDate(purchase.due_date)}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{money(purchase.invoice_total)}</span>
                  <Badge tone={statusTone[purchase.status as keyof typeof statusTone] ?? "muted"}>{purchase.status}</Badge>
                </span>
              </Link>
            ))}
          </div>
        ) : <Empty>No purchases yet.</Empty>}
        <Pager base="/app/accounts/purchases" page={page} pageSize={pageSize} query={status ? { status } : {}} total={total} />
      </Panel>
    </div>
  );
}

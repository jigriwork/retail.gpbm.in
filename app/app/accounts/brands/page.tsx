import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Empty, Field, inputClass, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { shortDate } from "@/lib/accounts/format";
import { addBrandAlias, saveBrand } from "@/lib/accounts/master-actions";
import { listBrands } from "@/lib/accounts/queries";

export default async function BrandsPage() {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Brands are visible to the owner and people with accounts access." />;
  const brands = await listBrands();
  const canEdit = session.can.masters;

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/brands" session={session} />
      <AccountsHeader
        description="Brands and who supplies them. A brand name never decides the supplier: one brand can come from different suppliers over time or by store."
        title="Brands"
      />
      {canEdit ? (
        <Panel title="Add a brand">
          <ActionForm action={saveBrand} className="flex flex-wrap items-end gap-3" submitLabel="Add brand">
            <div className="min-w-56 flex-1"><Field label="Brand name"><input className={inputClass} name="name" placeholder="PEPE JEANS" required /></Field></div>
            <Field label="Type">
              <select className={inputClass} name="isMerchandise">
                <option value="on">Merchandise</option>
                <option value="off">Not merchandise (scheme, voucher)</option>
              </select>
            </Field>
          </ActionForm>
        </Panel>
      ) : null}

      <Panel description="“Spellings” link the names used in the daily sales report (COMPANY NAME), stock report and invoices to the brand." title={`${brands.length} brands`}>
        {brands.length ? (
          <div className="space-y-3">
            {brands.map((brand) => (
              <details className="rounded-2xl border border-border bg-background p-4" key={brand.id}>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{brand.name}</span>
                  <span className="flex flex-wrap gap-2">
                    {brand.is_merchandise ? null : <Badge>Not merchandise</Badge>}
                    <Badge>{brand.arrangements.length} supplier link{brand.arrangements.length === 1 ? "" : "s"}</Badge>
                    {brand.is_active ? null : <Badge>Inactive</Badge>}
                  </span>
                </summary>
                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <p className="font-medium">Suppliers</p>
                    {brand.arrangements.length ? (
                      <ul className="mt-1 space-y-1 text-muted">
                        {brand.arrangements.map((arrangement) => (
                          <li key={arrangement.id}>
                            <Link className="font-semibold text-foreground underline" href={`/app/accounts/parties/${arrangement.party_id}`}>{arrangement.parties?.legal_name}</Link>
                            {" "}· {arrangement.billing_firms?.name}{arrangement.stores?.name ? ` · ${arrangement.stores.name}` : ""} · {shortDate(arrangement.valid_from)} → {arrangement.valid_to ? shortDate(arrangement.valid_to) : "now"} · {arrangement.status}
                          </li>
                        ))}
                      </ul>
                    ) : <Empty>No supplier linked. Link one under Company terms.</Empty>}
                  </div>
                  <div>
                    <p className="font-medium">Spellings</p>
                    <div className="mt-1 flex flex-wrap gap-2">{brand.aliases.length ? brand.aliases.map((alias) => <Badge key={alias.id}>{alias.alias} · {alias.source}</Badge>) : <Empty>None.</Empty>}</div>
                  </div>
                  {canEdit ? (
                    <ActionForm action={addBrandAlias} className="flex flex-wrap items-end gap-3" submitLabel="Link spelling" variant="secondary">
                      <input name="brandId" type="hidden" value={brand.id} />
                      <div className="min-w-48 flex-1"><Field label="Spelling"><input className={inputClass} name="alias" placeholder="PEPE" required /></Field></div>
                      <Field label="Seen in">
                        <select className={inputClass} name="source">
                          <option value="sales">Sales report</option>
                          <option value="stock">Stock report</option>
                          <option value="invoice">Invoice</option>
                          <option value="other">Other</option>
                        </select>
                      </Field>
                    </ActionForm>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        ) : <Empty>No brands yet.</Empty>}
      </Panel>
    </div>
  );
}

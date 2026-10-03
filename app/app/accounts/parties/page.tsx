import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Check, Empty, Field, inputClass, Pager, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { saveParty } from "@/lib/accounts/master-actions";
import { listParties } from "@/lib/accounts/queries";

export default async function PartiesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Suppliers are visible to the owner and people with accounts access." />;
  const params = await searchParams;
  const search = (params.q ?? "").slice(0, 80);
  const page = Math.max(0, Number(params.page) || 0);
  const { parties, total, pageSize } = await listParties(search, page);

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/parties" session={session} />
      <AccountsHeader
        description="Legal supplier and distributor accounts. One supplier can supply many brands; each brand view and the combined balance stay inside one billing firm's books."
        title="Suppliers"
      />
      <Panel title="Find a supplier">
        <form className="flex gap-2">
          <input className={inputClass} defaultValue={search} name="q" placeholder="Name or GSTIN" />
          <button className="h-11 shrink-0 rounded-xl border border-border px-4 text-sm font-semibold">Search</button>
        </form>
        <div className="mt-4 divide-y divide-border">
          {parties.length ? parties.map((party) => (
            <Link className="flex flex-wrap items-center justify-between gap-2 py-3" href={`/app/accounts/parties/${party.id}`} key={party.id}>
              <span>
                <span className="font-semibold">{party.legal_name}</span>
                {party.display_name ? <span className="text-sm text-muted"> · {party.display_name}</span> : null}
              </span>
              <span className="flex gap-2">
                {party.gstin ? <Badge>{party.gstin}</Badge> : <Badge tone="warn">No GSTIN</Badge>}
                {party.is_active ? null : <Badge>Inactive</Badge>}
              </span>
            </Link>
          )) : <Empty>{search ? "No supplier matches that search." : "No suppliers yet. Add the first one below."}</Empty>}
        </div>
        <Pager base="/app/accounts/parties" page={page} pageSize={pageSize} query={search ? { q: search } : {}} total={total} />
      </Panel>

      {session.can.masters ? (
        <Panel description="Use the legal name and GSTIN printed on the supplier's invoices. Similar names are flagged before saving; nothing is merged automatically." title="Add a supplier">
          <ActionForm action={saveParty} submitLabel="Add supplier">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Legal name (as on invoice)"><input className={inputClass} name="legalName" placeholder="Vikash Sales Corporation" required /></Field>
              <Field label="Short name (optional)"><input className={inputClass} name="displayName" placeholder="Vikash" /></Field>
              <Field label="GSTIN"><input className={inputClass} name="gstin" placeholder="15 characters" /></Field>
              <Field hint="Only when there is no GSTIN" label="Why no GSTIN?"><input className={inputClass} name="gstinException" placeholder="Unregistered supplier" /></Field>
              <Field label="State code"><input className={inputClass} inputMode="numeric" maxLength={2} name="stateCode" placeholder="21" /></Field>
              <Field label="Phone"><input className={inputClass} name="phone" /></Field>
              <Field label="Email"><input className={inputClass} name="email" type="email" /></Field>
              <Field label="Address"><input className={inputClass} name="address" /></Field>
            </div>
            <Check label="This is a different supplier (save even if a similar one exists)" name="confirmNew" />
          </ActionForm>
        </Panel>
      ) : null}
    </div>
  );
}

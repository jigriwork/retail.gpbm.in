import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Check, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { indiaToday, shortDate } from "@/lib/accounts/format";
import { grantFinanceAccess, revokeFinanceAccess } from "@/lib/accounts/master-actions";
import { listFinanceStores, listFirms, listGrantsWithPeople } from "@/lib/accounts/queries";

export default async function AccessPage() {
  const session = await getFinanceSession();
  if (!session.isOwner) return <AccessDenied message="Only an owner manages accounts access." />;
  const [{ grants, people }, firms, stores] = await Promise.all([listGrantsWithPeople(), listFirms(), listFinanceStores()]);
  const person = (id: string) => people.find((item) => item.id === id);
  const name = (list: Array<{ id: string; name: string }>, id: string | null) => (id ? list.find((item) => item.id === id)?.name ?? "—" : null);
  const today = indiaToday();

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/access" session={session} />
      <AccountsHeader
        description="Who can use Accounts and for which firm or store. Accountants sign in with their own account and only see Accounts; they never get owner access to payroll, notes or other areas."
        title="Accounts access"
      />
      <Notice tone="info">
        To add an accountant, first create their login under <Link className="font-semibold underline" href="/app/users">Users</Link> with the Accountant role, then give access here.
        Managers keep uploading sales and stock and can submit purchase documents for their stores without any access here; give them access only if they should see ledgers or post entries.
      </Notice>
      <Panel title="Give access">
        {people.length ? (
          <ActionForm action={grantFinanceAccess} submitLabel="Give access">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Person">
                <select className={inputClass} name="userId" required>
                  {people.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.full_name ?? item.email} · {item.role}</option>)}
                </select>
              </Field>
              <Field hint="All firms = can see every firm's books" label="Firm">
                <select className={inputClass} name="firmId">
                  <option value="">All firms</option>
                  {firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
                </select>
              </Field>
              <Field hint="A single store cannot see firm-wide entries such as payments" label="Store">
                <select className={inputClass} name="storeId">
                  <option value="">All stores</option>
                  {stores.filter((store) => store.is_active).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </Field>
              <Field label="From"><input className={inputClass} defaultValue={today} name="validFrom" type="date" required /></Field>
              <Field label="Until (optional)"><input className={inputClass} name="validTo" type="date" /></Field>
              <Field label="Note"><input className={inputClass} name="note" placeholder="Monthly accountant" /></Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <p className="text-sm text-muted sm:col-span-2">Viewing is always included. Also allow:</p>
              <Check label="Enter purchases, payments, notes and returns" name="canPost" />
              <Check label="Add suppliers, brands, terms and stores" name="canMasters" />
              <Check label="Confirm terms and approve workings" name="canApprove" />
              <Check label="Close months" name="canClose" />
            </div>
          </ActionForm>
        ) : <Empty>No accountant or manager accounts yet. Create one under Users.</Empty>}
      </Panel>
      <Panel title="Current and past access">
        {grants.length ? (
          <div className="space-y-2">
            {grants.map((grant) => {
              const who = person(grant.user_id);
              const live = !grant.revoked_at && grant.valid_from <= today && (!grant.valid_to || grant.valid_to >= today);
              return (
                <div className="rounded-xl border border-border bg-background p-3 text-sm" key={grant.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{who?.full_name ?? who?.email ?? "Unknown"} <span className="font-normal text-muted">· {who?.role}{who && !who.is_active ? " (account inactive)" : ""}</span></span>
                    <Badge tone={live ? "good" : "muted"}>{grant.revoked_at ? "removed" : live ? "active" : "not active"}</Badge>
                  </div>
                  <p className="mt-1 text-muted">
                    {name(firms, grant.firm_id) ?? "All firms"} · {name(stores, grant.store_id) ?? "all stores"} · view
                    {grant.can_post ? ", post" : ""}{grant.can_manage_masters ? ", masters" : ""}{grant.can_approve ? ", approve" : ""}{grant.can_close_period ? ", close months" : ""}
                    {" "}· {shortDate(grant.valid_from)} → {grant.valid_to ? shortDate(grant.valid_to) : "open"}{grant.note ? ` · ${grant.note}` : ""}
                  </p>
                  {!grant.revoked_at ? (
                    <ActionForm action={revokeFinanceAccess} className="mt-2 flex items-center gap-2" submitLabel="Remove access" variant="secondary">
                      <input name="grantId" type="hidden" value={grant.id} />
                    </ActionForm>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : <Empty>No accounts access given yet.</Empty>}
      </Panel>
    </div>
  );
}

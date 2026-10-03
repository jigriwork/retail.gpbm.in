import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Check, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { History } from "@/components/accounts/history";
import { getFinanceSession } from "@/lib/accounts/access";
import { labelFor, settlementBases, shortDate } from "@/lib/accounts/format";
import { addPartyAlias, saveAgent, saveParty } from "@/lib/accounts/master-actions";
import { partyBalances } from "@/lib/accounts/ledger-queries";
import { getParty, listFirms, recentFinanceEvents } from "@/lib/accounts/queries";
import { drCr, money } from "@/lib/accounts/format";

export default async function PartyPage({ params, searchParams }: { params: Promise<{ partyId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Suppliers are visible to the owner and people with accounts access." />;
  const [{ partyId }, { saved }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(partyId)) notFound();
  const [{ party, aliases, agents, arrangements }, history, firms, balances] = await Promise.all([
    getParty(partyId), recentFinanceEvents("parties", partyId), listFirms(), partyBalances(null, partyId),
  ]);
  if (!party) notFound();
  const canEdit = session.can.masters;

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/parties" session={session} />
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Link className="text-sm font-semibold text-muted" href="/app/accounts/parties">← Suppliers</Link>
        <h1 className="mt-2 text-3xl font-semibold">{party.legal_name}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {party.gstin ? <Badge>{party.gstin}</Badge> : <Badge tone="warn">No GSTIN{party.gstin_exception ? `: ${party.gstin_exception}` : ""}</Badge>}
          {party.is_active ? <Badge tone="good">Active</Badge> : <Badge>Inactive</Badge>}
        </div>
      </section>
      {saved ? <Notice tone="info">Supplier added. Add its agents and the brands it supplies below.</Notice> : null}

      <Panel description="One account per supplier; each billing firm keeps its own ledger." title="Balances by firm">
        <div className="grid gap-3 sm:grid-cols-2">
          {firms.map((firm) => {
            const row = balances.find((item) => item.firm_id === firm.id);
            return (
              <Link className="rounded-2xl border border-border bg-background p-4 transition hover:border-primary" href={`/app/accounts/parties/${party.id}/ledger?firm=${firm.id}`} key={firm.id}>
                <p className="font-semibold">{firm.name}</p>
                <p className="mt-1 text-sm text-muted">Ledger balance {drCr(row?.ledger_balance ?? 0)} · due {money(row?.due_now ?? 0)} · advance {money(row?.advance ?? 0)}</p>
                <p className="mt-2 text-sm font-semibold text-primary">Open ledger →</p>
              </Link>
            );
          })}
        </div>
      </Panel>

      <Panel description="Brand, billing firm and dates. The ledger for this supplier is kept separately for each billing firm." title="Brands supplied">
        {arrangements.length ? (
          <div className="divide-y divide-border">
            {arrangements.map((arrangement) => (
              <div className="flex flex-wrap items-center justify-between gap-2 py-3" key={arrangement.id}>
                <div>
                  <p className="font-semibold">{arrangement.brands?.name}</p>
                  <p className="text-sm text-muted">
                    Billed under {arrangement.billing_firms?.name}{arrangement.stores?.name ? ` · ${arrangement.stores.name} only` : " · all its stores"} ·{" "}
                    {shortDate(arrangement.valid_from)} → {arrangement.valid_to ? shortDate(arrangement.valid_to) : "now"}
                  </p>
                </div>
                <span className="flex gap-2">
                  <Badge tone={arrangement.settlement_basis === "to_confirm" ? "warn" : "muted"}>{labelFor(settlementBases, arrangement.settlement_basis)}</Badge>
                  <Badge tone={arrangement.status === "confirmed" ? "good" : "warn"}>{arrangement.status}</Badge>
                </span>
              </div>
            ))}
          </div>
        ) : <Empty>No brands linked yet.</Empty>}
        <Link className="mt-3 inline-flex text-sm font-semibold text-primary" href={`/app/accounts/terms?party=${party.id}`}>Link a brand and terms →</Link>
      </Panel>

      <Panel description="People who represent this supplier. Not the salespeople in the daily sales report." title="Agents and contacts">
        {agents.length ? (
          <ul className="mb-4 divide-y divide-border">
            {agents.map((link) => (
              <li className="py-2 text-sm" key={link.id}>
                <span className="font-semibold">{link.agents?.name}</span>
                {link.role ? ` · ${link.role}` : ""}{link.agents?.phone ? ` · ${link.agents.phone}` : ""}{link.agents?.email ? ` · ${link.agents.email}` : ""}
              </li>
            ))}
          </ul>
        ) : <div className="mb-4"><Empty>No agents yet.</Empty></div>}
        {canEdit ? (
          <ActionForm action={saveAgent} submitLabel="Add agent" variant="secondary">
            <input name="partyId" type="hidden" value={party.id} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Name"><input className={inputClass} name="name" required /></Field>
              <Field label="Role"><input className={inputClass} name="role" placeholder="Sales agent" /></Field>
              <Field label="Phone"><input className={inputClass} name="phone" /></Field>
              <Field label="Email"><input className={inputClass} name="email" type="email" /></Field>
            </div>
          </ActionForm>
        ) : null}
      </Panel>

      <Panel description="Other spellings of this supplier seen on documents. Used to suggest matches, never to merge suppliers." title="Other spellings">
        <div className="mb-3 flex flex-wrap gap-2">{aliases.length ? aliases.map((alias) => <Badge key={alias.id}>{alias.alias}</Badge>) : <Empty>None.</Empty>}</div>
        {canEdit ? (
          <ActionForm action={addPartyAlias} className="flex flex-wrap items-end gap-3" submitLabel="Add spelling" variant="secondary">
            <input name="partyId" type="hidden" value={party.id} />
            <div className="min-w-56 flex-1"><Field label="Spelling"><input className={inputClass} name="alias" required /></Field></div>
          </ActionForm>
        ) : null}
      </Panel>

      {canEdit ? (
        <Panel title="Supplier details">
          <ActionForm action={saveParty} submitLabel="Save details">
            <input name="partyId" type="hidden" value={party.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Legal name"><input className={inputClass} defaultValue={party.legal_name} name="legalName" required /></Field>
              <Field label="Short name"><input className={inputClass} defaultValue={party.display_name ?? ""} name="displayName" /></Field>
              <Field label="GSTIN"><input className={inputClass} defaultValue={party.gstin ?? ""} name="gstin" /></Field>
              <Field label="Why no GSTIN?"><input className={inputClass} defaultValue={party.gstin_exception ?? ""} name="gstinException" /></Field>
              <Field label="State code"><input className={inputClass} defaultValue={party.state_code ?? ""} maxLength={2} name="stateCode" /></Field>
              <Field label="Phone"><input className={inputClass} defaultValue={party.phone ?? ""} name="phone" /></Field>
              <Field label="Email"><input className={inputClass} defaultValue={party.email ?? ""} name="email" /></Field>
              <Field label="Address"><input className={inputClass} defaultValue={party.address ?? ""} name="address" /></Field>
              <Field label="Notes"><input className={inputClass} defaultValue={party.notes ?? ""} name="notes" /></Field>
              <Field label="Status">
                <select className={inputClass} defaultValue={party.is_active ? "on" : "off"} name="isActive">
                  <option value="on">Active</option>
                  <option value="off">Inactive (keeps all history)</option>
                </select>
              </Field>
            </div>
            <Check label="Same supplier (no duplicate check on edits)" name="confirmNew" defaultChecked />
          </ActionForm>
        </Panel>
      ) : null}

      <History events={history} />
    </div>
  );
}

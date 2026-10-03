import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { indiaToday, shortDate } from "@/lib/accounts/format";
import { createStoreFromAccounts, saveBillingSeries, saveFirm, saveStoreFirmPeriod } from "@/lib/accounts/master-actions";
import { listBillingSeries, listFinanceStores, listFirms, listStoreFirmPeriods } from "@/lib/accounts/queries";

const statusTone = (status: string) => (status === "confirmed" ? "good" : status === "to_confirm" ? "warn" : "muted") as "good" | "warn" | "muted";

function MappingFields({ defaults, firms, stores }: {
  defaults?: { store_id: string; firm_id: string; valid_from: string | null; valid_to: string | null; status: string; evidence: string };
  firms: Array<{ id: string; name: string }>;
  stores: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Store">
        <select className={inputClass} defaultValue={defaults?.store_id} name="storeId" required>
          {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
      </Field>
      <Field label="Billed under">
        <select className={inputClass} defaultValue={defaults?.firm_id} name="firmId" required>
          {firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
        </select>
      </Field>
      <Field label="Status">
        <select className={inputClass} defaultValue={defaults?.status ?? "to_confirm"} name="status">
          <option value="confirmed">Confirmed</option>
          <option value="to_confirm">To confirm</option>
          <option value="withdrawn">Withdrawn (entered by mistake)</option>
        </select>
      </Field>
      <Field hint="Blank = from the beginning" label="From"><input className={inputClass} defaultValue={defaults?.valid_from ?? ""} name="validFrom" type="date" /></Field>
      <Field hint="Blank = still current" label="Until"><input className={inputClass} defaultValue={defaults?.valid_to ?? ""} name="validTo" type="date" /></Field>
      <Field label="Based on"><input className={inputClass} defaultValue={defaults?.evidence ?? ""} name="evidence" placeholder="First GP Fashion bill BM-1 dated …" required /></Field>
    </div>
  );
}

export default async function FirmsPage() {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Firms are visible to the owner and people with accounts access." />;
  const [firms, stores, periods, series] = await Promise.all([listFirms(), listFinanceStores(), listStoreFirmPeriods(), listBillingSeries()]);
  const canEdit = session.can.masters;
  const activeStores = stores.filter((store) => store.is_active);
  const name = (list: Array<{ id: string; name: string }>, id: string) => list.find((item) => item.id === id)?.name ?? "—";

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/firms" session={session} />
      <AccountsHeader
        description="Your billing firms (each with its own books) and which firm each store bills under, by date. Entries are booked under the firm on the document; moving a store to a new firm never moves old entries."
        title="Firms & stores"
      />
      {periods.some((period) => period.status === "to_confirm") ? (
        <Notice>
          Brand Mark moved from Go Planet to GP Fashion in September 2026, but the exact first day is not yet confirmed. Late-September records show two
          BM- bill series at Brand Mark on the same days (BM-36xx continuing, and a new series that reached BM-243 by 25 Sep). Until you confirm the date
          below, September entries for Brand Mark take their firm from the document.
        </Notice>
      ) : null}

      <Panel title="Billing firms">
        <div className="space-y-3">
          {firms.map((firm) => (
            <details className="rounded-2xl border border-border bg-background p-4" key={firm.id}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{firm.name}</span>
                <span className="flex gap-2">{firm.gstin ? <Badge>{firm.gstin}</Badge> : <Badge tone="warn">GSTIN not entered</Badge>}{firm.is_active ? null : <Badge>Inactive</Badge>}</span>
              </summary>
              {canEdit ? (
                <ActionForm action={saveFirm} className="mt-3 space-y-3" submitLabel="Save firm" variant="secondary">
                  <input name="firmId" type="hidden" value={firm.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Name"><input className={inputClass} defaultValue={firm.name} name="name" required /></Field>
                    <Field label="Legal name"><input className={inputClass} defaultValue={firm.legal_name ?? ""} name="legalName" /></Field>
                    <Field label="GSTIN"><input className={inputClass} defaultValue={firm.gstin ?? ""} name="gstin" /></Field>
                    <Field label="State code"><input className={inputClass} defaultValue={firm.state_code ?? ""} maxLength={2} name="stateCode" /></Field>
                    <Field label="Address"><input className={inputClass} defaultValue={firm.address ?? ""} name="address" /></Field>
                    <Field label="Notes"><input className={inputClass} defaultValue={firm.notes ?? ""} name="notes" /></Field>
                  </div>
                </ActionForm>
              ) : <p className="mt-2 text-sm text-muted">{firm.legal_name ?? ""} {firm.notes ?? ""}</p>}
            </details>
          ))}
        </div>
        {canEdit && session.isOwner ? (
          <details className="mt-4 rounded-xl border border-dashed border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold text-primary">Add a billing firm</summary>
            <ActionForm action={saveFirm} className="mt-3 space-y-3" submitLabel="Add firm" variant="secondary">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name"><input className={inputClass} name="name" required /></Field>
                <Field label="GSTIN"><input className={inputClass} name="gstin" /></Field>
              </div>
            </ActionForm>
          </details>
        ) : null}
      </Panel>

      <Panel description="Only confirmed periods pick the firm automatically. A store can move to another firm; its old entries stay where they were billed." title="Which firm each store bills under">
        {activeStores.map((store) => (
          <div className="mb-4" key={store.id}>
            <p className="font-semibold">{store.name}</p>
            <ul className="mt-2 space-y-2">
              {periods.filter((period) => period.store_id === store.id).map((period) => (
                <li className="rounded-xl border border-border bg-background p-3 text-sm" key={period.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><strong>{name(firms, period.firm_id)}</strong> · {period.valid_from ? shortDate(period.valid_from) : "from the start"} → {period.valid_to ? shortDate(period.valid_to) : "now"}</span>
                    <Badge tone={statusTone(period.status)}>{period.status.replace("_", " ")}</Badge>
                  </div>
                  <p className="mt-1 text-muted">{period.evidence}</p>
                  {canEdit ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-primary">Correct this period</summary>
                      <ActionForm action={saveStoreFirmPeriod} className="mt-2 space-y-3" submitLabel="Save period" variant="secondary">
                        <input name="periodId" type="hidden" value={period.id} />
                        <MappingFields defaults={period} firms={firms} stores={activeStores} />
                      </ActionForm>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {canEdit ? (
          <details className="rounded-xl border border-dashed border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold text-primary">Add a billing period</summary>
            <ActionForm action={saveStoreFirmPeriod} className="mt-3 space-y-3" submitLabel="Add period" variant="secondary">
              <MappingFields firms={firms} stores={activeStores} />
            </ActionForm>
          </details>
        ) : null}
      </Panel>

      <Panel description="How sales bills are tied to a firm. A prefix alone is not enough when two series share it: add bill-number ranges." title="Bill series">
        {series.length ? (
          <ul className="space-y-2">
            {series.map((item) => (
              <li className="rounded-xl border border-border bg-background p-3 text-sm" key={item.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>{name(stores, item.store_id)}</strong> · {item.prefix}{item.number_from !== null || item.number_to !== null ? ` ${item.number_from ?? 0}–${item.number_to ?? "…"}` : ""} · {name(firms, item.firm_id)} ·{" "}
                    {item.valid_from ? shortDate(item.valid_from) : "from the start"} → {item.valid_to ? shortDate(item.valid_to) : "now"}
                  </span>
                  <Badge tone={statusTone(item.status)}>{item.status.replace("_", " ")}</Badge>
                </div>
                <p className="mt-1 text-muted">{item.evidence}</p>
              </li>
            ))}
          </ul>
        ) : <Empty>No bill series yet.</Empty>}
        {canEdit ? (
          <details className="mt-3 rounded-xl border border-dashed border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold text-primary">Add a bill series</summary>
            <ActionForm action={saveBillingSeries} className="mt-3 space-y-3" submitLabel="Add series" variant="secondary">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Bill prefix"><input className={inputClass} name="prefix" placeholder="BM-" required /></Field>
                <Field label="First bill number"><input className={inputClass} inputMode="numeric" name="numberFrom" /></Field>
                <Field label="Last bill number"><input className={inputClass} inputMode="numeric" name="numberTo" /></Field>
              </div>
              <MappingFields firms={firms} stores={activeStores} />
            </ActionForm>
          </details>
        ) : null}
      </Panel>

      {canEdit ? (
        <Panel description="Adds a physical store and the firm it bills under from its first day. Assign its manager under Users." title="Add a store">
          <ActionForm action={createStoreFromAccounts} submitLabel="Add store">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Store name"><input className={inputClass} name="name" required /></Field>
              <Field label="Short code"><input className={inputClass} maxLength={10} name="code" placeholder="BM2" required /></Field>
              <Field label="Billed under">
                <select className={inputClass} name="firmId" required>
                  {firms.filter((firm) => firm.is_active).map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
                </select>
              </Field>
              <Field label="Billing starts"><input className={inputClass} defaultValue={indiaToday()} name="validFrom" type="date" required /></Field>
              <Field label="Location"><input className={inputClass} name="location" /></Field>
            </div>
          </ActionForm>
        </Panel>
      ) : null}
    </div>
  );
}

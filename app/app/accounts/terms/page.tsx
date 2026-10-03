import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { areaClass, Badge, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { indiaToday, labelFor, paymentCycles, settlementBases, shortDate } from "@/lib/accounts/format";
import { saveArrangement, saveTermsDraft, setTermsStatus } from "@/lib/accounts/master-actions";
import { listAllBrands, listAllParties, listArrangementsWithTerms, listFinanceStores, listFirms } from "@/lib/accounts/queries";

type Terms = Awaited<ReturnType<typeof listArrangementsWithTerms>>[number]["terms"][number];

function TermsCard({ canApprove, canEdit, terms }: { canApprove: boolean; canEdit: boolean; terms: Terms }) {
  const rules = Object.keys((terms.rules ?? {}) as Record<string, unknown>);
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Version {terms.version} · from {shortDate(terms.effective_from)}{terms.effective_to ? ` to ${shortDate(terms.effective_to)}` : ""}</p>
        <Badge tone={terms.status === "confirmed" ? "good" : terms.status === "draft" ? "warn" : "muted"}>{terms.status}</Badge>
      </div>
      <p className="mt-1 text-muted">
        {labelFor(paymentCycles, terms.payment_cycle)}
        {terms.credit_days !== null ? ` · credit ${terms.credit_days} days` : ""}
        {terms.early_payment_discount_pct !== null ? ` · ${terms.early_payment_discount_pct}% if paid within ${terms.early_payment_days ?? "?"} days (on ${terms.early_payment_base === "invoice_total" ? "invoice total" : terms.early_payment_base === "taxable_value" ? "taxable value" : "base to confirm"})` : ""}
        {rules.length ? ` · rules: ${rules.join(", ")}` : ""}
      </p>
      {terms.notes ? <p className="mt-1 text-muted">{terms.notes}</p> : null}
      {terms.status === "draft" && canApprove ? (
        <ActionForm action={setTermsStatus} className="mt-2 flex flex-wrap items-center gap-2" submitLabel="Confirm these terms" variant="secondary">
          <input name="termsId" type="hidden" value={terms.id} />
          <input name="status" type="hidden" value="confirmed" />
        </ActionForm>
      ) : null}
      {terms.status === "confirmed" && canEdit ? (
        <ActionForm action={setTermsStatus} className="mt-2 flex flex-wrap items-center gap-2" submitLabel="Retire" variant="secondary">
          <input name="termsId" type="hidden" value={terms.id} />
          <input name="status" type="hidden" value="retired" />
        </ActionForm>
      ) : null}
    </div>
  );
}

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ party?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Company terms are visible to the owner and people with accounts access." />;
  const { party } = await searchParams;
  const [arrangements, parties, brands, firms, stores] = await Promise.all([
    listArrangementsWithTerms(), listAllParties(), listAllBrands(), listFirms(), listFinanceStores(),
  ]);
  const canEdit = session.can.masters;
  const canApprove = session.can.approve;

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/terms" session={session} />
      <AccountsHeader
        description="Who supplies which brand to which firm, from when, and on what commercial terms. Terms are versioned: a confirmed version is never edited; changes become a new version."
        title="Company terms"
      />
      <Notice tone="info">
        Draft terms are kept for reference and are never used for final figures. Only the owner, or an accountant allowed to approve, can confirm them.
        Detailed calculation rules (margins, promotions, tax thresholds) are recorded here now and used by company workings in a later release.
      </Notice>

      {canEdit ? (
        <Panel description="One row per supplier, brand and billing firm. Use a store only when the terms differ by store." title="Link a supplier to a brand">
          <ActionForm action={saveArrangement} submitLabel="Save supply arrangement">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Supplier">
                <select className={inputClass} defaultValue={party ?? ""} name="partyId" required>
                  <option value="">Choose…</option>
                  {parties.map((item) => <option key={item.id} value={item.id}>{item.legal_name}</option>)}
                </select>
              </Field>
              <Field label="Brand">
                <select className={inputClass} name="brandId" required>
                  <option value="">Choose…</option>
                  {brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <Field label="Billed under (firm)">
                <select className={inputClass} name="firmId" required>
                  {firms.filter((firm) => firm.is_active).map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
                </select>
              </Field>
              <Field hint="Leave as all stores unless the terms are store-specific" label="Store">
                <select className={inputClass} name="storeId">
                  <option value="">All stores of this firm</option>
                  {stores.filter((store) => store.is_active).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </Field>
              <Field label="Supplying from"><input className={inputClass} defaultValue={indiaToday()} name="validFrom" type="date" required /></Field>
              <Field hint="Fill when this supplier stopped (e.g. distributor changed)" label="Supplying until"><input className={inputClass} name="validTo" type="date" /></Field>
              <Field label="Payment is due against">
                <select className={inputClass} name="settlementBasis">
                  {settlementBases.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className={inputClass} name="status">
                  <option value="draft">Draft</option>
                  <option value="confirmed">Confirmed</option>
                </select>
              </Field>
            </div>
            <Field label="Notes"><input className={inputClass} name="notes" /></Field>
          </ActionForm>
        </Panel>
      ) : null}

      <Panel title={`${arrangements.length} supply arrangements`}>
        {arrangements.length ? (
          <div className="space-y-4">
            {arrangements.map((arrangement) => (
              <details className="rounded-2xl border border-border bg-background p-4" key={arrangement.id} open={party === arrangement.party_id}>
                <summary className="cursor-pointer">
                  <span className="font-semibold">{arrangement.parties?.legal_name} → {arrangement.brands?.name}</span>
                  <span className="block text-sm text-muted">
                    Billed under {arrangement.billing_firms?.name}{arrangement.stores?.name ? ` · ${arrangement.stores.name}` : ""} · {shortDate(arrangement.valid_from)} → {arrangement.valid_to ? shortDate(arrangement.valid_to) : "now"} ·{" "}
                    {labelFor(settlementBases, arrangement.settlement_basis)} · {arrangement.status}
                  </span>
                </summary>
                <div className="mt-3 space-y-2">
                  {arrangement.terms.length ? arrangement.terms.map((terms) => <TermsCard canApprove={canApprove} canEdit={canEdit} key={terms.id} terms={terms} />) : <Empty>No terms recorded yet.</Empty>}
                  {canEdit ? (
                    <details className="rounded-xl border border-dashed border-border p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-primary">Add a terms version (draft)</summary>
                      <ActionForm action={saveTermsDraft} className="mt-3 space-y-3" submitLabel="Save draft terms" variant="secondary">
                        <input name="arrangementId" type="hidden" value={arrangement.id} />
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Field label="Terms start"><input className={inputClass} defaultValue={arrangement.valid_from} name="effectiveFrom" type="date" required /></Field>
                          <Field label="Terms end (optional)"><input className={inputClass} name="effectiveTo" type="date" /></Field>
                          <Field label="Payment cycle">
                            <select className={inputClass} name="paymentCycle">
                              {paymentCycles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                          </Field>
                          <Field label="Credit days"><input className={inputClass} inputMode="numeric" name="creditDays" placeholder="45" /></Field>
                          <Field label="Early-payment discount %"><input className={inputClass} inputMode="decimal" name="earlyPaymentPct" placeholder="2" /></Field>
                          <Field label="…if paid within (days)"><input className={inputClass} inputMode="numeric" name="earlyPaymentDays" placeholder="15" /></Field>
                          <Field label="Discount calculated on">
                            <select className={inputClass} name="earlyPaymentBase">
                              <option value="">—</option>
                              <option value="to_confirm">To confirm</option>
                              <option value="invoice_total">Invoice total</option>
                              <option value="taxable_value">Taxable value</option>
                            </select>
                          </Field>
                        </div>
                        <Field hint="Optional, as JSON. For example margins, promotions and tax thresholds agreed with the company." label="Calculation rules">
                          <textarea className={areaClass} name="rules" placeholder='{"margin": {"fresh_pct": 25, "eoss_pct": 18, "base": "nsv_incl_tax"}, "promo_share_pct": 50}' />
                        </Field>
                        <Field label="Notes / where these terms come from"><input className={inputClass} name="notes" placeholder="Revised MOU, not yet signed" /></Field>
                      </ActionForm>
                    </details>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        ) : <Empty>No supply arrangements yet.</Empty>}
      </Panel>
    </div>
  );
}

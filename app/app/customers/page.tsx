import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Badge, Empty, Field, inputClass, Notice, Pager, Panel } from "@/components/accounts/fields";
import { WhatsAppButton } from "@/components/customers/whatsapp-button";
import { indiaToday, money, shortDate } from "@/lib/accounts/format";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { isLimitedView } from "@/lib/auth/view";
import { saveReviewLink } from "@/lib/customers/actions";
import { customerKpis, customerSegments, listCustomers } from "@/lib/customers/queries";
import { addDays, monthStart } from "@/lib/money/format";

const pageSize = 50;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ store?: string; segment?: string; q?: string; page?: string }> }) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role)) return <AccessDenied message="Customers are visible to the owner and store managers." />;
  const stores = await getAccessibleStores(profile);
  const params = await searchParams;
  const isOwner = profile.role === "owner";
  const store = params.store === "all" && isOwner ? null : stores.find((item) => item.id === params.store) ?? (isOwner ? null : stores[0]);
  if (!isOwner && !store) return <AccessDenied message="No store is assigned to you." />;
  const segment = customerSegments.some((item) => item.value === params.segment) ? params.segment! : "recent";
  const search = (params.q ?? "").slice(0, 40);
  const page = Math.max(0, Number(params.page) || 0);
  const limited = await isLimitedView(profile);
  const today = indiaToday();
  const [list, kpis] = await Promise.all([
    listCustomers(store?.id ?? null, segment, search, page, pageSize),
    customerKpis(store?.id ?? null, monthStart(today), today),
  ]);
  const scopeParam = store?.id ?? "all";
  const segmentInfo = customerSegments.find((item) => item.value === segment)!;
  const capture = kpis?.bills ? Math.round((kpis.bills_with_mobile / kpis.bills) * 100) : 0;
  const repeatRate = kpis?.customers_all_time ? Math.round((kpis.repeat_customers_all_time / kpis.customers_all_time) * 100) : 0;

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Customers</p>
        <h1 className="mt-2 text-3xl font-semibold">Your customers</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Built from the mobile number and name on each Logic bill. One customer is one mobile number, across stores.</p>
      </section>

      <nav aria-label="Store" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {[...(isOwner ? [{ id: "all", name: "All stores" }] : []), ...stores].map((item) => (
          <Link
            aria-current={item.id === scopeParam ? "page" : undefined}
            className={item.id === scopeParam
              ? "shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white"
              : "shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted"}
            href={`/app/customers?${new URLSearchParams({ store: item.id, segment })}`}
            key={item.id}
          >
            {item.name}
          </Link>
        ))}
      </nav>

      {kpis ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat hint="Bills with a valid mobile this month" label="Mobile captured" value={`${capture}%`} />
          <Stat hint={`${kpis.new_customers} new · ${kpis.returning_customers} returning`} label="Customers this month" value={String(kpis.customers)} />
          <Stat hint={`${kpis.repeat_customers_all_time} of ${kpis.customers_all_time} have bought twice or more`} label="Repeat customers" value={`${repeatRate}%`} />
          {limited ? null : <Stat hint="Sales this month to customers with a mobile" label="Known-customer sales" value={money(kpis.spend_known_customers)} />}
        </section>
      ) : null}
      {kpis && capture < 90 ? <Notice>Ask the counter to enter the customer&apos;s mobile on every bill in Logic: only {capture}% of this month&apos;s bills have one.</Notice> : null}

      <Panel
        action={
          <form className="flex items-end gap-2" method="get">
            <input name="store" type="hidden" value={scopeParam} />
            <input name="segment" type="hidden" value={segment} />
            <Field label="Search"><input className={inputClass} defaultValue={search} name="q" placeholder="Name or mobile" /></Field>
            <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Find</button>
          </form>
        }
        description={segmentInfo.hint}
        title={`${list.total} customer${list.total === 1 ? "" : "s"}`}
      >
        <nav aria-label="Segment" className="-mx-1 mb-4 flex gap-1 overflow-x-auto pb-1">
          {customerSegments.map((item) => (
            <Link
              aria-current={item.value === segment ? "page" : undefined}
              className={item.value === segment
                ? "shrink-0 rounded-full border border-primary bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary"
                : "shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted"}
              href={`/app/customers?${new URLSearchParams({ store: scopeParam, segment: item.value })}`}
              key={item.value}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {!store ? <p className="mb-3 text-xs text-muted">Choose a store above to send WhatsApp messages from that store.</p> : null}
        {list.rows.length ? (
          <div className="space-y-2">
            {list.rows.map((customer) => (
              <div className="rounded-2xl border border-border bg-background p-3 text-sm" key={customer.mobile}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link className="font-semibold underline" href={`/app/customers/${customer.mobile}${store ? `?store=${store.id}` : ""}`}>{customer.name ?? "No name"}</Link>
                  <span className="flex flex-wrap gap-2">
                    {customer.do_not_contact ? <Badge tone="bad">Do not contact</Badge> : customer.marketing_consent ? <Badge tone="good">Agreed to offers</Badge> : <Badge>No offer consent</Badge>}
                    {customer.store_count > 1 ? <Badge>Both stores</Badge> : null}
                  </span>
                </div>
                <p className="mt-1 text-muted">
                  {customer.mobile} · {customer.bills} bill{customer.bills === 1 ? "" : "s"}{limited ? "" : ` · ${money(customer.spend)}`} · last {shortDate(customer.last_visit)} · first {shortDate(customer.first_visit)}
                  {customer.last_message_at ? ` · messaged ${shortDate(customer.last_message_at.slice(0, 10))}` : ""}
                </p>
                {store && !customer.do_not_contact ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {customer.last_visit >= addDays(today, -3) ? <WhatsAppButton kind="thank_you" label="Thank you + review" mobile={customer.mobile} storeId={store.id} /> : null}
                    {customer.marketing_consent && customer.last_visit < addDays(today, -60) ? <WhatsAppButton kind="lapsed_offer" label="We miss you" mobile={customer.mobile} storeId={store.id} /> : null}
                    {customer.marketing_consent && segment === "birthday" ? <WhatsAppButton kind="birthday" label="Birthday wish" mobile={customer.mobile} storeId={store.id} /> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : <Empty>No customers in this list.</Empty>}
        <Pager base="/app/customers" page={page} pageSize={pageSize} query={{ store: scopeParam, segment, ...(search ? { q: search } : {}) }} total={list.total} />
        <p className="mt-3 text-xs leading-5 text-muted">
          Offers and birthday wishes go only to customers who agreed (record it on the customer&apos;s page). Every message carries a way to opt out.
        </p>
      </Panel>

      {isOwner ? (
        <Panel description="Thank-you messages include this link so happy customers can review the store on Google. Find it in Google Business Profile → “Ask for reviews”." title="Google review links">
          <div className="space-y-3">
            {stores.map((item) => (
              <ActionForm action={saveReviewLink} className="flex flex-wrap items-end gap-3" key={item.id} submitLabel="Save" variant="secondary">
                <input name="storeId" type="hidden" value={item.id} />
                <div className="min-w-64 flex-1"><Field label={item.name}><input className={inputClass} defaultValue={item.google_review_url ?? ""} name="url" placeholder="https://g.page/r/…/review" /></Field></div>
              </ActionForm>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function Stat({ hint, label, value }: { hint: string; label: string; value: string }) {
  return (
    <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{hint}</p>
    </div>
  );
}

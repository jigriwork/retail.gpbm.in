import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Badge, Empty, Field, inputClass, Notice, Pager, Panel } from "@/components/accounts/fields";
import { WhatsAppApiButton } from "@/components/customers/whatsapp-api-button";
import { WhatsAppButton } from "@/components/customers/whatsapp-button";
import { indiaToday, money, shortDate } from "@/lib/accounts/format";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { isLimitedView } from "@/lib/auth/view";
import { saveReviewLink } from "@/lib/customers/actions";
import { customerKpis, customerSegments, listCustomers } from "@/lib/customers/queries";
import { whatsappBudgetSnapshot } from "@/lib/msg91/budget";
import { deliveryCounts } from "@/lib/msg91/delivery-report";
import { customerRef, maskMobile } from "@/lib/customers/ref";
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
  // Only the owner sees customers' numbers and spend.
  const limited = (await isLimitedView(profile)) || !isOwner;
  const today = indiaToday();
  const [list, kpis] = await Promise.all([
    listCustomers(store?.id ?? null, segment, search, page, pageSize),
    customerKpis(store?.id ?? null, monthStart(today), today),
  ]);
  const whatsappBudgets = isOwner
    ? await Promise.all(stores.map(async (item) => ({ item, snapshot: await whatsappBudgetSnapshot(item.id) })))
    : [];
  const deliveryTotals = isOwner ? await Promise.all(stores.map((item) => deliveryCounts(item.id))) : [];
  const sent30 = deliveryTotals.reduce((sum, counts) => sum + counts.total, 0);
  const read30 = deliveryTotals.reduce((sum, counts) => sum + counts.read, 0);
  const spent = whatsappBudgets.reduce((sum, { snapshot }) => sum + snapshot.spent, 0);
  const budget = whatsappBudgets.reduce((sum, { snapshot }) => sum + snapshot.budget, 0);
  const year = today.slice(0, 4);
  const day = (value: string) => { const text = shortDate(value); return value.startsWith(year) ? text.replace(` ${year}`, "") : text; };
  const scopeParam = store?.id ?? "all";
  const segmentInfo = customerSegments.find((item) => item.value === segment)!;
  const capture = kpis?.bills ? Math.round((kpis.bills_with_mobile / kpis.bills) * 100) : 0;
  const repeatRate = kpis?.customers_all_time ? Math.round((kpis.repeat_customers_all_time / kpis.customers_all_time) * 100) : 0;

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Customers</p>
        <h1 className="mt-2 text-3xl font-semibold">Your customers</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Built from the mobile number and name on each Logic bill, plus numbers uploaded from customer files. One customer is one mobile number, across stores.</p>
        <Link className="mt-3 inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-semibold transition hover:border-primary" href="/app/customers/upload">⬆ Upload customer numbers</Link>
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
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat hint="Bills with a valid mobile this month" label="Mobile captured" value={`${capture}%`} />
          <Stat hint={`${kpis.new_customers} new · ${kpis.returning_customers} returning`} label="Customers this month" value={String(kpis.customers)} />
          <Stat hint={`${kpis.repeat_customers_all_time} of ${kpis.customers_all_time} have bought twice or more`} label="Repeat customers" value={`${repeatRate}%`} />
          {limited ? null : <Stat hint="Sales this month to customers with a mobile" label="Known-customer sales" value={money(kpis.spend_known_customers)} />}
        </section>
      ) : null}
      {kpis && capture < 90 ? <Notice>Ask the counter to enter the customer&apos;s mobile on every bill in Logic: only {capture}% of this month&apos;s bills have one.</Notice> : null}

      {isOwner ? (
        <Link className="flex flex-wrap items-center justify-between gap-3 rounded-[1.35rem] border border-border bg-card p-4 shadow-sm transition hover:border-primary" href="/app/customers/whatsapp">
          <span>
            <span className="block font-semibold">WhatsApp messages</span>
            <span className="text-sm text-muted">{sent30} sent in 30 days · {read30} read · {money(spent)} of {money(budget)} used this month</span>
          </span>
          <span className="text-sm font-semibold text-primary">Open →</span>
        </Link>
      ) : null}

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
            {list.rows.map((customer) => {
              const ref = isOwner ? customer.mobile : customerRef(customer.mobile);
              return (
              <div className="rounded-2xl border border-border bg-background p-3 text-sm" key={ref}>
                <div className="flex items-start justify-between gap-2">
                  <Link className="min-w-0 truncate font-semibold underline" href={`/app/customers/${ref}${store ? `?store=${store.id}` : ""}`}>{customer.name ?? "No name"}</Link>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {customer.do_not_contact ? <Badge tone="bad">Do not contact</Badge> : customer.marketing_consent ? <Badge tone="good">Offers OK</Badge> : <Badge>No consent</Badge>}
                    {customer.store_count > 1 ? <Badge>Both stores</Badge> : null}
                    {customer.uploaded && !customer.bills ? <Badge>Uploaded</Badge> : null}
                  </span>
                </div>
                <p className="mt-1 text-muted">
                  {isOwner ? customer.mobile : maskMobile(customer.mobile)} · {customer.bills} bill{customer.bills === 1 ? "" : "s"}{limited ? "" : ` · ${money(customer.spend)}`}
                </p>
                <p className="text-xs text-muted">
                  {customer.last_visit && customer.first_visit ? `Last visit ${day(customer.last_visit)} · first ${day(customer.first_visit)}` : "From an uploaded list · no purchase yet"}
                  {customer.last_message_at ? ` · last WhatsApp ${day(customer.last_message_at.slice(0, 10))}` : ""}
                </p>
                {store && !customer.do_not_contact ? (() => {
                  const recent = customer.last_visit !== null && customer.last_visit >= addDays(today, -3);
                  const away = customer.last_visit === null || customer.last_visit < addDays(today, -60);
                  return (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {isOwner && recent ? <WhatsAppButton kind="thank_you" label="Thank you + review" mobile={ref} storeId={store.id} /> : null}
                    {customer.marketing_consent && recent ? <WhatsAppApiButton kind="thank_you" label="Send thank you via API" mobile={ref} storeId={store.id} /> : null}
                    {isOwner && customer.marketing_consent && away ? <WhatsAppButton kind="lapsed_offer" label="We miss you" mobile={ref} storeId={store.id} /> : null}
                    {customer.marketing_consent && away ? <WhatsAppApiButton kind="lapsed_offer" label="Send we miss you via API" mobile={ref} storeId={store.id} /> : null}
                    {isOwner && customer.marketing_consent && segment === "birthday" ? <WhatsAppButton kind="birthday" label="Birthday wish" mobile={ref} storeId={store.id} /> : null}
                  </div>
                  );
                })() : null}
              </div>
              );
            })}
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
    <div className="min-w-0 rounded-[1.35rem] border border-border bg-card p-3 shadow-sm sm:p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 break-words text-xl font-semibold sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{hint}</p>
    </div>
  );
}

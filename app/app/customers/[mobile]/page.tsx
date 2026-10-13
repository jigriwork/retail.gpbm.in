import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Badge, Check, Empty, Field, inputClass, Panel } from "@/components/accounts/fields";
import { WhatsAppApiButton } from "@/components/customers/whatsapp-api-button";
import { WhatsAppButton } from "@/components/customers/whatsapp-button";
import { DeliveryList } from "@/components/customers/whatsapp-delivery";
import { indiaToday, money, shortDate } from "@/lib/accounts/format";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { isLimitedView } from "@/lib/auth/view";
import { saveCustomerProfile } from "@/lib/customers/actions";
import { customerContactsFor, customerMessagesFor, customerProfile, customerPurchases } from "@/lib/customers/queries";
import { deliveriesTo } from "@/lib/msg91/delivery-report";
import { customerRef, maskMobile, resolveCustomerRef } from "@/lib/customers/ref";
import { addDays } from "@/lib/money/format";

const kindLabels: Record<string, string> = { thank_you: "Thank you + review", lapsed_offer: "We miss you", birthday: "Birthday wish", custom: "Message" };

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ mobile: string }>; searchParams: Promise<{ store?: string }> }) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role)) return <AccessDenied message="Customers are visible to the owner and store managers." />;
  // The address carries the number for the owner and an encrypted reference for everyone else.
  const { mobile: param } = await params;
  const mobile = resolveCustomerRef(decodeURIComponent(param)) ?? "";
  if (!mobile) return <AccessDenied message="Customer not found." />;
  const isOwner = profile.role === "owner";
  const ref = isOwner ? mobile : customerRef(mobile);
  const [purchases, details, messages, stores, limitedView, query, contacts] = await Promise.all([
    customerPurchases(mobile), customerProfile(mobile), customerMessagesFor(mobile), getAccessibleStores(profile), isLimitedView(profile), searchParams, customerContactsFor(mobile),
  ]);
  const limited = limitedView || !isOwner;
  if (!purchases.length && !contacts.length) return <AccessDenied message="Customer not found, or they are not a customer of your store." />;
  const deliveries = profile.role === "owner" ? await deliveriesTo(mobile) : [];
  const store = stores.find((item) => item.id === query.store)
    ?? stores.find((item) => purchases.some((row) => row.store_name === item.name))
    ?? stores.find((item) => contacts.some((row) => row.store_id === item.id));
  const bills = new Map<string, { date: string; store: string; total: number; items: typeof purchases }>();
  for (const row of purchases) {
    const key = `${row.store_name}|${row.bill_no}|${row.sale_date}`;
    const bill = bills.get(key) ?? { date: row.sale_date, store: row.store_name, total: 0, items: [] };
    bill.total += Number(row.net_sale ?? 0);
    bill.items.push(row);
    bills.set(key, bill);
  }
  const name = details?.preferred_name ?? purchases.find((row) => row.customer_name)?.customer_name ?? contacts.find((row) => row.name)?.name ?? null;
  const total = purchases.reduce((sum, row) => sum + Number(row.net_sale ?? 0), 0);
  const lastVisit: string | null = purchases[0]?.sale_date ?? null;
  const today = indiaToday();

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Link className="text-sm font-medium text-muted" href={`/app/customers${store ? `?store=${store.id}` : ""}`}>← Customers</Link>
        <h1 className="mt-2 text-3xl font-semibold">{name ?? "No name"}</h1>
        <p className="mt-2 text-sm text-muted">{isOwner ? mobile : maskMobile(mobile)} · {bills.size} bill{bills.size === 1 ? "" : "s"}{limited ? "" : ` · ${money(total)}`}{lastVisit ? ` · last visit ${shortDate(lastVisit)}` : " · from an uploaded list, no purchase yet"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {details?.do_not_contact ? <Badge tone="bad">Do not contact</Badge> : details?.marketing_consent ? <Badge tone="good">Agreed to offers {details.consent_at ? `· ${shortDate(details.consent_at.slice(0, 10))}` : ""}</Badge> : <Badge>No offer consent</Badge>}
          {details?.withdrawn_at && !details.marketing_consent ? <Badge>Withdrew {shortDate(details.withdrawn_at.slice(0, 10))}</Badge> : null}
        </div>
        {store && !details?.do_not_contact ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {isOwner && lastVisit && lastVisit >= addDays(today, -3) ? <WhatsAppButton kind="thank_you" label="Thank you + review" mobile={ref} storeId={store.id} /> : null}
            {details?.marketing_consent && lastVisit && lastVisit >= addDays(today, -3) ? <WhatsAppApiButton kind="thank_you" label="Send thank you via API" mobile={ref} storeId={store.id} /> : null}
            {isOwner && details?.marketing_consent ? <WhatsAppButton kind="lapsed_offer" label="We miss you" mobile={ref} storeId={store.id} /> : null}
            {details?.marketing_consent ? <WhatsAppApiButton kind="lapsed_offer" label="Send we miss you via API" mobile={ref} storeId={store.id} /> : null}
            {isOwner && details?.marketing_consent && details.birthday ? <WhatsAppButton kind="birthday" label="Birthday wish" mobile={ref} storeId={store.id} /> : null}
          </div>
        ) : null}
      </section>

      <Panel description="Record consent only when the customer agrees to receive offers on WhatsApp. They can withdraw any time; untick it then." title="Customer details & consent">
        <ActionForm action={saveCustomerProfile} className="grid gap-4 sm:grid-cols-2" submitLabel="Save">
          <input name="mobile" type="hidden" value={ref} />
          <Field label="Name"><input className={inputClass} defaultValue={details?.preferred_name ?? ""} name="name" placeholder="As the customer likes to be called" /></Field>
          <Field label="Birthday"><input className={inputClass} defaultValue={details?.birthday ?? ""} name="birthday" type="date" /></Field>
          <Field label="Anniversary"><input className={inputClass} defaultValue={details?.anniversary ?? ""} name="anniversary" type="date" /></Field>
          <Field label="How they agreed">
            <select className={inputClass} defaultValue={details?.consent_source ?? "in_store"} name="consentSource">
              <option value="in_store">Said yes at the store</option>
              <option value="whatsapp_reply">Replied yes on WhatsApp</option>
              <option value="form">Filled a form</option>
            </select>
          </Field>
          <div className="space-y-2 sm:col-span-2">
            <Check defaultChecked={details?.marketing_consent} label="Agrees to receive offers on WhatsApp" name="consent" />
            <Check defaultChecked={details?.do_not_contact} label="Do not contact at all (asked us to stop)" name="doNotContact" />
          </div>
          <div className="sm:col-span-2"><Field label="Note"><input className={inputClass} defaultValue={details?.note ?? ""} name="note" placeholder="Sizes, preferences…" /></Field></div>
        </ActionForm>
      </Panel>

      <Panel title="Purchases">
        <div className="space-y-2">
          {[...bills.values()].map((bill) => (
            <details className="rounded-2xl border border-border bg-background p-3 text-sm" key={`${bill.store}${bill.date}${bill.items[0].bill_no}`}>
              <summary className="flex cursor-pointer flex-wrap justify-between gap-2">
                <span className="font-semibold">{shortDate(bill.date)} · {bill.store} · {bill.items[0].bill_no}</span>
                <span className="text-muted">{bill.items.length} item{bill.items.length === 1 ? "" : "s"}{limited ? "" : ` · ${money(bill.total)}`}</span>
              </summary>
              <ul className="mt-2 space-y-1 text-muted">
                {bill.items.map((item, index) => (
                  <li key={index}>{item.brand ?? ""} {item.item_name}{item.size ? ` · ${item.size}` : ""} × {item.quantity}{limited ? "" : ` · ${money(item.net_sale)}`}{item.staff_name ? ` · sold by ${item.staff_name}` : ""}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </Panel>

      <Panel description="“Sent by the app” went through MSG91 automatically. “Opened on a phone” means someone tapped a WhatsApp button above; the app can't see whether they pressed send." title="WhatsApp history">
        {messages.length ? (
          <ul className="space-y-1 text-sm text-muted">
            {messages.map((item) => {
              // Automatic sends log their timeline entry within seconds of the MSG91 delivery record.
              const automatic = deliveries.some((row) => Math.abs(Date.parse(row.created_at) - Date.parse(item.sent_at)) < 5 * 60 * 1000);
              return (
                <li key={item.id}>
                  {shortDate(item.sent_at.slice(0, 10))} · {kindLabels[item.kind] ?? item.kind} · {item.stores?.name} · {profile.role !== "owner" ? `by ${item.profiles?.full_name ?? "—"}` : automatic ? "sent by the app" : `opened on a phone by ${item.profiles?.full_name ?? "—"}`}
                </li>
              );
            })}
          </ul>
        ) : <Empty>None yet.</Empty>}
      </Panel>

      {profile.role === "owner" ? (
        <Panel description="Sent automatically by the app through MSG91, with WhatsApp's delivery report." title="Sent automatically (MSG91)">
          <DeliveryList rows={deliveries} showRecipient={false} />
        </Panel>
      ) : null}
    </div>
  );
}

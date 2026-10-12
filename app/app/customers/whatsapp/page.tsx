import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Notice, Panel } from "@/components/accounts/fields";
import { DeliveryList, DeliveryTiles } from "@/components/customers/whatsapp-delivery";
import { money } from "@/lib/accounts/format";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { refreshWhatsAppStatus } from "@/lib/customers/actions";
import { whatsappBudgetSnapshot } from "@/lib/msg91/budget";
import { deliveryCounts, recentDeliveries } from "@/lib/msg91/delivery-report";
import { syncWhatsAppStatuses } from "@/lib/msg91/log-sync";

export default async function CustomerWhatsAppPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { profile } = await requireProfile();
  if (profile?.role !== "owner") return <AccessDenied message="WhatsApp delivery is visible to the owner." />;
  // Fresh statuses from MSG91's logs (at most every 5 minutes).
  const [stores, params] = await Promise.all([getAccessibleStores(profile), searchParams, syncWhatsAppStatuses().catch(() => null)]);
  const store = stores.find((item) => item.id === params.store) ?? null;
  const shown = store ? [store] : stores;
  const [budgets, totals, deliveries] = await Promise.all([
    Promise.all(shown.map(async (item) => ({ item, snapshot: await whatsappBudgetSnapshot(item.id) }))),
    Promise.all(shown.map(async (item) => ({ item, counts: await deliveryCounts(item.id) }))),
    recentDeliveries(shown.map((item) => item.id), 50),
  ]);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Link className="text-sm font-medium text-muted" href="/app/customers">← Customers</Link>
        <h1 className="mt-2 text-3xl font-semibold">WhatsApp messages</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Messages the app sends by itself through MSG91 (thank-yous, follow-ups, payslips, owner summaries), with the report WhatsApp sends back.</p>
      </section>

      <nav aria-label="Store" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {[{ id: "all", name: "All stores" }, ...stores].map((item) => {
          const current = item.id === (store?.id ?? "all");
          return (
            <Link
              aria-current={current ? "page" : undefined}
              className={current
                ? "shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                : "shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted"}
              href={item.id === "all" ? "/app/customers/whatsapp" : `/app/customers/whatsapp?store=${item.id}`}
              key={item.id}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>

      <Notice tone="info">Statuses are read from MSG91&apos;s own WhatsApp logs every time this page opens (MSG91 keeps them about 4 days). “MSG91 has no record” means MSG91 accepted the message but never sent it.</Notice>

      <Panel
        action={<ActionForm action={refreshWhatsAppStatus} className="flex items-center gap-2" submitLabel="Check MSG91 now" variant="secondary"><span /></ActionForm>}
        description="Last 30 days. Delivered includes read."
        title="Delivery"
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {totals.map(({ item, counts }) => <DeliveryTiles counts={counts} key={item.id} name={item.name} />)}
        </div>
      </Panel>

      <Panel description="Each store has its own ₹1,500 monthly limit, with a ₹100 safety buffer and ₹25 salary-message reserve inside it." title="Budget this month">
        <div className="grid gap-3 sm:grid-cols-2">
          {budgets.map(({ item, snapshot }) => (
            <div className="rounded-2xl border border-border bg-background p-4" key={item.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm font-semibold">{money(snapshot.spent)} / {money(snapshot.budget)}</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (snapshot.spent / snapshot.budget) * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">
                {money(snapshot.remaining)} left · {snapshot.customerThankYous} thank-yous · {snapshot.payslips} payslips · {snapshot.followups}/{snapshot.followupLimit} follow-ups
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Latest 50 messages">
        <DeliveryList rows={deliveries} />
      </Panel>
    </div>
  );
}

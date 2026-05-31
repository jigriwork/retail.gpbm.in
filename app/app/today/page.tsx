import Link from "next/link";
import {
  CalendarCheck,
  ClipboardCheck,
  HeartPulse,
  LineChart,
  Sparkles,
  SprayCan,
  Store,
  WalletCards,
} from "lucide-react";

import { StatusCard } from "@/components/app/status-card";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";

export default async function TodayPage() {
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Today</p>
        <h1 className="mt-2 text-3xl font-semibold">
          {profile?.full_name ?? "GPBM user"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Signed in as <span className="font-semibold capitalize">{profile?.role}</span>.
          Store data below follows your role and assignments.
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Accessible stores</h2>
          <Store className="size-5 text-muted" />
        </div>
        {stores.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((store) => (
              <Link
                className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm transition hover:border-foreground"
                href={`/app/stores/${store.id}`}
                key={store.id}
              >
                <p className="text-lg font-semibold">{store.name}</p>
                <p className="mt-1 text-sm text-muted">{store.code}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-[1.35rem] border border-border bg-card p-5 text-sm leading-6 text-muted shadow-sm">
            No active store is assigned yet.
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatusCard
          body="Waiting for the next real sales upload or processing result."
          icon={LineChart}
          title="Sales report status"
        />
        <StatusCard
          body="Waiting for the next real stock upload or processing result."
          icon={ClipboardCheck}
          title="Stock report status"
        />
        <StatusCard
          body="Attendance reminder is based on app settings."
          icon={CalendarCheck}
          title="Salary attendance"
        />
        <StatusCard
          body="Salary day is configured in settings and shown read-only for now."
          icon={WalletCards}
          title="Salary day"
        />
        <StatusCard
          body="Rack review workflow shell is ready for the next build step."
          icon={Sparkles}
          title="Rack review"
        />
        <StatusCard
          body="Cleaning review workflow shell is ready for the next build step."
          icon={SprayCan}
          title="Cleaning review"
        />
        {profile?.role === "owner" ? (
          <StatusCard
            body="Private owner-only Life Flow stays hidden from managers."
            icon={HeartPulse}
            title="Life Flow"
          />
        ) : null}
      </section>
    </div>
  );
}

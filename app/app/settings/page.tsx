import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { RefreshReleaseButton } from "@/components/app/refresh-release-button";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { FirmMappingForm } from "@/components/stores/firm-mapping-form";
import { StoreTargetForm } from "@/components/stores/store-target-form";
import { updateStoreFirmName } from "@/lib/stores/firm-actions";
import { updateStoreTarget } from "@/lib/stores/target-actions";

const labels: Record<string, string> = {
  salary_day: "Salary day",
  salary_attendance_due_day: "Salary attendance due day",
  stock_report_due_day: "Stock report due day",
  weekly_audit_day: "Weekly audit day",
  timezone: "Timezone",
};

function settingValue(key: string, value: unknown) {
  if (!value || typeof value !== "object") {
    return "Not configured";
  }

  const record = value as Record<string, unknown>;

  if (key === "timezone") {
    return String(record.timezone ?? "Asia/Kolkata");
  }

  return String(record.day ?? "Not configured");
}

function formatMoney(value?: number | null) {
  if (!value) return "Not set";
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const { data: settings } = await supabase
    .from("app_settings")
    .select("key,value")
    .in("key", Object.keys(labels))
    .order("key");

  const values = new Map((settings ?? []).map((item) => [item.key, item.value]));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-muted">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold">Business rules</h1>
      </div>
      <section className="grid gap-3 sm:grid-cols-2">
        {Object.entries(labels).map(([key, label]) => (
          <div
            className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm"
            key={key}
          >
            <p className="text-sm font-medium text-muted">{label}</p>
            <p className="mt-3 text-2xl font-semibold capitalize">
              {settingValue(key, values.get(key))}
            </p>
          </div>
        ))}
      </section>

      <div className="pt-2">
        <h2 className="text-2xl font-semibold">App release</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Current version: v7.0.0
        </p>
      </div>
      <section>
        <RefreshReleaseButton />
      </section>

      <div className="pt-2">
        <h2 className="text-2xl font-semibold">Staff</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Maintain staff phone numbers for assigned stores.
        </p>
      </div>
      <section>
        <Link
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
          href="/app/employees"
        >
          Staff Phone Directory
        </Link>
      </section>

      {profile?.role === "owner" ? (
        <>
          <div className="pt-2">
            <h2 className="text-2xl font-semibold">Owner personal area</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Personal tracking stays outside the business Today workflow.
            </p>
          </div>
          <section>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-border bg-card px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
              href="/app/life"
            >
              Open Life Flow
            </Link>
          </section>

          <div className="pt-2">
            <h2 className="text-2xl font-semibold">Store monthly targets</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Set a monthly sales target per store. When enabled, target progress is shown in sales analytics and the Today page.
            </p>
          </div>
          <section className="grid gap-3 sm:grid-cols-2">
            {stores.map((store) => (
              <div
                className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm"
                key={store.id}
              >
                <StoreTargetForm
                  action={updateStoreTarget}
                  enabled={store.monthly_target_enabled ?? false}
                  storeId={store.id}
                  storeName={store.name}
                  target={store.monthly_target ?? null}
                />
              </div>
            ))}
          </section>

          <div className="pt-2">
            <h2 className="text-2xl font-semibold">Store Master / Firm Mapping</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Payslip rows snapshot the current firm and store names when a salary sheet is uploaded.
            </p>
          </div>
          <section className="grid gap-3 sm:grid-cols-2">
            {stores.map((store) => (
              <div
                className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm"
                key={store.id}
              >
                <FirmMappingForm
                  action={updateStoreFirmName}
                  firmName={store.firm_name}
                  storeId={store.id}
                  storeName={store.name}
                />
              </div>
            ))}
          </section>
        </>
      ) : (
        stores.some((store) => store.monthly_target_enabled) ? (
          <>
            <div className="pt-2">
              <h2 className="text-2xl font-semibold">Store targets</h2>
            </div>
            <section className="grid gap-3 sm:grid-cols-2">
              {stores.filter((store) => store.monthly_target_enabled).map((store) => (
                <div
                  className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm"
                  key={store.id}
                >
                  <p className="font-semibold">{store.name}</p>
                  <p className="mt-1 text-xs text-muted">Monthly sales target</p>
                  <p className="mt-3 text-2xl font-semibold">
                    {formatMoney(store.monthly_target)}
                  </p>
                </div>
              ))}
            </section>
          </>
        ) : null
      )}
    </div>
  );
}

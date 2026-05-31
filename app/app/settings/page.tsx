import { createClient } from "@/lib/supabase/server";

const labels: Record<string, string> = {
  salary_day: "Salary day",
  salary_attendance_due_day: "Salary attendance due day",
  stock_report_due_day: "Stock report due day",
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

export default async function SettingsPage() {
  const supabase = await createClient();
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
            <p className="mt-3 text-2xl font-semibold">
              {settingValue(key, values.get(key))}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}

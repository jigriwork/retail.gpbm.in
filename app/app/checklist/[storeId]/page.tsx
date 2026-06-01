import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { ChecklistRow } from "@/components/checklist/checklist-row";
import { NoIssuesButton } from "@/components/checklist/no-issues-button";
import { canAccessStore, requireProfile } from "@/lib/auth/session";
import { getStoreChecklist } from "@/lib/checklist/queries";
import { createClient } from "@/lib/supabase/server";

export default async function StoreChecklistPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { profile } = await requireProfile();
  const allowed = await canAccessStore(storeId, profile);

  if (!allowed) {
    return <AccessDenied message="This store checklist is not assigned to your account." />;
  }

  const supabase = await createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .eq("is_active", true)
    .maybeSingle();

  if (!store) {
    notFound();
  }

  const checklist = await getStoreChecklist(store);
  const brandMark = store.code === "BM";

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/checklist">
          Back to checklist
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">{store.name} checklist</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Today: {checklist.today}. Sales report due for {checklist.yesterday}.
        </p>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Completion</p>
            <p className="mt-2 text-5xl font-semibold">{checklist.completionPercent}%</p>
            <p className="mt-2 text-sm font-semibold">{checklist.status}</p>
          </div>
          <div className="w-full sm:max-w-sm">
            <div className="h-2 rounded-full bg-background">
              <div
                className="h-2 rounded-full bg-foreground"
                style={{ width: `${checklist.completionPercent}%` }}
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">
              {checklist.completedRequiredCount} of {checklist.requiredCount} required items complete.
            </p>
            {checklist.missingItems.length ? (
              <p className="mt-2 text-sm leading-6 text-danger">
                Missing: {checklist.missingItems.map((item) => item.title).join(", ")}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Daily issue reporting</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Add a store update if anything needs attention, or mark no issues today.
            </p>
          </div>
          <NoIssuesButton storeId={store.id} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {brandMark ? "Brand Mark daily checklist" : "Go Planet daily checklist"}
        </h2>
        {checklist.items.map((item) => (
          <ChecklistRow item={item} key={item.key} />
        ))}
      </section>
    </div>
  );
}

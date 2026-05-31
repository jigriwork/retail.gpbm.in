import { notFound } from "next/navigation";
import {
  ClipboardList,
  LineChart,
  MessageSquareText,
  PackageSearch,
  Shirt,
  Sparkles,
  SprayCan,
  UserRoundCheck,
} from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { StatusCard } from "@/components/app/status-card";
import { canAccessStore, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const storeSections = [
  { title: "Sales", body: "Sales workspace placeholder.", icon: LineChart },
  { title: "Stock", body: "Stock workspace placeholder.", icon: PackageSearch },
  { title: "Tasks", body: "Store task shell placeholder.", icon: ClipboardList },
  { title: "Rack Review", body: "Rack review placeholder.", icon: Shirt },
  { title: "Cleaning Review", body: "Cleaning review placeholder.", icon: SprayCan },
  { title: "Staff Sales", body: "Staff sales placeholder.", icon: UserRoundCheck },
  {
    title: "Manager Updates",
    body: "Manager update placeholder.",
    icon: MessageSquareText,
  },
];

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { profile } = await requireProfile();
  const allowed = await canAccessStore(storeId, profile);

  if (!allowed) {
    return <AccessDenied message="This store is not assigned to your account." />;
  }

  const supabase = await createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Store detail</p>
            <h1 className="mt-2 text-3xl font-semibold">{store.name}</h1>
          </div>
          <Sparkles className="size-5 text-muted" />
        </div>
        <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-muted">Code</p>
            <p className="mt-1 font-semibold">{store.code}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-muted">Type</p>
            <p className="mt-1 font-semibold capitalize">{store.type ?? "store"}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-muted">Target</p>
            <p className="mt-1 font-semibold">
              {store.monthly_target_enabled ? "Enabled" : "Disabled"}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {storeSections.map((section) => (
          <StatusCard {...section} key={section.title} />
        ))}
      </section>
    </div>
  );
}

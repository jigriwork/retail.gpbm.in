import Link from "next/link";

import { ManagerUpdateForm } from "@/components/updates/update-form";
import { createManagerUpdate } from "@/lib/updates/actions";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function NewUpdatePage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const { storeId } = await searchParams;
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const defaultStoreId = stores.some((store) => store.id === storeId) ? storeId : stores[0]?.id;
  const supabase = await createClient();
  const { data: profiles } =
    profile?.role === "owner"
      ? await supabase
          .from("profiles")
          .select("id,full_name,email")
          .eq("is_active", true)
          .order("full_name")
      : { data: profile ? [{ id: profile.id, full_name: profile.full_name, email: profile.email }] : [] };

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/updates">
          Back to updates
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Add store update</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Capture the issue, pending work, stock note, customer follow-up, or owner attention item.
        </p>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        {stores.length ? (
          <ManagerUpdateForm
            action={createManagerUpdate}
            assignableUsers={profiles ?? []}
            defaultStoreId={defaultStoreId}
            mode="create"
            stores={stores}
          />
        ) : (
          <p className="text-sm leading-6 text-muted">
            No active assigned store is available for updates.
          </p>
        )}
      </section>
    </div>
  );
}

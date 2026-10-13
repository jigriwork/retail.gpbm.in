import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { Empty, Panel } from "@/components/accounts/fields";
import { CustomerUpload } from "@/components/customers/customer-upload";
import { shortDate } from "@/lib/accounts/format";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function CustomerUploadPage() {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role)) return <AccessDenied message="Customer uploads are for the owner and store managers." />;
  const stores = (await getAccessibleStores(profile)).filter((store) => store.is_active);
  if (!stores.length) return <AccessDenied message="No store is assigned to you." />;
  const supabase = await createClient();
  const { data: batches } = await supabase.from("customer_import_batches")
    .select("id,file_name,rows_received,rows_valid,rows_new,consent,created_at,stores(name),profiles!customer_import_batches_created_by_fkey(full_name)")
    .order("created_at", { ascending: false }).limit(15);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Link className="text-sm font-medium text-muted" href="/app/customers">← Customers</Link>
        <h1 className="mt-2 text-3xl font-semibold">Upload customer numbers</h1>
        <p className="mt-2 text-sm leading-6 text-muted">An Excel or CSV file with mobile numbers and names. The app finds the columns, cleans the numbers (+91, spaces, 0) and skips repeats. Customers already in the list keep their bills; names are added where missing.</p>
      </section>
      <Panel title="New upload">
        <CustomerUpload stores={stores.map((store) => ({ id: store.id, name: store.name }))} />
      </Panel>
      <Panel title="Recent uploads">
        {batches?.length ? (
          <ul className="space-y-2 text-sm">
            {batches.map((batch) => (
              <li className="rounded-2xl border border-border bg-background p-3" key={batch.id}>
                <span className="font-semibold">{batch.file_name}</span>
                <span className="text-muted"> · {batch.stores?.name} · {shortDate(batch.created_at.slice(0, 10))} · by {batch.profiles?.full_name ?? "—"}</span>
                <p className="text-muted">{batch.rows_valid} valid of {batch.rows_received} rows · {batch.rows_new} new{batch.consent ? " · marked as agreed to offers" : ""}</p>
              </li>
            ))}
          </ul>
        ) : <Empty>No uploads yet.</Empty>}
      </Panel>
    </div>
  );
}

import Link from "next/link";
import { UserRoundCog } from "lucide-react";

import { StaffAliasesManager } from "@/components/reports/staff-alias-form";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { getStaffAliasPageData, saveStaffAlias } from "@/lib/reports/staff-aliases";

export default async function StaffAliasesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; storeId?: string }>;
}) {
  const { search = "", storeId = "" } = await searchParams;
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const safeStoreId = stores.some((store) => store.id === storeId) ? storeId : "";
  const { aliases, contacts, unmatched } = await getStaffAliasPageData({
    profile,
    search,
    storeId: safeStoreId,
  });

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/reports">
          Back to reports
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Staff name aliases</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Map sales report agent names to staff directory contacts.
            </p>
          </div>
          <UserRoundCog className="size-5 text-muted" />
        </div>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <form className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Store</span>
            <select
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={safeStoreId || "all"}
              name="storeId"
            >
              <option value="all">All accessible stores</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Search</span>
            <input
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={search}
              name="search"
            />
          </label>
          <button className="mt-7 h-12 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85">
            Apply
          </button>
        </form>
      </section>

      <StaffAliasesManager
        action={saveStaffAlias}
        aliases={aliases}
        contacts={contacts}
        stores={stores}
        unmatched={unmatched}
      />
    </div>
  );
}

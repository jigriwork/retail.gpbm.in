import { AccessDenied } from "@/components/app/access-denied";
import { ItemScan } from "@/components/app/item-scan";
import { requireProfile } from "@/lib/auth/session";

export default async function ScanPage() {
  const { profile } = await requireProfile();
  if (!["owner", "manager"].includes(profile.role)) return <AccessDenied message="Item scanning is for the owner and store managers." />;
  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Stock</p>
        <h1 className="mt-2 text-3xl font-semibold">Scan an item</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Scan the barcode on any tag (or type it) to see the item in each store: stock on hand, MRP and recent sales. To count stock, use Stock counts → Scan.</p>
      </section>
      <ItemScan />
    </div>
  );
}

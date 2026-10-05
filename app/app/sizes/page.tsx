import { AccessDenied } from "@/components/app/access-denied";
import { SizeScan } from "@/components/app/size-scan";
import { requireProfile } from "@/lib/auth/session";

export default async function SizesPage() {
  const { profile } = await requireProfile();
  if (!["owner", "manager", "cashier"].includes(profile.role)) return <AccessDenied message="Size check is for the store team." />;
  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">For customers</p>
        <h1 className="mt-2 text-3xl font-semibold">Check sizes</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Scan the tag of any item to see which sizes are in stock, here and in the other store. Stock is from the latest weekly stock report less sales since.</p>
      </section>
      <SizeScan />
    </div>
  );
}

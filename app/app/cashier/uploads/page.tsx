import { AccessDenied } from "@/components/app/access-denied";
import { Notice } from "@/components/accounts/fields";
import { SalesUploadForm } from "@/components/reports/sales-upload-form";
import { StockUploadForm } from "@/components/reports/stock-upload-form";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { cashierUploadSales, cashierUploadStock } from "@/lib/cashier/actions";

export default async function CashierUploadsPage() {
  const { profile } = await requireProfile();
  if (profile?.role !== "cashier") return <AccessDenied message="This page is for cashiers. Managers and owners upload under Reports." />;
  const stores = await getAccessibleStores(profile);
  if (!stores.length) return <AccessDenied message="No store is assigned to you. Ask the owner." />;

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Uploads</p>
        <h1 className="mt-2 text-3xl font-semibold">Daily reports from Logic</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Upload yesterday&apos;s sales every morning, and the stock report every week.</p>
      </section>
      <Notice>Sales: export the <strong>BILL WISE SALES REPORT</strong> from Logic for one day. The DAILY SALE BOOK (totals by brand) is refused.</Notice>
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Sales report</h2>
        <SalesUploadForm action={cashierUploadSales} stores={stores} />
      </section>
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Stock report</h2>
        <StockUploadForm action={cashierUploadStock} stores={stores} />
      </section>
    </div>
  );
}

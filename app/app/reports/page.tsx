import { ImportStatus } from "@/components/reports/import-status";
import Link from "next/link";
import {
  BarChart3,
  CalendarClock,
  ChartNoAxesCombined,
  Contact,
  FileText,
  FileSpreadsheet,
  LineChart,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Moon,
  PackageSearch,
  Phone,
  ShieldAlert,
  ShoppingBag,
  Trophy,
  UploadCloud,
  UserRoundCheck,
  UserRoundCog,
  Wallet,
} from "lucide-react";

import { SalesReportList } from "@/components/reports/sales-report-list";
import { MissingStaffSalesWarning, SuspiciousSalesReportWarning } from "@/components/reports/sales-report-warnings";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { isLimitedView } from "@/lib/auth/view";
import { inboxBrands, unreadChatCount } from "@/lib/msg91/inbox-queries";
import {
  getRecentSalesReports,
  getStoreSalesStatuses,
  isSalesReportSummarySuspicious,
  salesReportMayBeMissingStaff,
} from "@/lib/reports/sales-queries";
import { getSalaryAttendanceOverview } from "@/lib/reports/salary-queries";
import { getStockOverview } from "@/lib/reports/stock-queries";

function formatMoney(value?: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value ?? 0);
}

type Tag = { label: string; tone?: "good" | "bad" | "warn" | "muted" };

const tagTones = {
  bad: "border-danger/30 bg-danger/5 text-danger",
  good: "border-success/30 bg-success/5 text-success",
  muted: "border-border text-muted",
  warn: "border-accent/40 bg-accent-soft text-accent-ink",
};

function Tags({ tags }: { tags: Tag[] }) {
  if (!tags.length) return null;
  return (
    <span className="mt-3 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tagTones[tag.tone ?? "muted"]}`} key={tag.label}>{tag.label}</span>
      ))}
    </span>
  );
}

function ReportTile({ children, description, href, icon: Icon, tags = [], title }: {
  children?: React.ReactNode;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tags?: Tag[];
  title: string;
}) {
  return (
    <Link className="flex flex-col rounded-[1.35rem] border border-border bg-card p-4 shadow-sm transition hover:border-primary" href={href}>
      <span className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="mt-0.5 block text-sm leading-5 text-muted">{description}</span>
        </span>
      </span>
      <Tags tags={tags} />
      {children}
    </Link>
  );
}

/** A titled group of report tiles; a group with nothing visible for this person is left out. */
function Group({ children, title }: { children: React.ReactNode; title: string }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items}</div>
    </section>
  );
}

function StoreStatuses({ rows }: { rows: Array<{ done: boolean; id: string; name: string }> }) {
  return (
    <span className="mt-3 block space-y-2">
      {rows.map((row) => (
        <span className="flex items-center justify-between gap-3 text-sm" key={row.id}>
          <span className="font-medium">{row.name}</span>
          <span className={`rounded-full border border-border px-3 py-1 text-xs font-semibold ${row.done ? "text-success" : "text-danger"}`}>
            {row.done ? "Uploaded" : "Missing"}
          </span>
        </span>
      ))}
    </span>
  );
}

export default async function ReportsPage() {
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const brands = await inboxBrands(profile);
  const [statuses, recentReports, salaryOverview, stockOverview, unreadChats] = await Promise.all([
    getStoreSalesStatuses(stores),
    getRecentSalesReports(6),
    getSalaryAttendanceOverview(stores),
    getStockOverview(stores),
    unreadChatCount(brands).catch(() => 0),
  ]);
  const missingStores = statuses.filter((status) => !status.yesterdayReport);
  const limited = await isLimitedView(profile);
  const owner = profile?.role === "owner";
  const ownerTag: Tag = { label: "Owner only", tone: "warn" };

  return (
    <div className="space-y-6">
      <ImportStatus />
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Reports</p>
        <h1 className="mt-2 text-3xl font-semibold">Business uploads</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {limited ? "Daily sales and stock uploads." : "Daily sales, stock, salary attendance and practical sales analytics are active."}
        </p>
      </section>

      {owner ? (
        <Link
          className="flex items-center gap-4 rounded-[1.35rem] border border-accent/40 bg-accent-soft p-4 shadow-sm transition hover:border-accent"
          href="/app/reports/correction"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary-deep">
            <ShieldAlert className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Wrong file uploaded?</span>
            <span className="block text-sm leading-5 text-accent-ink">
              Open Data Correction Center to delete or replace a sales or stock report.
            </span>
          </span>
        </Link>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">📤 Daily uploads</h2>
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <BarChart3 className="size-5" />
              </span>
              <div>
                <h3 className="text-xl font-semibold">Daily Sales Upload</h3>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Upload store-wise daily sales files and convert them into searchable sales rows.
                </p>
                <Tags tags={[{ label: "Every day" }]} />
              </div>
            </div>
            <Link
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-deep"
              href="/app/reports/sales"
            >
              <UploadCloud className="size-4" />
              Upload
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {statuses.map((status) => {
              const suspicious = status.latestReport ? isSalesReportSummarySuspicious(status.latestReport) : false;
              const missingStaff = status.latestReport ? salesReportMayBeMissingStaff(status.latestReport) : false;

              return (
              <div className="rounded-2xl border border-border p-4" key={status.store.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{status.store.name}</p>
                    <p className="mt-1 text-xs font-medium text-muted">
                      Yesterday: {status.yesterdayDate}
                    </p>
                  </div>
                  <span
                    className={
                      status.yesterdayReport
                        ? "rounded-full border border-border px-3 py-1 text-xs font-semibold text-success"
                        : "rounded-full border border-border px-3 py-1 text-xs font-semibold text-danger"
                    }
                  >
                    {status.yesterdayReport ? "Uploaded" : "Missing"}
                  </span>
                </div>
                {!limited ? (
                  <>
                <p className="mt-4 text-xs font-medium text-muted">Actual sale (incl. tax)</p>
                <p className="mt-1 text-2xl font-semibold">
                  {formatMoney(status.latestReport?.summary?.totalNetSale)}
                </p>
                <p className="mt-2 text-xs font-medium text-muted">
                  MRP value: {status.latestReport?.summary?.mrpRowCount
                    ? formatMoney(status.latestReport.summary.totalMrpValue)
                    : "Not available"}
                </p>
                <p className="mt-1 text-xs font-medium text-muted">
                  Net discount: {status.latestReport?.summary?.mrpRowCount
                    ? `${formatMoney(status.latestReport.summary.totalDiscountValue)} · ${Number(status.latestReport.summary.totalMrpValue ?? 0) > 0 ? `Avg ${Number(status.latestReport.summary.averageDiscountPercent ?? 0).toFixed(1)}%` : "Avg not available"}`
                    : "Not available"}
                </p>
                  </>
                ) : null}
                <p className="mt-1 text-xs font-medium text-muted">
                  Latest: {status.latestReport?.report_date ?? "No upload yet"}
                </p>
                {suspicious ? <SuspiciousSalesReportWarning className="mt-4" /> : null}
                {missingStaff ? <MissingStaffSalesWarning className="mt-4" /> : null}
              </div>
              );
            })}
          </div>

          {missingStores.length ? (
            <div className="mt-4 rounded-2xl border border-border bg-background p-4 text-sm font-medium text-danger">
              Missing yesterday sales report:{" "}
              {missingStores.map((status) => status.store.name).join(", ")}
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ReportTile
            description="Upload the stock file every week (Monday) so stock and sizes stay right."
            href="/app/reports/stock"
            icon={FileSpreadsheet}
            tags={[{ label: "Every Monday" }]}
            title="Stock Upload"
          >
            <StoreStatuses rows={stockOverview.statuses.map((status) => ({ done: Boolean(status.report), id: status.store.id, name: status.store.name }))} />
          </ReportTile>
          {!limited ? (
            <ReportTile
              description={`Due day 1. Salary day 3. Current month: ${salaryOverview.periodMonth}.`}
              href="/app/reports/salary-attendance"
              icon={CalendarClock}
              tags={[{ label: "Every month" }]}
              title="Salary Attendance"
            >
              <StoreStatuses rows={salaryOverview.statuses.map((status) => ({ done: Boolean(status.report), id: status.store.id, name: status.store.name }))} />
            </ReportTile>
          ) : null}
        </div>
      </section>

      <Group title="📈 Sales">
        {!limited ? (
          <ReportTile
            description="Track sales trends, targets, daily movement, brands and categories from uploaded sales rows."
            href="/app/reports/sales/analytics"
            icon={LineChart}
            key="sales-analytics"
            title="Sales Analytics"
          />
        ) : null}
        {!limited ? (
          <ReportTile
            description="Check staff performance for daily, weekly and monthly sales."
            href="/app/reports/staff"
            icon={UserRoundCheck}
            key="staff-sales"
            title="Staff Sales Report"
          />
        ) : null}
        {!limited ? (
          <ReportTile
            description="Leaderboard with average bill, items per bill, targets and incentive per salesperson."
            href="/app/reports/incentives"
            icon={Trophy}
            key="incentives"
            title="Staff incentives"
          />
        ) : null}
        <ReportTile
          description="Pick any dates: pieces sold by brand, item and size, and what is still in stock without a sale."
          href="/app/reports/sold"
          icon={PackageSearch}
          key="sold"
          title="What sold, what did not"
        />
      </Group>

      <Group title="📦 Stock & buying">
        {!limited ? (
          <ReportTile
            description="Sell-through, reorder by size, transfers between stores, markdown list, budgets and stock counts."
            href="/app/buying"
            icon={ShoppingBag}
            key="buying"
            title="Buying & stock"
          />
        ) : null}
        {!limited ? (
          <ReportTile
            description="Search brand/product/category/size, compare stock vs sales, and find what to reorder or avoid buying."
            href="/app/reports/business"
            icon={ChartNoAxesCombined}
            key="restock"
            title="Buying & Restock Report"
          />
        ) : null}
        {!limited ? (
          <ReportTile
            description="Review stock movement, possible dead stock, high-stock low-sale items and reorder signals."
            href="/app/reports/stock/analytics"
            icon={PackageSearch}
            key="stock-analytics"
            title="Stock Analytics"
          />
        ) : null}
      </Group>

      <Group title="💬 Customers & WhatsApp">
        <ReportTile
          description="Repeat and lapsed customers from the bills, with WhatsApp thank-you and offer messages."
          href="/app/customers"
          icon={Contact}
          key="customers"
          title="Customers"
        />
        {brands.length ? (
          <ReportTile
            description="Customers' replies to the stores' WhatsApp numbers. Read them and reply within 24 hours."
            href="/app/reports/whatsapp"
            icon={MessageCircle}
            key="whatsapp-inbox"
            tags={unreadChats ? [{ label: `${unreadChats} new`, tone: "good" }] : [{ label: "New" }]}
            title="WhatsApp messages"
          />
        ) : null}
        {owner ? (
          <ReportTile
            description="Receipts, offers, payslips and owner reports sent through MSG91: delivered, read or failed, and the monthly budget."
            href="/app/customers/whatsapp"
            icon={MessageSquareText}
            key="whatsapp-delivery"
            tags={[ownerTag]}
            title="Message delivery"
          />
        ) : null}
      </Group>

      <Group title="💰 Money & staff">
        <ReportTile
          description={owner ? "Day close, expenses and monthly profit per store." : "Close the day's cash and record store expenses."}
          href="/app/money"
          icon={Wallet}
          key="money"
          title="Store money"
        />
        {owner ? (
          <ReportTile
            description="Owner-only salary sheet upload, review, PDF generation and ZIP download."
            href="/app/payslips"
            icon={FileText}
            key="payslips"
            tags={[ownerTag]}
            title="Payslip Generation"
          />
        ) : null}
        {!limited ? (
          <ReportTile
            description="Phone numbers for assigned store staff."
            href="/app/employees"
            icon={Phone}
            key="phones"
            title="Staff Phone Directory"
          />
        ) : null}
        <ReportTile
          description="Map sales report agent names to staff directory contacts."
          href="/app/reports/staff-aliases"
          icon={UserRoundCog}
          key="aliases"
          title="Staff Name Aliases"
        />
      </Group>

      {owner ? (
        <Group title="🔒 Owner tools">
          <ReportTile
            description="The 11 PM plan: idle stock and why, sizes running out, moves between stores, staff to praise or coach, tomorrow's to-dos."
            href="/app/owner/night"
            icon={Moon}
            key="night"
            tags={[ownerTag]}
            title="🌙 Plan for tomorrow"
          />
          <ReportTile
            description="To everyone, a store, managers, staff or one person. It rings on their phone. Team requests: 🔔 → Requests."
            href="/app/owner/notify"
            icon={Megaphone}
            key="notify"
            tags={[ownerTag]}
            title="📣 Send a notification"
          />
          <ReportTile
            description="Delete or replace a wrong sales or stock upload, and import past sales. Owner only."
            href="/app/reports/correction"
            icon={ShieldAlert}
            key="correction"
            tags={[ownerTag]}
            title="Data Correction Center"
          />
        </Group>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent sales uploads</h2>
        <SalesReportList hideAmounts={limited} reports={recentReports} />
      </section>
    </div>
  );
}

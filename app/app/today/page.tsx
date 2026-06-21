import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CalendarCheck,
  ClipboardCheck,
  History,
  LineChart,
  ListTodo,
  MessageSquareText,
  PackageSearch,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Store,
  TriangleAlert,
  UploadCloud,
  UserRoundCheck,
  UserRoundCog,
  WalletCards,
} from "lucide-react";

import { ChecklistCard } from "@/components/checklist/checklist-card";
import { SyncNowButton } from "@/components/app/sync-now-button";
import { ReviewStatusCard } from "@/components/reviews/review-status-card";
import { getAccessibleStores, requireProfile, type Store as RetailStore } from "@/lib/auth/session";
import { getAccessibleChecklists } from "@/lib/checklist/queries";
import { getMissingEmployeePhoneCount } from "@/lib/employees/queries";
import { getLatestStockMonth, getStockSummary } from "@/lib/analytics/stock";
import {
  getPreviousWeekRangeAsiaKolkata,
  getWeeklyAuditSummaries,
  isWeeklyAuditDay,
} from "@/lib/audit/weekly";
import {
  getStoreSalesStatuses,
  isSalesReportSummarySuspicious,
  salesReportMayBeMissingStaff,
  type SalesReportSummary,
  type StoreSalesStatus,
} from "@/lib/reports/sales-queries";
import { getSalaryAttendanceOverview } from "@/lib/reports/salary-queries";
import { getStockOverview, type StockOverview } from "@/lib/reports/stock-queries";
import { getReviewStatuses } from "@/lib/reviews/queries";
import { createClient } from "@/lib/supabase/server";
import { getTaskSummary } from "@/lib/tasks/queries";
import { getTodayUpdateSummary } from "@/lib/updates/queries";
import {
  getAvailableReceivableMonths,
  getReceivableSummaryForMonth,
} from "@/lib/payslips/receivables-queries";
import { formatMonth as formatPayslipMonth } from "@/lib/payslips/utils";

type TodaySearchParams = {
  audit?: string;
  more?: string;
  stock?: string;
};

type TodayStore = RetailStore;

type HistoricalImportSummary = {
  latest: {
    detected_end_date: string | null;
    detected_start_date: string | null;
    failed_dates: number | null;
    imported_dates: number | null;
    original_file_name: string | null;
    replaced_dates: number | null;
    skipped_dates: number | null;
    status: string | null;
    stores: { name: string | null; code: string | null } | null;
    total_dates: number | null;
  } | null;
  warningCount: number;
};

const ownerShortcuts = [
  {
    description: "Upload today's store sales report.",
    href: "/app/reports/sales",
    icon: UploadCloud,
    title: "Upload Daily Sales",
  },
  {
    description: "Check daily uploads, suspicious reports and latest sale summaries.",
    href: "/app/reports",
    icon: LineChart,
    title: "Daily Sales Status",
  },
  {
    description: "Search sales vs stock for reorder and avoid-buying decisions.",
    href: "/app/reports/business",
    icon: ShoppingBag,
    title: "Buying & Restock",
  },
  {
    description: "See staff sales from mapped report names.",
    href: "/app/reports/staff",
    icon: UserRoundCheck,
    title: "Staff Sales",
  },
  {
    description: "Map uploaded staff names to real staff records.",
    href: "/app/reports/staff-aliases",
    icon: UserRoundCog,
    title: "Fix Staff Names",
  },
  {
    description: "Delete, replace or import historical sales safely.",
    href: "/app/reports/correction",
    icon: ShieldAlert,
    title: "Fix Wrong Upload",
  },
  {
    description: "Import month-to-date or financial-year sales.",
    href: "/app/reports/correction",
    icon: History,
    title: "Historical Sales Import",
  },
  {
    description: "Ask what needs attention today.",
    href: "/app/secretary",
    icon: Bot,
    title: "AI Secretary",
  },
  {
    description: "Review pending work and follow-ups.",
    href: "/app/tasks",
    icon: ListTodo,
    title: "Tasks",
  },
  {
    description: "Check daily store discipline.",
    href: "/app/checklist",
    icon: ClipboardCheck,
    title: "Checklist",
  },
  {
    description: "Upload monthly stock reports.",
    href: "/app/reports/stock",
    icon: PackageSearch,
    title: "Upload Stock",
  },
];

const managerShortcuts = [
  {
    description: "Upload today's assigned-store sales.",
    href: "/app/reports/sales",
    icon: UploadCloud,
    title: "Upload Daily Sales",
  },
  {
    description: "Upload monthly assigned-store stock.",
    href: "/app/reports/stock",
    icon: PackageSearch,
    title: "Upload Stock",
  },
  {
    description: "Map uploaded staff names for your store.",
    href: "/app/reports/staff-aliases",
    icon: UserRoundCog,
    title: "Fix Staff Names",
  },
  {
    description: "Check staff-wise sales for your assigned store.",
    href: "/app/reports/staff",
    icon: UserRoundCheck,
    title: "Staff Sales",
  },
  {
    description: "Complete today's store checklist.",
    href: "/app/checklist",
    icon: ClipboardCheck,
    title: "Checklist",
  },
  {
    description: "See assigned tasks and urgent work.",
    href: "/app/tasks",
    icon: ListTodo,
    title: "Tasks",
  },
  {
    description: "Send an issue or store update.",
    href: "/app/updates/new",
    icon: MessageSquareText,
    title: "Send Update",
  },
  {
    description: "Open your assigned store page.",
    href: "/app/stores",
    icon: Store,
    title: "Assigned Store",
  },
];

function formatMoney(value?: number | null) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value ?? 0);
}

function formatDateTime(value?: string | null) {
  if (!value) return "No upload";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function badgeClass(tone: "danger" | "success" | "warning") {
  if (tone === "danger") {
    return "rounded-full border border-border px-3 py-1 text-xs font-semibold text-danger";
  }

  if (tone === "warning") {
    return "rounded-full border border-border px-3 py-1 text-xs font-semibold text-warning";
  }

  return "rounded-full border border-border px-3 py-1 text-xs font-semibold text-success";
}

function summaryNumber(summary: SalesReportSummary | null | undefined, key: keyof SalesReportSummary) {
  const value = summary?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function salesUploadBadge(report: StoreSalesStatus["todayReport"]) {
  return report
    ? { className: badgeClass("success"), label: "Uploaded" }
    : { className: badgeClass("danger"), label: "Missing" };
}

function latestUploadBadge(status: StoreSalesStatus) {
  const unmatchedStaffCount = summaryNumber(status.latestReport?.summary, "unmatchedStaffCount");

  if (unmatchedStaffCount > 0) {
    return { className: badgeClass("danger"), label: "Needs Staff Fix" };
  }

  if (status.todayReport || status.yesterdayReport) {
    return { className: badgeClass("success"), label: "Uploaded" };
  }

  if (status.latestReport) {
    return { className: badgeClass("warning"), label: "Late" };
  }

  return { className: badgeClass("danger"), label: "Missing" };
}

function topStaffFromSummaries(statuses: StoreSalesStatus[]) {
  return statuses
    .flatMap((status) =>
      (status.latestReport?.summary?.topStaff ?? []).map((staff) => ({
        ...staff,
        storeName: status.store.name,
      })),
    )
    .sort((left, right) => right.sale - left.sale)[0];
}

function salesIssueSummary(statuses: StoreSalesStatus[]) {
  const missingToday = statuses.filter((status) => !status.todayReport).length;
  const missingYesterday = statuses.filter((status) => !status.yesterdayReport).length;
  const suspiciousReports = statuses.filter(
    (status) => status.latestReport && isSalesReportSummarySuspicious(status.latestReport),
  );
  const missingStaffReports = statuses.filter(
    (status) => status.latestReport && salesReportMayBeMissingStaff(status.latestReport),
  );
  const unmatchedStaffCount = statuses.reduce(
    (sum, status) => sum + summaryNumber(status.latestReport?.summary, "unmatchedStaffCount"),
    0,
  );

  return {
    missingToday,
    missingYesterday,
    suspiciousCount: suspiciousReports.length,
    missingStaffCount: missingStaffReports.length,
    unmatchedStaffCount,
    topStaff: topStaffFromSummaries(statuses),
  };
}

function queryHref(params: TodaySearchParams) {
  const query = new URLSearchParams();
  if (params.stock) query.set("stock", params.stock);
  if (params.audit) query.set("audit", params.audit);
  if (params.more) query.set("more", params.more);
  const text = query.toString();
  return `/app/today${text ? `?${text}` : ""}`;
}

async function getHistoricalImportSummary(stores: Array<{ id: string }>): Promise<HistoricalImportSummary> {
  const storeIds = stores.map((store) => store.id);

  if (!storeIds.length) {
    return { latest: null, warningCount: 0 };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_upload_batches")
    .select(
      "original_file_name,status,detected_start_date,detected_end_date,total_dates,imported_dates,skipped_dates,replaced_dates,failed_dates,stores(name,code)",
    )
    .in("store_id", storeIds)
    .order("created_at", { ascending: false })
    .limit(5);
  const batches = (data ?? []) as HistoricalImportSummary["latest"][];
  const warningCount = batches.filter((batch) => {
    if (!batch) return false;
    return batch.status === "partial" || batch.status === "failed" || Number(batch.failed_dates ?? 0) > 0;
  }).length;

  return { latest: batches[0] ?? null, warningCount };
}

function ShortcutGrid({
  shortcuts,
}: {
  shortcuts: Array<{ description: string; href: string; icon: React.ComponentType<{ className?: string }>; title: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {shortcuts.map((item) => {
        const Icon = item.icon;

        return (
          <Link
            className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-foreground hover:bg-black/[0.02]"
            href={item.href}
            key={`${item.title}-${item.href}`}
          >
            <Icon className="mb-4 size-5 text-muted" />
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>
          </Link>
        );
      })}
    </div>
  );
}

function MetricCard({
  href,
  icon: Icon,
  label,
  tone = "default",
  value,
}: {
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: "danger" | "default" | "success" | "warning";
  value: string;
}) {
  const className = [
    "rounded-[1.35rem] border border-border bg-card p-4 shadow-sm",
    href ? "transition hover:border-foreground" : "",
  ].join(" ");
  const valueClass =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : "";
  const content = (
    <>
      <Icon className="mb-4 size-5 text-muted" />
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value}</p>
    </>
  );

  return href ? (
    <Link className={className} href={href}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function SalesStatusCards({ statuses }: { statuses: StoreSalesStatus[] }) {
  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted">Daily Sales Upload Status</p>
          <h2 className="mt-2 text-2xl font-semibold">Today, yesterday and latest upload by store</h2>
        </div>
        <UploadCloud className="size-5 text-muted" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {statuses.map((status) => {
          const latestReport = status.latestReport;
          const todayBadge = salesUploadBadge(status.todayReport);
          const yesterdayBadge = salesUploadBadge(status.yesterdayReport);
          const latestBadge = latestUploadBadge(status);
          const unmatchedStaffCount = summaryNumber(latestReport?.summary, "unmatchedStaffCount");
          const suspicious = latestReport ? isSalesReportSummarySuspicious(latestReport) : false;
          const missingStaff = latestReport ? salesReportMayBeMissingStaff(latestReport) : false;

          return (
            <article className="rounded-2xl border border-border p-4" key={status.store.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{status.store.name}</h3>
                  <p className="mt-1 text-xs font-medium text-muted">
                    Latest upload: {latestReport?.report_date ?? "No upload"}
                  </p>
                </div>
                <span className={latestBadge.className}>{latestBadge.label}</span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted">Today</p>
                    <span className={todayBadge.className}>{todayBadge.label}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{status.todayDate}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted">Yesterday</p>
                    <span className={yesterdayBadge.className}>{yesterdayBadge.label}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{status.yesterdayDate}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-medium text-muted">Uploaded by</p>
                  <p className="mt-1 break-words text-sm font-semibold">
                    {latestReport?.profiles?.full_name ?? latestReport?.profiles?.email ?? "No upload"}
                  </p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-medium text-muted">Upload time</p>
                  <p className="mt-1 text-sm font-semibold">{formatDateTime(latestReport?.created_at)}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-medium text-muted">Total sale</p>
                  <p className="mt-1 text-sm font-semibold">{formatMoney(latestReport?.summary?.totalNetSale)}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-medium text-muted">Bills</p>
                  <p className="mt-1 text-sm font-semibold">{latestReport?.summary?.billCount ?? 0}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-3 text-sm font-semibold transition hover:bg-black/[0.03]"
                  href={`/app/reports/sales?storeId=${status.store.id}`}
                >
                  Upload / View Sales
                </Link>
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-3 text-sm font-semibold transition hover:bg-black/[0.03]"
                  href={`/app/reports/staff-aliases?storeId=${status.store.id}`}
                >
                  Fix Staff Names
                </Link>
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-3 text-sm font-semibold transition hover:bg-black/[0.03]"
                  href={`/app/reports/business?storeId=${status.store.id}`}
                >
                  Buying Report
                </Link>
              </div>

              {unmatchedStaffCount > 0 || suspicious || missingStaff ? (
                <div className="mt-4 rounded-2xl border border-border bg-background p-4 text-sm leading-6">
                  {unmatchedStaffCount > 0 ? (
                    <p className="font-semibold text-danger">{unmatchedStaffCount} unmatched staff name(s) need fixing.</p>
                  ) : null}
                  {suspicious ? (
                    <p className="font-semibold text-danger">Suspicious sales summary found. Owner should review this upload.</p>
                  ) : null}
                  {missingStaff ? (
                    <p className="font-semibold text-warning">This report may not contain a staff column.</p>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StockStatusMini({ stockOverview }: { stockOverview: StockOverview }) {
  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted">Stock Upload Status</p>
          <h2 className="mt-2 text-2xl font-semibold">{stockOverview.headline}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Monthly stock report due {stockOverview.dueDate}.</p>
        </div>
        <Link
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
          href="/app/reports/stock"
        >
          Upload Stock
        </Link>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={PackageSearch} label="Uploaded" value={String(stockOverview.uploadedCount)} />
        <MetricCard
          icon={AlertTriangle}
          label="Missing"
          tone={stockOverview.missingCount ? "danger" : "success"}
          value={String(stockOverview.missingCount)}
        />
        {stockOverview.statuses.map((status) => (
          <Link
            className="rounded-2xl border border-border p-3 transition hover:border-foreground"
            href={`/app/reports/stock?storeId=${status.store.id}`}
            key={status.store.id}
          >
            <p className="text-xs font-medium text-muted">{status.store.name}</p>
            <p className={status.report ? "mt-1 text-lg font-semibold text-success" : "mt-1 text-lg font-semibold text-danger"}>
              {status.report ? "Uploaded" : "Pending"}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

async function StockPulseSection({ stores }: { stores: TodayStore[] }) {
  const latestStockMonth = await getLatestStockMonth();
  const stockPulse = latestStockMonth
    ? await getStockSummary({
        storeIds: stores.map((store) => store.id),
        stockMonth: latestStockMonth,
        lookbackDays: 30,
        stores,
      })
    : null;

  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted">Loaded Stock Pulse</p>
          <h2 className="mt-2 text-2xl font-semibold">Stock movement snapshot</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            This section is loaded only on request because stock analytics can scan many stock and sales rows.
          </p>
        </div>
        <Link className="inline-flex h-11 items-center justify-center rounded-2xl border border-border px-4 text-sm font-semibold" href="/app/reports/stock/analytics">
          Full Stock Analytics
        </Link>
      </div>
      {stockPulse ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard icon={PackageSearch} label="Latest month" value={stockPulse.stockMonth} />
          <MetricCard icon={TriangleAlert} label="Slow stock" value={String(stockPulse.slowStockCandidates.length)} />
          <MetricCard icon={AlertTriangle} label="No-sale stock" value={String(stockPulse.deadStockCandidates.length)} />
          <MetricCard icon={ShoppingBag} label="Fast low stock" value={String(stockPulse.fastMovingLowStockCandidates.length)} />
        </div>
      ) : (
        <p className="text-sm leading-6 text-muted">No stock report found yet.</p>
      )}
    </section>
  );
}

async function WeeklyAuditSection({ stores }: { stores: TodayStore[] }) {
  const previousWeekRange = getPreviousWeekRangeAsiaKolkata();
  const weeklyAudits = await getWeeklyAuditSummaries(stores, previousWeekRange);
  const missingSalesReports = weeklyAudits.reduce((sum, audit) => sum + audit.missingSalesReports.length, 0);
  const urgentUpdates = weeklyAudits.reduce((sum, audit) => sum + audit.updates.openUrgentCount, 0);

  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <p className="text-sm font-medium text-muted">Loaded Weekly Audit</p>
      <h2 className="mt-2 text-2xl font-semibold">
        Previous week: {previousWeekRange.startDate} to {previousWeekRange.endDate}
      </h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MetricCard icon={CalendarCheck} label="Stores audited" value={String(weeklyAudits.length)} />
        <MetricCard icon={AlertTriangle} label="Missing sales days" tone={missingSalesReports ? "danger" : "success"} value={String(missingSalesReports)} />
        <MetricCard icon={MessageSquareText} label="Urgent updates" tone={urgentUpdates ? "warning" : "success"} value={String(urgentUpdates)} />
      </div>
    </section>
  );
}

async function MoreDetailsSection({
  profileRole,
  stores,
}: {
  profileRole: "manager" | "owner" | string;
  stores: TodayStore[];
}) {
  const [checklists, reviewStatuses, salaryOverview] = await Promise.all([
    getAccessibleChecklists(undefined, stores),
    getReviewStatuses(stores),
    getSalaryAttendanceOverview(stores),
  ]);
  let receivableSummary: { pendingCount: number; pendingTotal: number } | null = null;
  let latestReceivableMonth = "";

  if (profileRole === "owner") {
    const receivableMonths = await getAvailableReceivableMonths();
    latestReceivableMonth = receivableMonths[0] ?? "";
    if (latestReceivableMonth) {
      receivableSummary = await getReceivableSummaryForMonth(latestReceivableMonth);
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Daily checklist</h2>
          <ClipboardCheck className="size-5 text-muted" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {checklists.map((checklist) => (
            <ChecklistCard checklist={checklist} key={checklist.store.id} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Today store reviews</h2>
          <Sparkles className="size-5 text-muted" />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {reviewStatuses.map((status) => (
            <div className="grid gap-3" key={status.store.id}>
              <ReviewStatusCard
                href={`/app/reviews/rack?storeId=${status.store.id}`}
                review={status.rackReview}
                storeName={status.store.name}
                title="Rack review"
              />
              <ReviewStatusCard
                href={`/app/reviews/cleaning?storeId=${status.store.id}`}
                review={status.cleaningReview}
                storeName={status.store.name}
                title="Cleaning review"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Salary Attendance Upload</p>
            <h2 className="mt-2 text-2xl font-semibold">{salaryOverview.headline}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Attendance due {salaryOverview.dueDate}. Payslips remain owner-only.
            </p>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
            href="/app/reports/salary-attendance"
          >
            Open upload
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard icon={CalendarCheck} label="Uploaded" value={String(salaryOverview.uploadedCount)} />
          <MetricCard
            icon={AlertTriangle}
            label="Missing"
            tone={salaryOverview.missingCount ? "warning" : "success"}
            value={String(salaryOverview.missingCount)}
          />
          {profileRole === "owner" && receivableSummary ? (
            <MetricCard
              href="/app/payslips/receivables"
              icon={WalletCards}
              label={`Receivables ${formatPayslipMonth(latestReceivableMonth)}`}
              tone={receivableSummary.pendingCount ? "warning" : "success"}
              value={formatMoney(receivableSummary.pendingTotal)}
            />
          ) : null}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Accessible stores</h2>
          <Store className="size-5 text-muted" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <Link
              className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm transition hover:border-foreground"
              href={`/app/stores/${store.id}`}
              key={store.id}
            >
              <p className="text-lg font-semibold">{store.name}</p>
              <p className="mt-1 text-sm text-muted">{store.code}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function OwnerToday({
  historicalImport,
  missingPhoneCount,
  salesIssues,
  salesStatuses,
  stockOverview,
  taskSummary,
  updateSummary,
}: {
  historicalImport: HistoricalImportSummary;
  missingPhoneCount: number;
  salesIssues: ReturnType<typeof salesIssueSummary>;
  salesStatuses: StoreSalesStatus[];
  stockOverview: StockOverview;
  taskSummary: Awaited<ReturnType<typeof getTaskSummary>>;
  updateSummary: Awaited<ReturnType<typeof getTodayUpdateSummary>>;
}) {
  const criticalSalesIssues =
    salesIssues.missingToday + salesIssues.missingYesterday + salesIssues.suspiciousCount + salesIssues.missingStaffCount;
  const historicalTone = historicalImport.warningCount ? "warning" : historicalImport.latest ? "success" : "default";
  const historicalText = historicalImport.latest
    ? `${historicalImport.latest.status ?? "uploaded"}: ${historicalImport.latest.detected_start_date ?? "?"} to ${
        historicalImport.latest.detected_end_date ?? "?"
      }`
    : "No recent batch";

  return (
    <>
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Today</p>
            <h1 className="mt-2 text-3xl font-semibold">Owner Command Center</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Start with exceptions, uploads, staff issues, and buying actions.
            </p>
          </div>
          <SyncNowButton />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          href="/app/reports"
          icon={criticalSalesIssues ? AlertTriangle : LineChart}
          label="Missing / suspicious sales"
          tone={criticalSalesIssues ? "danger" : "success"}
          value={criticalSalesIssues ? String(criticalSalesIssues) : "Clear"}
        />
        <MetricCard
          href="/app/reports/correction"
          icon={History}
          label="Historical import status"
          tone={historicalTone}
          value={historicalText}
        />
        <MetricCard
          href="/app/reports/business"
          icon={ShoppingBag}
          label="Buying / stock action"
          tone={stockOverview.missingCount ? "warning" : "success"}
          value={stockOverview.missingCount ? `${stockOverview.missingCount} stock pending` : "Stock ready"}
        />
        <MetricCard
          href="/app/reports/staff-aliases"
          icon={UserRoundCog}
          label="Staff issues"
          tone={salesIssues.unmatchedStaffCount || salesIssues.missingStaffCount ? "danger" : "success"}
          value={
            salesIssues.unmatchedStaffCount || salesIssues.missingStaffCount
              ? `${salesIssues.unmatchedStaffCount} unmatched`
              : "Clear"
          }
        />
        <MetricCard
          href="/app/tasks"
          icon={ListTodo}
          label="Today tasks"
          tone={taskSummary.urgentCount ? "warning" : "default"}
          value={`${taskSummary.todayCount} total`}
        />
        <MetricCard
          href="/app/updates?status=open&urgency=urgent"
          icon={MessageSquareText}
          label="Urgent manager updates"
          tone={updateSummary.openUrgentCount ? "warning" : "success"}
          value={String(updateSummary.openUrgentCount)}
        />
        <MetricCard href="/app/reports/correction" icon={ShieldAlert} label="Fix Wrong Upload" value="Open" />
        <MetricCard href="/app/secretary" icon={Bot} label="AI Secretary" value="Ask" />
      </section>

      {salesIssues.topStaff ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted">Lightweight staff pulse</p>
          <h2 className="mt-2 text-2xl font-semibold">{salesIssues.topStaff.name}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Top staff from latest uploaded report summaries: {formatMoney(salesIssues.topStaff.sale)} at{" "}
            {salesIssues.topStaff.storeName}.
          </p>
        </section>
      ) : missingPhoneCount > 0 ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted">Staff directory</p>
          <h2 className="mt-2 text-2xl font-semibold">{missingPhoneCount} staff phone(s) missing</h2>
          <Link className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold" href="/app/employees">
            Open Staff Directory
          </Link>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Owner shortcuts</h2>
          <BarChart3 className="size-5 text-muted" />
        </div>
        <ShortcutGrid shortcuts={ownerShortcuts} />
      </section>

      <SalesStatusCards statuses={salesStatuses} />
      <StockStatusMini stockOverview={stockOverview} />
    </>
  );
}

function ManagerToday({
  salesStatuses,
  stockOverview,
  stores,
  taskSummary,
  updateSummary,
}: {
  salesStatuses: StoreSalesStatus[];
  stockOverview: StockOverview;
  stores: TodayStore[];
  taskSummary: Awaited<ReturnType<typeof getTaskSummary>>;
  updateSummary: Awaited<ReturnType<typeof getTodayUpdateSummary>>;
}) {
  const assignedStoreLabel = stores.map((store) => store.name).join(", ");
  const missingSalesCount = salesStatuses.filter((status) => !status.todayReport || !status.yesterdayReport).length;
  const staffIssues = salesStatuses.reduce(
    (sum, status) => sum + summaryNumber(status.latestReport?.summary, "unmatchedStaffCount"),
    0,
  );

  return (
    <>
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Today</p>
            <h1 className="mt-2 text-3xl font-semibold">My Store Command Center</h1>
            <p className="mt-2 text-sm leading-6 text-muted">Complete your daily store actions here.</p>
          </div>
          <SyncNowButton />
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">My assigned store{stores.length === 1 ? "" : "s"}</p>
        <h2 className="mt-2 text-2xl font-semibold">{assignedStoreLabel}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            href="/app/reports/sales"
            icon={UploadCloud}
            label="Sales upload warnings"
            tone={missingSalesCount ? "danger" : "success"}
            value={missingSalesCount ? `${missingSalesCount} store issue(s)` : "Clear"}
          />
          <MetricCard
            href="/app/reports/stock"
            icon={PackageSearch}
            label="Stock upload"
            tone={stockOverview.missingCount ? "warning" : "success"}
            value={stockOverview.missingCount ? `${stockOverview.missingCount} pending` : "Uploaded"}
          />
          <MetricCard
            href="/app/reports/staff-aliases"
            icon={UserRoundCog}
            label="Staff names"
            tone={staffIssues ? "danger" : "success"}
            value={staffIssues ? `${staffIssues} unmatched` : "Clear"}
          />
          <MetricCard
            href="/app/tasks"
            icon={ListTodo}
            label="Tasks today"
            tone={taskSummary.urgentCount ? "warning" : "default"}
            value={`${taskSummary.todayCount} total`}
          />
          <MetricCard href="/app/checklist" icon={ClipboardCheck} label="Checklist" value="Open" />
          <MetricCard href="/app/updates/new" icon={MessageSquareText} label="Send update" value="Open" />
          <MetricCard href="/app/reports/staff" icon={UserRoundCheck} label="Staff Sales" value="Open" />
          <MetricCard
            href="/app/updates?status=open&urgency=urgent"
            icon={TriangleAlert}
            label="Open urgent updates"
            tone={updateSummary.openUrgentCount ? "warning" : "success"}
            value={String(updateSummary.openUrgentCount)}
          />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Manager shortcuts</h2>
          <Store className="size-5 text-muted" />
        </div>
        <ShortcutGrid shortcuts={managerShortcuts} />
      </section>

      <SalesStatusCards statuses={salesStatuses} />
      <StockStatusMini stockOverview={stockOverview} />
    </>
  );
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<TodaySearchParams>;
}) {
  const params = await searchParams;
  const { profile } = await requireProfile();
  const stores = (await getAccessibleStores(profile)) as TodayStore[];
  const isOwner = profile?.role === "owner";

  if (!isOwner && stores.length === 0) {
    return (
      <section className="rounded-[1.35rem] border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Today</p>
            <h1 className="mt-2 text-3xl font-semibold">No store assigned</h1>
            <p className="mt-3 text-sm leading-6 text-muted">Please contact owner to assign a store.</p>
          </div>
          <SyncNowButton />
        </div>
      </section>
    );
  }

  const defaultTaskSummary = { todayCount: 0, urgentCount: 0, privateCount: 0, storeCounts: [] };
  const [taskSummary, salesStatuses, stockOverview, updateSummary, missingPhoneCount, historicalImport] = await Promise.all([
    profile ? getTaskSummary(profile, stores) : Promise.resolve(defaultTaskSummary),
    getStoreSalesStatuses(stores),
    getStockOverview(stores),
    getTodayUpdateSummary(stores),
    isOwner ? getMissingEmployeePhoneCount(stores.map((store) => store.id)) : Promise.resolve(0),
    isOwner ? getHistoricalImportSummary(stores) : Promise.resolve({ latest: null, warningCount: 0 }),
  ]);
  const salesIssues = salesIssueSummary(salesStatuses);
  const showStock = params.stock === "1";
  const showAudit = params.audit === "1";
  const showMore = params.more === "1";
  const weeklyAuditAvailable = isOwner && isWeeklyAuditDay();

  return (
    <div className="space-y-5">
      {isOwner ? (
        <OwnerToday
          historicalImport={historicalImport}
          missingPhoneCount={missingPhoneCount}
          salesIssues={salesIssues}
          salesStatuses={salesStatuses}
          stockOverview={stockOverview}
          taskSummary={taskSummary}
          updateSummary={updateSummary}
        />
      ) : (
        <ManagerToday
          salesStatuses={salesStatuses}
          stockOverview={stockOverview}
          stores={stores}
          taskSummary={taskSummary}
          updateSummary={updateSummary}
        />
      )}

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">More details</p>
        <h2 className="mt-2 text-2xl font-semibold">Load heavier sections only when needed</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Stock pulse, weekly audit, reviews, receivables, salary attendance detail and store lists are kept out of
          the first render so Today opens faster.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {!showStock ? (
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
              href={queryHref({ ...params, stock: "1" })}
            >
              Load Stock Pulse
            </Link>
          ) : null}
          {isOwner && !showAudit ? (
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
              href={queryHref({ ...params, audit: "1" })}
            >
              {weeklyAuditAvailable ? "Load Weekly Audit" : "Load Weekly Audit Anyway"}
            </Link>
          ) : null}
          {!showMore ? (
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
              href={queryHref({ ...params, more: "1" })}
            >
              Show More Details
            </Link>
          ) : null}
        </div>
      </section>

      {showStock ? <StockPulseSection stores={stores} /> : null}
      {isOwner && showAudit ? <WeeklyAuditSection stores={stores} /> : null}
      {showMore ? <MoreDetailsSection profileRole={profile?.role ?? "manager"} stores={stores} /> : null}
    </div>
  );
}

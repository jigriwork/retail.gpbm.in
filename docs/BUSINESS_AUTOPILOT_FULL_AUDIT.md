# Business Autopilot Full Audit

Date: 2026-06-11

Scope: audit-only review of Business Autopilot readiness, performance, reporting, correction tools, feature clutter, data growth, and first-build priorities. No code, schema, parser, RLS, payslip/salary calculation, feature visibility, or data changes were made.

## 1. Executive Summary

Overall app readiness for daily use: **6.5 / 10**.

Business autopilot readiness: **4 / 10**.

Performance risk rating: **High**.

Reporting readiness rating: **Medium-low**.

Data correction readiness rating: **Low**.

Feature clutter rating: **Medium-high**.

The app is useful and already covers daily uploads, store dashboards, staff sales, stock analytics, payslips, staff phones, reviews, tasks, manager updates, and AI Secretary. The main problem is that the owner-facing system is still assembled from many live dashboard sections instead of a crisp decision center. The owner can see pieces of the business, but cannot yet confidently correct bad uploads, bulk-load historical sales, search and drill into brands/items/sizes, or rely on precomputed summaries for speed.

Biggest blockers:

- Wrong sales uploads cannot be owner-deleted/replaced from the UI; duplicate protection blocks clean reupload.
- Bulk historical sales upload is explicitly blocked when multiple bill dates are detected.
- `/app/today`, `/app/stores/[storeId]`, stock analytics, and AI Secretary build too much from live raw-row aggregation.
- Brand/item/category/size reporting exists only as top lists and raw columns, not as searchable drilldown.
- Staff sales shows all matched names for a period, but lacks zero-sale staff, custom dates, brand/category filters, and drilldown.
- Stock dead/slow/fast logic is directional only; it does not use true age/purchase-date confidence strongly enough for buying decisions.
- Life Flow is owner-only, but it competes with business attention on Today and inside AI Secretary context.

What should be fixed first:

1. Owner-only Sales Data Correction Center plus bulk historical sales import.
2. Proper Reporting Dashboard with brand/category/staff/item/size filters and drilldown.
3. Performance Phase 1: indexes, summary tables, and simpler Today page.

## 2. Feature Inventory and Keep/Hide/Delete Recommendation

| Feature/module | Route | Purpose | Owner value | Manager value | Performance cost | Current status | Recommendation | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today page | `/app/today` | Main dashboard | High | Medium | Very high | Active | Rebuild | It loads too many live modules and should become a decision panel with lazy sections. |
| Stores | `/app/stores`, `/app/stores/[storeId]` | Store list/detail | High | High | High on detail | Active | Keep, simplify detail | Store detail repeats sales, stock, audit, review, update, task queries. |
| Reports | `/app/reports` | Upload/report hub | High | Medium | Medium | Active | Keep | Good central hub, but needs correction center entry. |
| Daily sales upload | `/app/reports/sales` | Upload daily sales | Critical | High | Medium | Active | Rebuild flow | Daily-only is correct for managers, but owner needs delete/replace and bulk mode. |
| Sales analytics | `/app/reports/sales/analytics` | Sales totals/rankings | High | Medium | High as rows grow | Active | Rebuild/reporting phase | Needs search/filter/drilldown and summarized data. |
| Staff sales | `/app/reports/staff` | Staff performance | High | Medium | Medium-high | Active | Rebuild/reporting phase | Shows all staff returned by aggregation, but lacks zero-sale staff, custom ranges, and filters. |
| Staff aliases | `/app/reports/staff-aliases` | Map sales names to contacts | High | Medium | Medium-high | Active | Keep, optimize | Useful, but currently scans up to 5000 sales rows for unmatched names. |
| Stock upload | `/app/reports/stock` | Monthly stock import | High | Medium | Medium | Active | Keep, add correction | Needs owner replace/delete similar to sales. |
| Stock analytics | `/app/reports/stock/analytics` | Dead/slow/fast stock | High | Low-medium | Very high | Active | Rebuild/optimize | Re-fetches and re-matches stock/sales data multiple times. |
| Salary attendance | `/app/reports/salary-attendance` | Monthly attendance upload | High | Medium | Low-medium | Active | Keep | Useful for salary workflow. Correction should be owner-only. |
| Payslip generation | `/app/payslips` | Salary sheet to PDFs | Critical | None | Medium | Owner-only active | Keep | Strong owner value; do not change calculations without separate salary audit. |
| Staff phone directory | `/app/employees` | Staff phones and contacts | High | Medium | Medium | Active | Keep | Required for WhatsApp payslips and aliases. |
| WhatsApp payslip sharing | Payslip row pages/components | Share salary PDFs/text | High | None | Low | Active | Keep | Useful owner workflow. |
| Sent tracking | Payslip components/tables | Track payslip sent state | Medium | None | Low | Active | Keep | Reduces confusion after salary generation. |
| Salary receivables | `/app/payslips/receivables` | Negative salary tracking | Medium-high | None | Medium | Active | Keep | Useful, but should stay owner-only. |
| Tasks | `/app/tasks` | Follow-up actions | High | High | Medium | Active | Keep | Important for autopilot if tied to alerts. |
| Manager updates | `/app/updates` | Store issue feed | High | High | Medium | Active | Keep | Good business signal. |
| Rack review | `/app/reviews/rack` | Daily merchandising review | Medium | High | Low | Active | Keep | Useful store discipline. |
| Cleaning review | `/app/reviews/cleaning` | Daily cleanliness review | Medium | High | Low | Active | Keep | Useful store discipline. |
| Daily checklist | `/app/checklist` | Daily operating checklist | High | High | Medium | Active | Keep | Autopilot input. |
| Weekly audit | `/app/audit`, `/app/audit/[storeId]` | Weekly store review | High | Medium | High | Active | Keep, snapshot | Should use persisted weekly summaries, not heavy live recompute. |
| AI Secretary | `/app/secretary` | Chat-based owner assistant | Medium-high | None/low | High per prompt | Active | Keep, optimize | Good concept, but context builder is heavy. |
| Life Flow | `/app/life` | Owner personal wake/gym/sports tracking | Low for business | None | Low-medium on Today/AI | Owner-only active | Hide from main workflow | Keep accessible under owner settings/personal area, remove from Today and business AI context unless asked. |
| Settings | `/app/settings` | App settings | Medium | Low | Low | Active | Keep | Needed for owner/admin. |
| Users/manager assignment | `/app/users` | Create users, assign stores | High | None | Low | Active owner-only | Keep, harden | Owner can create owner accounts; needs stronger guardrails/audit log. |
| Store targets | Store/settings actions | Monthly target | High | Low | Low | Active | Keep | Needed for autopilot decisions. |
| Firm mapping | Store/settings actions | Map firms/stores | Medium | Low | Low | Active | Keep | Useful if payslip/report files need firm identity. |

Life Flow recommendation: do not delete now. Hide it from the business-first Today page and remove it from default AI Secretary context. Keep it owner-only behind Settings or a personal link, because wake/gym/sports does not help staff accountability, sales correction, reporting, or stock decisions.

## 3. Performance Deep Audit

### `/app/today`

Queries/functions run:

- `getAccessibleStores`
- `getTaskSummary`
- `getStoreSalesStatuses`
- `getSalaryAttendanceOverview`
- `getStockOverview`
- `getReviewStatuses`
- `getTodayUpdateSummary`
- `getAccessibleChecklists`
- `getLatestStockMonth`
- `getSalesSummary` for yesterday
- `getSalesSummary` for current month
- `getStaffSalesSummary` for yesterday
- owner-only `getLifeFlowSummary`
- `getMissingEmployeePhoneCount`
- owner-only receivable months and summary
- `getStockSummary` after latest stock month
- weekly audit summaries on weekly audit day

Estimated rows loaded:

- Sales rows: all accessible-store rows for yesterday, all current-month rows, and yesterday rows again for staff.
- Stock rows: latest stock month for all stores, likely 25k rows per store/month.
- Sales movement rows for stock: 30-day sales rows for all stores.
- Plus checklists, reviews, tasks, updates, reports, receivables, life logs.

Slow suspects:

- `getSalesSummary` and `getStaffSalesSummary` aggregate raw `sales_rows` in memory.
- `getStockSummary` calls helpers that repeatedly fetch and aggregate stock/sales rows.
- `getStoreSalesStatuses` and similar status helpers run per-store report lookups.
- Weekly audit can add another layer of live rollups.

Quick wins:

- Remove Life Flow from Today.
- Lazy-load stock pulse, receivables, weekly audit, and review/history sections.
- Replace per-store status calls with one batched reports query.
- Use `reports.summary` for lightweight Today cards where exact drilldown is not needed.

Deep fixes:

- Add daily/monthly sales summary tables.
- Add stock item monthly summary table.
- Add cached owner decision summary refreshed after uploads.

### `/app/stores/[storeId]`

Queries/functions run:

- Store lookup from `stores`.
- Sales/salary/stock status helpers.
- Review status, update summary, checklist.
- `getSalesSummary` for yesterday, week, month.
- `getStaffSalesSummary` for week.
- Open task count.
- `getLatestStockMonth`, `getStockSummary`.
- `getStoreWeeklyAuditSummary`.

Estimated rows loaded:

- One store's sales rows for yesterday, week, month, and week again for staff.
- One store's latest stock month rows, plus sales movement rows.
- Weekly audit likely repeats sales/review/task/update/stock work.

N+1/repeated patterns:

- Sales rows are fetched multiple times for overlapping date ranges.
- Stock analytics is computed live inside the store page even though there is a full stock analytics route.

Quick wins:

- First viewport should show store identity, yesterday/month sales, missing uploads, and target only.
- Move stock analytics and weekly audit into lazy links/sections.

Deep fixes:

- Store KPI materialized summary keyed by store/date/month.

### `/app/reports/sales/analytics`

Queries/functions run:

- Accessible stores.
- `getSalesSummary` for selected period.
- `getMissingSalesReportDates`.
- `getSalesSummary` for current month for target progress.

Estimated rows loaded:

- All selected sales rows for date range.
- All current-month selected sales rows.
- Report rows for missing-date detection.

Missing indexes:

- Current schema has single-column indexes on `sales_rows.store_id`, `sale_date`, `staff_name`, `brand`, `category`.
- Needs compound indexes: `(store_id, sale_date)`, `(store_id, sale_date, brand)`, `(store_id, sale_date, category)`, `(store_id, sale_date, staff_name)`, and likely `(store_id, sale_date, barcode)` if item drilldown grows.

Quick wins:

- Add server-side filters for brand/category/item before aggregation.
- Limit daily trend display for long custom ranges or paginate it.

Deep fixes:

- Use SQL grouped aggregation or summary tables instead of loading raw rows into Node.

### `/app/reports/staff`

Queries/functions run:

- Accessible stores.
- `getStaffSalesSummary`, which fetches raw `sales_rows` and all active aliases for selected stores.

Estimated rows loaded:

- All selected sales rows for today/yesterday/week/month.

Current behavior:

- It does not intentionally limit to top 5; it returns all staff buckets found in sales rows.
- It excludes rows with blank staff names.
- It does not include active staff with zero sales.
- Period options are today/yesterday/week/month only; no custom date range.

Quick wins:

- Add custom date range, low-to-high sort, store filter, and search.
- Join employee contacts to include active zero-sale staff.

Deep fixes:

- Persist staff daily sales summaries.

### `/app/reports/stock/analytics`

Queries/functions run:

- Accessible stores.
- Latest stock month lookup.
- `getStockSummary`.
- Inside `getStockSummary`: `getStockItemSummary`, `getSlowStockCandidates`, `getDeadStockCandidates`, `getFastMovingLowStockCandidates`, `getHighStockLowSaleCandidates`.

Estimated rows loaded:

- Latest month `stock_rows`, potentially 25k rows per store/month.
- 7/15/30/60/90-day sales movement rows.
- The same stock/sales rows can be fetched and summarized multiple times in one request.

Slow suspects:

- Heavy in-memory matching by barcode/SKU/item/brand/size/color.
- Repeated fetches in candidate helpers.
- No pagination for top item/candidate computation before loading all rows.

Quick wins:

- Fetch stock rows and movement rows once.
- Reuse one summarized item array for top/fast/high-low.
- Only compute slow/dead when section is opened.

Deep fixes:

- Monthly stock item summary table with match-confidence fields.

### `/app/reports/staff-aliases`

Queries/functions run:

- Aliases for selected stores.
- Employee contacts for selected stores.
- `sales_rows` staff names and net sale limited to 5000 rows.

Risk:

- The 5000-row cap can miss unmatched names after historical import.
- It scans raw sales rows instead of using distinct staff names or a persisted unmatched table.

Quick wins:

- Query distinct staff names by store or summarize in SQL.
- Add date filters and "only unmatched active period".

### `/app/payslips`

Queries/functions run:

- Owner check.
- `getRecentPayslipBatches(12)`.
- Receivable months and latest month summary.

Risk:

- Medium. Not the biggest slow page, but generated payslip joins can grow.

Quick wins:

- Paginate batches.
- Cache receivable summaries by month.

### `/app/audit`

Likely slow suspects:

- Weekly audit summaries combine sales, missing reports, checklist, reviews, updates, tasks, and stock signals.
- If weekly summaries are computed live for all stores, this becomes a mini Today page plus stock analytics.

Recommendation:

- Generate weekly audit snapshots and show persisted records by default.

### AI Secretary context builder

`lib/secretary/context.ts` builds a large context with checklists, sales statuses, current-month sales, yesterday staff, salary overview, stock overview, task summary, updates, memories, latest stock month, owner Life Flow, stock pulse, optional weekly audit, and urgent updates.

Risk:

- High when prompted. It duplicates Today's expensive work and adds LLM latency after the database work.

Quick wins:

- Only include stock pulse, weekly audit, staff details, and Life Flow if the prompt asks.
- Use cached owner decision summary.

## 4. Sales Upload and Correction Audit

Current relationships:

- `reports` stores the upload record with `report_type = 'sales'`, `store_id`, `report_date`, `file_name`, `file_path`, `row_count`, and JSON `summary`.
- `sales_rows.report_id` references `reports.id` with `on delete cascade`.
- Storage file path is stored in `reports.file_path`.
- Sales upload auto-completes matching tasks after row insert.
- Staff alias unmatched names are computed at upload time and shown in summary.
- Analytics reads `sales_rows`, while recent cards and status use `reports.summary`.

Current correction support:

- `repairSalesReportTotals` is owner-only and deletes only imported footer/total rows from `sales_rows`.
- It recalculates `reports.row_count` and `reports.summary`.
- It does not delete or replace an entire wrong report.
- Duplicate protection blocks any second report for same `store_id` and `report_date`.

Required delete/replace workflow:

- Owner-only page/action in a Data Correction Center.
- Preview report before action: store, date, file name, row count, total sale, bill count, uploaded by, created time, top brands/categories, unmatched staff count, file path.
- Confirmation phrase such as `DELETE SALES YYYY-MM-DD STORECODE`.
- Delete child `sales_rows` first or delete `reports` with cascade, but explicitly deleting child rows first is clearer for logging.
- Delete `reports` row.
- Remove storage file from `reports` bucket if possible; if storage deletion fails, record warning.
- Reopen or mark sales upload checklist/task as missing for that store/date. Current task auto-completion has no inverse path.
- Allow reupload after delete.
- Add audit log for sensitive action.

Replace should be safer than delete:

- Preview old report and new parsed file side-by-side.
- In one server action/transaction where possible: validate owner, parse new file, check same store/date, delete old rows/report/file, insert new report/rows, recompute summary, revalidate paths.
- If transaction across storage is not possible, do database work carefully and log storage cleanup failure.

## 5. Bulk Past Sales Upload Audit

Owner request: upload one sales report from April 1, 2026 to today and populate historical sales.

Current support:

- Parser captures `BILL DATE` into `saleDate`.
- `uploadSalesReport` detects all parsed dates and blocks files with more than one bill date.
- Duplicate protection is one report per store/date in `reports`.
- Rows are inserted under one `report_id` for daily upload.
- Staff alias mapping can work across dates because aliases are store/source-name based.
- Returns are represented by negative quantity or net sale.
- Footer rows are skipped by parser and repair can remove imported total rows.
- Store validation checks rows with store column against selected store.

Safest design: **Option A - bulk upload creates multiple daily report records, one per bill date.**

Why Option A:

- It preserves existing daily reporting semantics.
- Missing-report detection continues to work.
- Duplicate checks remain per store/date.
- Existing analytics already uses `sales_rows.sale_date`.
- Managers can stay daily-only while owner gets bulk mode.

Recommended flow:

1. Owner-only Bulk Historical Sales Upload route under Reports or Correction Center.
2. Parse file and detect all `BILL DATE` values.
3. Group rows by date after footer filtering.
4. Validate store column for all rows.
5. For each date, check existing `reports` where `report_type = sales`, `store_id`, `report_date`.
6. Owner chooses duplicate behavior: skip existing dates, replace existing dates, or stop if duplicates.
7. Insert one `reports` row per bill date.
8. Insert grouped `sales_rows` with the corresponding daily `report_id`.
9. Store one original bulk file in storage once, or store per-date logical report rows that reference a bulk batch file path.
10. Show summary: dates imported, dates skipped, duplicated dates, total rows, total sale, unique staff, unmatched staff, returns, skipped footer rows.

Optional future model:

- Add `sales_upload_batches` for bulk metadata, with daily `reports` rows linked to the batch. This is best long-term, but daily `reports` rows are still needed.

Manager policy:

- Managers should remain daily-only.
- Bulk historical upload should be owner-only until duplicate handling and replace safety are proven.

## 6. Reporting Gaps Audit

| Requirement | Supported now? | Route | Data available? | Missing piece | Performance risk | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| Search brand | Partial | Sales/stock analytics top lists | Yes, `brand` | Search box/filter/drilldown | Medium | Add brand filter and Brand Performance page. |
| Search item | Partial | Top items only | Yes, `item_name`, sku/barcode | Search/detail page | High | Add indexed item search and detail page. |
| Category filter | No real filter | Analytics pages | Yes | Filter param/UI | Medium | Add category filter. |
| Brand filter | No real filter | Analytics pages | Yes | Filter param/UI | Medium | Add brand filter. |
| Size-wise stock quantity | Data exists if parsed | Stock rows | `size` column | UI/grouping | Medium | Add size breakdown by brand/item/category. |
| Size-wise sales quantity | Data exists if sales file has size | Sales rows | `size` column | UI/grouping, parser confidence | Medium | Add only when size column exists; avoid unsafe inference by default. |
| Item details | No | None | Yes, partial | Item Detail page | High | Build item page keyed by barcode/SKU, fallback item+brand. |
| Staff-wise monthly sales | Yes, basic | `/app/reports/staff` | Yes | Custom dates, zero-sale staff | Medium | Expand staff page. |
| Lowest performing staff | Partial by reverse sort manually absent | Staff page | Yes | Explicit low performer section | Medium | Add low-to-high and zero-sale staff. |
| Highest performing staff | Yes | Staff page/top lists | Yes | Drilldown | Medium | Add staff detail. |
| Lowest performing brand | No | Analytics | Yes | Low ranking and filters | Medium | Add low brand table. |
| Highest performing brand | Partial | Sales/stock analytics | Yes | Search/drilldown | Medium | Add brand page. |
| Lowest category | No | Analytics | Yes | Low ranking | Medium | Add category performance. |
| Highest category | Partial | Analytics | Yes | Drilldown | Medium | Add category page. |
| Return amount | Partial | Staff page total returns; upload count | Yes via negative rows | Consistent all reports | Medium | Add returns KPI everywhere. |
| Target achievement | Partial | Store/sales analytics | Stores target | Forecast and all-store dashboard | Low | Add projected month-end and required run-rate. |
| Missing sales days | Yes | Sales analytics/Today | Reports rows | Full date range UI | Low-medium | Keep, improve display. |
| Dead/slow/fast explanation | Partial | Stock analytics | Partial | Confidence, age, match explanation | High | Add confidence labels and age thresholds. |

## 7. Size-wise Quantity Audit

Stock:

- `stock_rows` has `size`.
- `stock-parser.ts` captures `size` from aliases including `size`, `pack / size`, and `pack size`.
- `stock-actions.ts` persists `size`.
- Stock analytics item identity includes size and color for strong matching.

Sales:

- `sales_rows` has `size`.
- `sales-parser.ts` captures `size` from a `size` header.
- `sales-actions.ts` persists `size`.
- Current sales analytics does not select `size`, so it cannot report size-wise quantity today.

Can the app show size-wise stock quantity?

- Yes, with current data if the stock file has size.

Can the app show size-wise sold quantity?

- Yes only when the sales report has a real size column or reliable barcode/SKU mapping to stock size.

Can size be inferred from item name?

- Technically sometimes, but it is risky. Product names may contain numbers that are not sizes, abbreviated pack sizes, style numbers, or kids/adult sizing. Inference should not be treated as business truth.

Recommended design:

- Use explicit `size` columns first.
- If sales size is missing but barcode/SKU matches a stock row with one size, infer with `confidence = matched_by_barcode_or_sku`.
- If only item name parsing is possible, label as `low confidence` and keep it out of default totals unless owner opts in.

## 8. Brand Search and Item Detail Audit

Current support:

- Sales analytics counts brands and shows top brands, but no brand search/filter.
- Stock analytics shows top stock brands, but no brand search/filter.
- Brand names are not normalized into a master table.
- Spelling differences are not handled except by exact cleaned display grouping in memory.
- No brand detail page exists.
- No item detail page exists.

Owner desired drilldown:

- Brand -> total sale, stock quantity, staff who sold, categories, items, sizes, returns, slow/dead/fast stock.
- Item -> stock, sales, staff, movement, returns, size/color if available.

Recommended build:

- `/app/reports/brands` or `/app/reports/sales/brands`: Brand Performance page.
- `/app/reports/categories`: Category Performance page.
- `/app/reports/items/[key]`: Item Detail page.
- Search box across brand/item/category.
- Later: brand master mapping table with normalized aliases.

## 9. Staff Sales Reporting Audit

Current `/app/reports/staff`:

- Shows all staff buckets returned by `getStaffSalesSummary`; no top 5/6 limit in this page.
- Today page shows only top staff yesterday (`yesterdayStaffPulse[0]`).
- Staff page does not paginate.
- Supports today, yesterday, week, month.
- Does not support custom date range.
- Supports store filter.
- Does not support category/brand filter.
- Does not show active staff with zero sales.
- Shows return amount per staff using negative sales rows.
- Shows source breakdown when aliases combine multiple source names.
- Does not directly show low performers except by reading the sorted table manually.
- Manager access is restricted to assigned stores via accessible stores/RLS.

Recommended fixes:

- Add custom date range.
- Add brand/category/item filters.
- Add low-to-high sort and zero-sale active staff by joining `employee_contacts`.
- Add staff detail page with daily trend, bills, categories, brands, returns, source names.
- Add pagination/search before historical data grows.
- Add target/expected sale per staff later if owner defines staff targets.

## 10. Stock Reporting and Dead/Fast Logic Audit

Current logic:

- Stock rows and sales rows are matched by barcode, SKU, strong item+brand+size+color, brand+item, then weak item-only fallback.
- Slow stock: positive stock and sales quantity <= max(stock * 5%, 1) over slow threshold window.
- Dead stock: positive stock and zero sales over dead threshold window.
- Fast low stock: sold >= 3 and stock <= max(sales * 0.5, 2).
- High stock low sale: stock >= 10 and sales <= max(stock * 5%, 1).

Risks:

- Purchase date and `ageing_days` exist in schema/parser but are not central to dead/slow decisions.
- Dead stock can be labeled dead even if it is newly received but has no recent sale.
- Weak item-name matching can produce false movement.
- Brand/category filters are missing.
- No item search or size-wise stock page.

Recommended:

- Add confidence labels everywhere: barcode/SKU strong, item+brand medium, item-only weak.
- Add "strong match only" toggle.
- Dead stock should require age threshold or first-seen stock age, not only no sale.
- Add brand/category/item/size filters.
- Add stock ageing report using purchase date or imported ageing days.

## 11. Target and Autopilot Decision Audit

Needed for real autopilot:

- Daily sales uploaded/missing by store.
- Daily target vs achieved.
- Month target vs achieved.
- Projected month-end sales.
- Staff ranking plus weak/zero-sale staff.
- Brand/category winners and losers.
- Dead/slow stock with confidence.
- Fast-moving low-stock alerts.
- Return amount alerts.
- Manager issue alerts.
- Pending/overdue tasks.
- Missed checklists/reviews.
- Salary receivables.
- AI Secretary daily summary generated from cached facts.

Recommended owner dashboard:

- Today decision panel.
- What needs attention.
- What improved.
- What dropped.
- Who performed.
- What stock action is needed.
- What manager action is needed.
- Missing data warnings before conclusions.

Current gap:

- The app has many ingredients, but no single ranked decision queue.

## 12. Data Deletion / Cleanup / Correction Center Audit

| Tool | Owner only? | Manager allowed? | Delete style | Confirmation | Data affected | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| Delete/replace sales report | Yes | No | Hard delete rows/report, remove storage | Strong phrase | `sales_rows`, `reports`, storage, tasks/checklists | High |
| Delete/replace stock report | Yes | No | Hard delete rows/report, remove storage | Strong phrase | `stock_rows`, `reports`, storage | High |
| Delete/replace salary attendance report | Yes | No | Prefer soft void first | Strong phrase | `reports`, salary attendance summaries if any | High |
| Void payslip batch | Yes | No | Soft void preferred | Strong phrase | payslip batches/rows/generated files/sent state | Very high |
| Deactivate staff | Owner yes, manager maybe assigned store | Assigned managers can maintain contacts if allowed | Soft deactivate | Normal confirm | `employee_contacts`, aliases | Medium |
| Deactivate aliases | Owner/assigned manager | Yes for assigned store | Soft deactivate | Normal confirm | `staff_name_aliases` | Medium |
| Delete test data | Owner only | No | Hard delete via scoped tool | Strong phrase | Many tables | Very high |
| Repair totals | Owner only | No | Hard delete footer rows | Existing button | `sales_rows`, `reports.summary` | Medium |
| Storage cleanup | Owner only | No | Remove orphan files | Preview | storage objects | Medium |

Phased Data Correction Center:

- Phase 1: sales report delete/replace and bulk sales import.
- Phase 2: stock report delete/replace.
- Phase 3: salary attendance correction and payslip batch void.
- Phase 4: orphan storage cleanup and audit logs.

## 13. Security and Role Audit

Findings:

- Owner and manager roles are enforced through `profiles.role`, RLS, and server-side checks.
- Managers can upload assigned store sales/stock because migrations added insert policies.
- Managers are restricted to assigned stores through `getAccessibleStores`, `canAccessStore`, and RLS.
- Payslips are owner-only in page checks.
- Staff aliases can be saved by owner or assigned manager.
- Staff phones are available to assigned store managers.
- Owner can create another owner through `createUserAccount`; this is powerful and should require explicit confirmation/audit logging.
- Profile activation/deactivation exists for managers, but password reset is missing.
- No general audit log table exists for sensitive actions.

Recommendations:

- Add `audit_logs` before delete/replace and owner creation workflows.
- Add password reset/invite workflow.
- Require extra confirmation for creating owner accounts.
- Consider preventing owner deactivation/removal unless there is more than one active owner and the current owner confirms.

## 14. Data Growth and Architecture Audit

Growth risks:

- `sales_rows` grows daily and bulk historical upload can add months at once.
- `stock_rows` can be around 25k rows per store/month. With two or three stores, six months can become hundreds of thousands of stock rows.
- `reports.summary` is useful for cards but not enough for drilldown.
- Current single-column indexes are not enough for common filtered analytics.

What will slow after six months:

- Month/custom sales analytics over raw rows.
- Staff aliases unmatched scan.
- Stock analytics and store detail stock pulse.
- AI Secretary context builder.
- Weekly audit live generation.

Needed:

- Compound indexes for sales and stock query shapes.
- Pagination for staff/items/brands.
- Lazy loading dashboard sections.
- Summary tables:
  - `daily_store_sales_summary`
  - `daily_staff_sales_summary`
  - `daily_brand_sales_summary`
  - `daily_category_sales_summary`
  - `monthly_stock_item_summary`
  - `owner_daily_decision_summary`

## 15. Roadmap

### A. Emergency fixes

1. Sales delete/replace.
   - Reason: wrong upload blocks reupload.
   - Business value: very high.
   - Risk: high.
   - Complexity: medium.
   - Dependencies: audit log design, storage cleanup handling.
2. Bulk historical sales upload.
   - Reason: owner needs April 1, 2026 to current history.
   - Business value: very high.
   - Risk: high.
   - Complexity: high.
   - Dependencies: delete/replace duplicate behavior.
3. Today page simplification.
   - Reason: owner reports dead-slow deploy experience.
   - Business value: high.
   - Risk: medium.
   - Complexity: medium.
   - Dependencies: decide lazy sections.

### B. Must build next for daily use

- Daily sales upload clarity: daily manager mode vs owner correction/bulk mode.
- Missing report calendar.
- Upload preview before commit.
- Correction Center entry from Reports.

### C. Reporting Phase 1

- Brand search/filter.
- Category filter.
- Item search/detail.
- Size-wise stock quantity.
- Staff monthly/custom date reporting with zero-sale staff.
- Lowest/highest brand/category/staff tables.

### D. Performance Phase 1

- Compound indexes.
- Batch status queries.
- Fetch stock/sales rows once in stock summary.
- Lazy load heavy Today/Store sections.
- Use summary cards for first viewport.

### E. Data Correction Phase 1

- Sales report delete.
- Sales report replace.
- Reopen upload checklist/task state.
- Storage file cleanup.
- Audit log.

### F. Autopilot Phase 1

- Owner decision panel.
- Missing data first.
- Target projection.
- Weak staff and zero-sale staff.
- Returns alert.
- Fast-moving low-stock alert.
- Manager issue queue.

### G. Can wait

- Brand master mapping.
- Advanced demand forecasting.
- Staff individual targets.
- Full product master.
- Automated reorder suggestions beyond low-stock candidates.

### H. Remove/hide candidates

- Hide Life Flow from business Today and default Secretary context.
- Keep owner-only Life Flow accessible from personal/settings area.
- Do not delete Life Flow until owner confirms it has no personal value.

## 16. Recommended First Build After Audit

1. **Sales Data Correction + Bulk Historical Upload**
   - This removes the biggest operational blocker: wrong upload cannot be fixed and history cannot be loaded.
2. **Proper Reporting Dashboard with brand/category/staff/item/size filters**
   - This gives the owner searchable business truth instead of scattered top lists.
3. **Performance indexes + Today page simplification**
   - This addresses deploy slowness and prevents bulk historical data from making the app feel worse.

## 17. Verification

Required commands to run after creating this audit:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `git status`
- `git log --oneline -20`

Expected git action:

- Commit audit doc only with message `add business autopilot full audit`.
- Do not push.


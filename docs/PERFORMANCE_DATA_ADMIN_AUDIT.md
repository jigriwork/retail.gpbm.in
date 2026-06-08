# Performance, Data Growth, Admin Controls, and Monthly Sales Workflow Audit

Date: 2026-06-08

Scope: audit-only review of performance risks, data growth, admin controls, delete/replace needs, storage, indexes, AI Secretary, and push readiness. No code or schema changes were made for this audit.

## Executive Summary

Overall performance risk: Medium-high.

The app is functional, but several dashboard-style pages now do too much live aggregation on request. It is fine for current small data, but it can feel slow on Vercel/Supabase once daily sales, monthly stock, payslips, and reviews accumulate.

Overall data growth risk: Medium.

The highest-growth tables will be `stock_rows` and `sales_rows`. The tested Go Planet stock file alone inserted about 25k item rows for one store/month. Daily sales is smaller per day, but grows continuously. Current indexes cover basic single-column filtering, but several common compound query shapes are missing.

Admin controls risk: Medium-high.

Owner can create managers, assign stores, and activate/deactivate profiles. Owner cannot reset manager passwords, edit manager profile details fully, or safely delete/replace wrong uploads from the UI.

Push readiness: Safe to push from a correctness perspective after the latest sales/stock work, but performance hardening should be the next build before heavy daily use.

## 1. Live Performance Risk Audit

### Highest Risk Pages

#### `/app/today`

Risk: High.

Why:

- Loads many independent modules in one page.
- Runs checklist/status/reports/reviews/tasks/updates/sales/stock/life/receivables calls.
- Calls `getSalesSummary` twice, `getStaffSalesSummary` once, and stock summary after `getLatestStockMonth`.
- Owner path adds receivable month scan and receivable summary.
- Weekly audit can add heavy live audit queries on Mondays.
- Stock pulse uses `getStockSummary`, which repeatedly fetches and aggregates stock/sales rows.

Likely symptom: dashboard feels stuck, especially for owner.

Recommended:

- Split Today into lazy sections or route-level cards.
- Defer stock pulse, weekly audit, receivables, and AI-adjacent summaries.
- Cache or persist daily/monthly summary rows.
- Replace per-store status N+1 calls with batch queries.

#### `/app/stores/[storeId]`

Risk: High.

Why:

- Loads sales statuses, salary statuses, stock statuses, reviews, update summary, checklist, yesterday/week/month sales, week staff, tasks count.
- Then sequentially loads latest stock month, full stock analytics, and previous-week audit.
- Weekly audit includes sales, staff, missing sales, reviews, updates, tasks, stock signals.
- This page duplicates many expensive Today/analytics operations for one store.

Recommended:

- Make store detail lightweight first viewport.
- Move weekly audit and stock analytics to separate lazy route sections.
- Use persisted weekly audit snapshots instead of live recomputing.

#### `/app/reports/stock/analytics`

Risk: High.

Why:

- `getStockSummary` fetches full stock rows and sales movement rows.
- It calls `getStockItemSummary`, then calls slow/dead/fast/high candidate helpers; several helpers fetch the same stock and sales rows again.
- For a single Go Planet month, one stock file is about 25k rows. Two stores can be 50k+ rows per month.
- Matching is in memory using barcode/SKU/item fallback.

Recommended:

- Fetch stock rows and sales rows once per request.
- Precompute monthly stock item summaries.
- Add compound indexes for stock month/store and sales store/date.
- Consider materialized/reporting tables for stock movement.

#### `/app/reports/sales/analytics`

Risk: Medium-high.

Why:

- Loads selected period summary, missing report dates, and current month summary in parallel.
- `getSalesSummary` reads all sales rows for selected stores/date range and aggregates in memory.
- It now joins alias data separately for mapped staff reporting.
- Fine for 30 days; heavier for custom 90/365 days.

Recommended:

- Add a date-range guard for custom periods or paginate/detail-load.
- Persist daily store summary and daily staff summary.
- Add compound sales indexes.

#### `/app/reports/staff`

Risk: Medium.

Why:

- Reads all sales rows for selected period and groups by mapped staff.
- Month filter is supported.
- Cost grows with date range and stores.

Recommended:

- Keep default period as yesterday.
- Add daily/monthly staff summary table before 1-year use.

#### `/app/reports/staff-aliases`

Risk: Medium.

Why:

- Loads aliases, contacts, and up to 5,000 `sales_rows` to derive unmatched names.
- This cap avoids runaway load but can miss older unmatched names.

Recommended:

- Add an `unmatched_staff_sources` table or persist unmatched names during upload.
- Paginate aliases and contacts if staff grows.

#### `/app/payslips`

Risk: Medium.

Why:

- Recent batches are limited, but `getRecentPayslipBatches` joins `generated_payslips(sent_status)` for each batch.
- Receivable months query reads all `salary_receivables.salary_month` and all `payslip_batches.salary_month`.

Recommended:

- Use distinct month RPC/view or limit recent months.
- Keep recent batches paginated.

#### `/app/payslips/[batchId]`

Risk: Medium.

Why:

- Loads all rows in a batch with all generated payslip rows.
- Fine for typical staff count; can get heavy if one salary sheet is large.

Recommended:

- Add pagination/filter server-side by sent status if staff count grows.

#### `/app/payslips/receivables`

Risk: Medium.

Why:

- Loads filtered rows and unfiltered month rows separately.
- All-month summary is computed server-side in memory.
- Month/status/store compound indexes exist, which helps.

Recommended:

- Replace unfiltered row fetch with aggregate query/RPC when row count grows.

#### `/app/employees`

Risk: Low-medium.

Why:

- Loads all contacts for selected store/all accessible stores and filters in memory.
- Fine for hundreds of staff, not thousands.

Recommended:

- Add query-level search and pagination later.

#### AI Secretary

Risk: Medium-high on prompt, low on page load.

Why:

- Today page does not call AI automatically. Good.
- Secretary page loads only 20 chats and 8 memories. Good.
- Sending a prompt builds live context with many heavy summaries, including monthly sales, staff yesterday, stock summary, statuses, checklist, and optional weekly audit.

Recommended:

- Keep context compact.
- Use persisted summary snapshots for monthly sales/stock/weekly audit.
- Avoid full stock analytics in AI context.

### N+1 / Repeated Query Patterns

- `getStoreSalesStatuses(stores)` queries recent reports per store and may query yesterday per store.
- `getStoreStockStatuses(stores)` queries recent reports per store and may query current month per store.
- `getStoreSalaryAttendanceStatuses(stores)` repeats the same pattern.
- `getReviewStatuses(stores)` runs four review queries per store.
- `getAccessibleChecklists(stores)` calls many per-store helpers.
- `getTaskSummary` fetches all tasks then filters in memory.
- `getStockSummary` repeatedly fetches the same stock/sales rows inside helper calls.

### Missing Pagination / Lazy Loading

Needs pagination soon:

- Tasks list
- Manager updates list
- Employee directory
- Staff aliases
- Payslip batch rows
- Receivables
- Sales/stock analytics drilldowns

Should lazy-load:

- Today stock pulse
- Today receivables
- Today weekly audit
- Store detail weekly audit
- Store detail stock analytics
- AI Secretary context-heavy sections

## 2. Data Growth Audit

Assumptions:

- Active stores: 2.
- Daily sales rows: tested file had 165 rows for one store/day. Approx 150-250 rows/store/day.
- Stock rows: tested file had about 25k rows for one store/month.
- Payslip rows: likely 50-150 rows/month.

| Table | Expected Monthly Growth | 1-Year Estimate | Risk | Current Indexes | Recommendation |
| --- | ---: | ---: | --- | --- | --- |
| `sales_rows` | 9k-15k rows for 2 stores | 108k-180k | High | store, sale_date, staff, brand, category | Add `(store_id, sale_date)`, `(store_id, sale_date, staff_name)`, `(store_id, bill_no)`. Keep forever but use summaries for analytics. |
| `reports` | 60 sales + 2 stock + 2 salary attendance/month | <1k | Low | store, type, report_date, period_month | Add `(report_type, store_id, report_date)` and `(report_type, store_id, period_month)` unique/regular indexes. Keep forever. |
| `stock_rows` | ~50k/month for 2 stores | ~600k | High | store, stock_month, brand, category | Add `(store_id, stock_month)`, `(store_id, stock_month, sku)`, `(store_id, stock_month, barcode)`, item/search strategy. Keep recent raw forever if storage ok; add archive views. |
| `payslip_batches` | 1-3/month | <50 | Low | uploaded_by, salary_month, status | Fine. Keep forever. |
| `payslip_rows` | 50-150/month | 600-1.8k | Low | batch, store, month, status, staff | Fine. Keep forever. |
| `generated_payslips` | 50-150/month | 600-1.8k | Low-medium | batch, row, store, month, sent status, sent at | Fine. Storage growth matters more. Keep forever. |
| `salary_receivables` | usually small | low | Low | month, store, status, month+store, month+status | Fine. Keep forever. |
| `employee_contacts` | stable staff count | low | Low | store, normalized_staff_name, whatsapp | Fine. Soft deactivate. |
| `staff_name_aliases` | tens/month initially | low | Low | store, source name, source type, active | Add compound `(store_id, source_type, normalized_source_name)` if not covered by unique constraint. Keep forever with inactive flag. |
| `tasks` | 100-500/month | 1.2k-6k | Medium | store, due_date, status | Add `(store_id, status, due_date)`, `(assigned_to, status, due_date)`. Archive completed old tasks later. |
| `manager_updates` | 60-300/month | 720-3.6k | Medium | store | Add `(store_id, status, created_at)`, `(store_id, urgency, status)`. Keep, but paginate. |
| `rack_reviews` | ~60/month | ~720 | Low | `(store_id, review_date)` | Fine. Keep. |
| `cleaning_reviews` | ~60/month | ~720 | Low | `(store_id, review_date)` | Fine. Keep. |
| `life_logs` | ~30/month owner only | ~365 | Low | `(user_id, log_date)` | Fine. Private owner data. |
| `ai_chats` | variable | medium | Medium | none observed | Add `(user_id, created_at)`. Consider retention/export. |
| `ai_memories` | low | low | Low | none observed | Add `(user_id, is_active, importance)`. Keep active/inactive. |
| `weekly_audits` | 8/month if snapshots built | low | Low | none observed | Add `(store_id, week_start)`. Currently live audit does not use table. |

## 3. 30-Day Sales Workflow Audit

Works now:

- Daily sales upload saves date-wise `reports.report_date`.
- Real sales parser auto-detects single `BILL DATE`.
- Duplicate protection blocks same store/date sales report.
- 30 days of daily reports stay saved in `reports` and `sales_rows`.
- Monthly sales total can be calculated through `getSalesSummary(currentMonthRange())`.
- Returns reduce totals because negative quantity/net amount rows are preserved.
- Distinct bill count is used in sales summary and staff sales.
- Sales analytics supports today/yesterday/week/month/custom.
- Staff sales supports today/yesterday/week/month.
- Category/brand sales supports selected period through sales analytics.

Partial:

- Monthly target exists on `stores.monthly_target_enabled/monthly_target`.
- Sales analytics shows target progress only when one store is selected.
- Store detail shows monthly target progress for one store.
- Today page shows this-month sales per store, but not explicit target progress/balance.

Missing:

- Dedicated monthly sales target dashboard.
- Missing-day impact on target forecast.
- Daily required run-rate by store on Today page.
- Target progress cards for all stores at once.
- Persisted monthly sales summary table.

Recommended next target-progress build:

1. Add a compact current-month target card to Today per store.
2. Add monthly target dashboard with uploaded-days count, missing-days list, month sale, target, balance, required daily sale.
3. Add daily/monthly summary table to avoid scanning all `sales_rows`.

## 4. Staff Sales Alias Workflow Audit

Works now:

- `sales_rows.staff_name` keeps original `AGENT NAME`.
- `staff_name_aliases` maps source names to canonical staff/contact.
- Multiple source names can map to one staff.
- Staff analytics groups mapped names.
- Source-name breakdown appears when multiple source names roll up.
- Unmatched names are visible on `/app/reports/staff-aliases`.
- Owner can map all active stores.
- Manager maps only assigned active stores via server action and RLS.
- Future uploads reuse aliases for unmatched-count checks and analytics grouping.
- No incentive logic was added.

UX gaps:

- Unmatched staff names do not appear on Today.
- Upload success links to alias page only if names are unmatched, which is good, but it does not pre-filter by store.
- Alias page derives unmatched names from latest 5,000 sales rows, not a persisted unmatched table.
- Managers may need a simple “Resolve all unmatched for my store” workflow after nightly upload.

Recommended:

- Persist unmatched source names during upload.
- Add Today alert: “X unmatched sales staff names.”
- Link upload result to `/app/reports/staff-aliases?storeId=...`.

## 5. Admin User Controls Audit

Current `/app/users` capabilities:

- Owner-only access.
- Create manager if `SUPABASE_SERVICE_ROLE_KEY` is configured.
- Assign manager to one store quickly.
- Edit manager store assignments for GP/BM active stores.
- Activate/deactivate manager profile.

Missing:

- Owner cannot reset manager password.
- Owner cannot update manager email/name/phone/role fully from UI.
- Owner cannot trigger Supabase password recovery email.
- Owner cannot delete auth users from UI.

Service role status:

- `createAdminClient()` exists and uses `SUPABASE_SERVICE_ROLE_KEY`.
- Manager creation already depends on service role, so safe owner-only password reset can use the same server-only path.

Safest password reset recommendation:

- Add owner-only “Set temporary password” action using `admin.auth.admin.updateUserById(userId, { password })`.
- Require owner confirmation and show password once.
- Also support “Send password reset email” if SMTP/Auth settings are configured.
- Log reset metadata in an audit table later.

Recommended user controls:

- Reset manager password.
- Update manager full name/phone.
- Deactivate/reactivate manager.
- Update assigned stores.
- Avoid hard delete auth users by default.
- Hard delete only through a later danger-zone flow with confirmation and audit log.

## 6. Safe Delete / Wrong Upload Correction Audit

Current delete/replace support:

| Area | Delete Available | Replace Available | Affected Data | Recommendation |
| --- | --- | --- | --- | --- |
| Daily sales report | No | No, duplicate blocked | `reports`, `sales_rows`, reports storage file | Owner-only correction center with preview and delete/re-upload. |
| Monthly stock report | No | No, duplicate blocked | `reports`, `stock_rows`, reports storage file | Owner-only correction center; large row count preview. |
| Salary attendance report | No | No, duplicate blocked | `reports`, reports storage file | Owner-only delete/replace; safer than salary history. |
| Payslip batch | No UI | No | `payslip_batches`, `payslip_rows`, generated PDFs, receivables | Dangerous. Do not casually delete. Add owner-only void/archive first. |
| Generated payslips | Per-row regeneration deletes old generated row internally | Partial | `generated_payslips`, payslips storage | Existing regeneration can orphan old storage if not removed. Audit cleanup later. |
| Salary receivables | No delete UI | Sync/update only | `salary_receivables` | Do not delete casually; use statuses/notes. |
| Staff aliases | No delete UI | Upsert/edit active flag | `staff_name_aliases` | Good: use inactive flag. |
| Employee contacts | Toggle active | Edit/update | `employee_contacts` | Good: soft deactivate. |
| Tasks | Cancel/done/reopen | Edit available through task form | `tasks` | Good enough; no hard delete needed. |
| Updates | Status update/cancel | Edit/update | `manager_updates`, photos | Good enough; no hard delete needed. |
| Reviews | Update same store/date | Replace photo path only | reviews, photo storage | Good enough, but old photo cleanup may be needed. |

Recommended Data Correction Center:

- Owner-only route.
- Select module: sales, stock, salary attendance, payslip batch.
- Show store, date/month, file name, uploaded by, uploaded at, row count, storage path.
- Show affected child row counts.
- Require confirmation phrase such as `DELETE SALES 2026-06-07 GP`.
- Prefer soft-delete/status `voided` where possible.
- Hard delete only for wrong uploads before business approval.
- Remove storage files when hard deleting reports.
- Never delete salary history casually; void/archive with notes.

## 7. Storage/File Audit

Buckets:

- `reports`: private. Used for sales, stock, salary attendance uploads.
- `payslips`: private. Owner-only policy.
- `review-photos`: private. Used for review/update photos.

Risks:

- Wrong upload files remain unless insert fails before report creation.
- No replacement flow means duplicate uploads are blocked, but wrong files cannot be cleaned from UI.
- Generated payslip regeneration deletes old generated DB rows but may leave old PDF files unless storage cleanup is handled.
- Review/update photo replacement stores new path; old photo cleanup is not clearly handled.

Growth:

- Sales files are small.
- Stock files can be several MB/month/store.
- Payslip PDFs accumulate monthly.
- Review/update photos can grow unpredictably.

Recommendations:

- Add storage file cleanup to Data Correction Center.
- Add owner-only orphan report file scan later.
- Keep buckets private.
- Track file size in report summary going forward.

## 8. Supabase Indexes and RLS Audit

RLS status:

- Core tables have RLS.
- Manager access is store-assignment based for reports/rows/tasks/updates/reviews.
- Payslip and salary receivable data remain owner-only.
- Staff aliases have owner all and manager assigned active-store select/insert/update, no manager delete.

Missing or recommended indexes:

- `sales_rows(store_id, sale_date)` for analytics.
- `sales_rows(store_id, sale_date, staff_name)` for staff period views.
- `sales_rows(store_id, sale_date, bill_no)` or `(store_id, bill_no)` for distinct bill patterns.
- `reports(report_type, store_id, report_date)` for sales duplicate/status.
- `reports(report_type, store_id, period_month)` for stock/salary duplicate/status.
- `stock_rows(store_id, stock_month)` for stock analytics.
- `stock_rows(store_id, stock_month, sku)`.
- `stock_rows(store_id, stock_month, barcode)`.
- `stock_rows(store_id, stock_month, brand/category)` if category dashboards grow.
- `tasks(store_id, status, due_date)`.
- `tasks(assigned_to, status, due_date)`.
- `manager_updates(store_id, status, created_at)`.
- `manager_updates(store_id, urgency, status)`.
- `ai_chats(user_id, created_at)`.
- `ai_memories(user_id, is_active, importance)`.
- `weekly_audits(store_id, week_start)` before using snapshots.

Existing good indexes:

- Single-column report/store/date/month indexes.
- Review `(store_id, review_date)`.
- Salary receivables compound month+store and month+status.
- Payslip batch/row/generated indexes.
- Employee contact store and normalized name indexes.
- Staff alias source indexes and unique store/source/source_type constraint.

## 9. AI Secretary Performance Audit

What works:

- Today page does not call Gemini automatically.
- AI Secretary page loads limited chat history and memories.
- Context is capped before sending to Gemini.

Risks:

- Prompt submission builds live business context every time.
- Context builder calls monthly sales, yesterday staff, statuses, checklist, stock summary, and optional weekly audit.
- Stock summary is too expensive to include live once stock data grows.

Recommendations:

- Use summarized monthly/store snapshots.
- Do not include raw sales/stock rows.
- Defer weekly audit unless explicitly requested; current logic already does this except Mondays.
- Add timeout/fallback around context sections so one slow section does not block AI entirely.

## 10. Push/Deploy Readiness

Current sales/stock changes are functionally safe to push.

Performance concerns do not have to block the next push if usage is still light, but the next build should address performance before daily production habits harden.

Must confirm before push:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- migrations applied in Supabase in correct order
- environment includes `SUPABASE_SERVICE_ROLE_KEY` if owner manager creation/reset is needed

Local recent commits should be pushed only after this audit is reviewed.

## 11. Prioritized Recommendations

### A. Must Fix Now Before Next Push

- Nothing correctness-blocking found in the audit.
- If the app already feels slow in deployment, reduce Today page work before pushing more users to it.
- Apply all pending Supabase migrations before testing uploads live.

### B. Should Fix Soon

1. Optimize Today page:
   - remove live stock summary from initial load or lazy-load it;
   - batch store report statuses;
   - move receivables and weekly audit to expandable/lazy cards.
2. Optimize stock analytics:
   - fetch stock/sales rows once;
   - add compound indexes;
   - consider summary tables.
3. Add compound indexes for report duplicate/status queries and sales analytics.
4. Add owner password reset.
5. Add Data Correction Center for wrong sales/stock/salary-attendance uploads.

### C. Build Next

1. Monthly sales target progress dashboard.
2. Staff alias unmatched alert on Today/upload result.
3. Daily/monthly sales summary tables.
4. Persist weekly audit snapshots into `weekly_audits`.
5. Pagination for tasks, updates, employee directory, aliases, receivables.

### D. Can Wait

- AI chat retention controls.
- Orphan storage cleanup automation.
- Advanced archive UI for old sales/stock rows.
- Review photo cleanup.

### E. Do Not Touch

- Payslip/salary calculations unless fixing a specific salary bug.
- Salary history hard deletion.
- Manager role model unless there is a clear access requirement.
- Incentive logic until staff alias workflow is stable.

## 12. Verification Results

- `npm run lint`: passed
- `npx tsc --noEmit`: passed
- `npm run build`: passed
- `git status --short`: only `docs/PERFORMANCE_DATA_ADMIN_AUDIT.md` was untracked before commit
- `git log --oneline -15` before audit commit:
  - `b8b188b support real daily sales report and staff aliases`
  - `c7b07eb add staff sales name alias schema`
  - `cc05a5a confirm active store report upload permissions`
  - `b8a958e support real stock report upload format`
  - `bfba64d force hide native password reveal icon`
  - `0c1c478 fix double password reveal icon and polish login inputs`
  - `459dc9e bump version to 3`
  - `4087289 add feature duplicate audit`
  - `bb7f428 add full UI UX audit`
  - `1e9ba3a clarify monthly salary workflow labels`
  - `470d941 add month wise salary receivables dashboard`
  - `6af1b3a add month wise salary receivables schema`
  - `8b378dd auto-mark WhatsApp salary text as sent`
  - `55ac719 add payslip sent status and full WhatsApp salary text`
  - `ca581ca add payslip sent tracking schema`

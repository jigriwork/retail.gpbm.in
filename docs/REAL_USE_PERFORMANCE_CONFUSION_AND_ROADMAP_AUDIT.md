# Real Use Performance Confusion And Roadmap Audit

Date: 2026-06-21

Version: v7.5.0

Scope: audit-only review after one week of live use. This audit covers performance, confusion, missing shortcuts, owner/manager workflows, data trust, historical completion, buying, staff, security, uploaded file access, AI Secretary, mobile UX, and next roadmap. No code, schema, parser, RLS/security policy, uploaded data, report row, storage object, environment secret, or Git remote was changed by this audit.

## 1. Executive Summary

The app is genuinely useful for GPBM daily operations, but it now has the classic real-use problem: many important tools exist, yet the owner still has to hunt, wait, and interpret. v7.3.0 fixed account recovery basics, v7.4.0 improved suspicious sales trust, and v7.5.0 added safer historical import guardrails. The next build should not add another large module first. It should make the app faster, clearer, and more exception-first.

Ratings:

| Area | Rating | Reason |
| --- | ---: | --- |
| Overall real-use readiness | 7/10 | Core workflows exist, but the app still feels like a tool collection instead of a guided command center. |
| Speed/performance | 5.5/10 | Today, Store Detail, Stock Analytics, Business Reporting, and Secretary context do too much live aggregation. |
| Owner daily usability | 6.5/10 | Owner can act, but must scroll through mixed operations, payroll, audits, reports, and store cards. |
| Manager daily usability | 6/10 | Managers can upload and update, but their first screen is still owner-style and too broad. |
| Today page clarity | 5.5/10 | Important status is present, but crowded and duplicated. |
| Reports clarity | 6/10 | Useful cards exist, but uploads, analytics, payroll, correction, staff, and buying are mixed. |
| Data trust/readiness | 7/10 | Suspicious detector and historical import guardrails help, but summary mismatch, file download, reprocess, and health center remain gaps. |
| Buying workflow readiness | 6.5/10 | Brand/category/item/size reporting exists, but purchase decisions still need drilldowns, confidence, stock freshness, and reorder quantities. |
| Staff workflow readiness | 6.5/10 | Staff sales and aliases work, but zero-sale staff, targets, alias history, and manager alias review are missing. |
| Correction/data health readiness | 7/10 | Owner Correction Center is much stronger; still no single Exception Center or safe file-open workflow. |
| Mobile/PWA readiness | 6/10 | Forms and cards work, but wide tables and crowded Today slow real mobile use. |
| Business autopilot readiness | 5/10 | AI Secretary has context, but the app still lacks a ranked daily exception queue. |

Top 10 real-use problems:

1. Today is too crowded for the main daily page.
2. The slowest pages load raw `sales_rows` and `stock_rows` repeatedly.
3. Owner has no single Data Health / Exception Center.
4. Manager first screen does not feel like a dedicated assigned-store dashboard.
5. Reports mixes uploads, analytics, correction, payroll, staff, stock, and owner tools.
6. Historical completeness exists during import preview, but not as a persistent dashboard.
7. Buying report is powerful but dense and not yet a purchase workflow.
8. Staff Sales lacks zero-sale staff, targets, and performance drilldowns.
9. Uploaded original file cannot be safely opened/downloaded yet.
10. AI Secretary still depends on heavy live context and does not fully rank what to do first.

Top 10 slow/heavy areas:

1. `/app/today`
2. `/app/reports/stock/analytics`
3. `/app/reports/business`
4. `/app/stores/[storeId]`
5. AI Secretary prompt context
6. `/app/reports/sales/analytics`
7. `/app/reports/staff`
8. `/app/audit` and `/app/audit/[storeId]`
9. `/app/reports/staff-aliases`
10. payslip batch/receivable pages as salary history grows

Top 10 confusing areas:

1. Today says Owner Command Center even for managers.
2. Daily Sales Upload Status and Yesterday Sales Reports duplicate each other.
3. Salary Attendance appears near payroll and can sound salary-sensitive to managers.
4. Historical Sales Import lives in Correction Center but is labeled like a report card.
5. Buying & Restock and Stock Analytics overlap.
6. Staff Name Aliases, Staff Sales, and Staff Phone Directory sound related but are separated.
7. Suspicious report warnings say repair/reprocess is coming, but action choices are not yet unified.
8. Store Detail repeats Today/Reports instead of becoming a clean manager home.
9. Reports cards are not grouped by owner decisions vs daily operations.
10. Missing historical dates are visible in preview but not visible later.

Top 10 missing shortcuts/features:

1. Data Health / Exception Center.
2. Today v2 owner exception-first dashboard.
3. Today v2 manager assigned-store dashboard.
4. FY/current-month historical completeness dashboard.
5. Upload missing dates shortcut by store.
6. Reprocess report with latest parser.
7. Recalculate report summary from rows.
8. Secure owner-only uploaded file download/open.
9. Staff target vs achievement and zero-sale staff.
10. Buying drilldowns with reorder quantity and purchase draft.

Top 10 immediate improvements:

1. Lazy-load or move Today stock pulse, weekly audit, receivables, review details, and lower status cards.
2. Replace duplicate Today sales sections with one exception-first sales block.
3. Split Today owner and manager layouts.
4. Reorganize Reports into eight groups.
5. Add Data Health Center shell using existing warnings and report summaries.
6. Add historical completion card to Today/Data Health.
7. Add clearer labels for Salary Attendance vs Payslip Generator.
8. Add mobile-friendly card alternatives for wide report tables.
9. Cache or reuse stock/sales summaries within a request.
10. Add quick links from warnings to the exact repair/import/staff-alias action.

Recommended next 5 phases:

1. v7.6.0 - Speed and Today v2 clarity.
2. v7.7.0 - Data Health / Exception Center and historical completeness.
3. v7.8.0 - Manager Dashboard and daily duty flow.
4. v7.9.0 - Buying drilldowns and purchase planning.
5. v8.0.0 - Secure file access, AI autopilot upgrade, and audit log center.

## 2. Speed / Performance Audit

Slow page ranking:

| Rank | Route | Risk | Main cause |
| ---: | --- | --- | --- |
| 1 | `/app/today` | Very high | Many summaries and operational sections load on first render. |
| 2 | `/app/reports/stock/analytics` | Very high | `getStockSummary` repeatedly fetches/summarizes stock and sales rows. |
| 3 | `/app/reports/business` | High | Fetches latest stock rows, sales rows, alias rows, then builds many rankings in memory. |
| 4 | `/app/stores/[storeId]` | High | Store page duplicates Today, stock analytics, sales summaries, tasks, checklist, and weekly audit. |
| 5 | `/app/secretary` prompt action | High | Context builder duplicates Today-style summaries plus stock pulse and recent batches. |
| 6 | `/app/reports/sales/analytics` | Medium-high | Loads all selected sales rows and computes trend/rankings in memory. |
| 7 | `/app/reports/staff` | Medium-high | Loads selected sales rows and aliases, then groups staff in memory. |
| 8 | `/app/audit` | Medium-high | Weekly audit combines reports, reviews, updates, tasks, sales, and stock signals. |
| 9 | `/app/reports/staff-aliases` | Medium | Loads aliases, contacts, and recent sales rows to derive unmatched names. |
| 10 | payslip/receivables pages | Medium | Owner-only, but all-row summaries can grow over salary history. |

Page audit:

| Route | First-render data | Calls/queries | Repeated/heavy risk | Pagination/lazy/cache opportunities | Historical growth risk |
| --- | --- | --- | --- | --- | --- |
| `/app/today` | stores, task summary, sales statuses, salary overview, stock overview, reviews, updates, checklists, latest stock month, yesterday sales, month sales, yesterday staff, phone count, owner receivables, stock pulse, weekly audit on audit day | `getAccessibleStores`, `getTaskSummary`, `getStoreSalesStatuses`, `getSalaryAttendanceOverview`, `getStockOverview`, `getReviewStatuses`, `getTodayUpdateSummary`, `getAccessibleChecklists`, `getLatestStockMonth`, `getSalesSummary` twice, `getStaffSalesSummary`, `getMissingEmployeePhoneCount`, owner receivable calls, `getStockSummary`, `getWeeklyAuditSummaries` | Multiple raw sales scans and live stock summary on first load | Lazy-load stock, receivables, reviews, weekly audit; use `reports.summary` for top cards; cache monthly sales summary | Very high after FY import because month/custom rows increase and stock remains large |
| `/app/reports` | stores, sales statuses, recent sales, salary overview, stock overview | status helpers, recent reports, overview helpers | Status cards plus recent reports are fine, but grouping is confusing | No heavy analytics needed; keep as lightweight route with grouped cards | Medium |
| `/app/reports/business` | stores, report filters, latest stock months, sales rows, stock rows, aliases, missing sales dates, suspicious reports | `getBusinessReport`, `getMissingSalesReportDates`, `getSuspiciousSalesReportWarningsFromReports` | Builds brand/category/item/size/staff/restock/slow/low-stock rows in memory | Add server-side paging, detail routes, reuse summaries, materialized stock item summary | High for FY/year filters |
| `/app/reports/staff` | stores, selected sales rows, aliases, unmatched warnings, suspicious warnings | `getStaffSalesSummary`, `getUnmatchedStaffWarningsFromReports`, `getSuspiciousSalesReportWarningsFromReports` | Same period can hit reports and sales rows separately | Add pagination/search, low-to-high sort, summary table, zero-sale contacts | Medium-high after history |
| `/app/reports/sales` | stores and recent sales reports | `getAccessibleStores`, `getRecentSalesReports` | Low; upload parsing happens on action | Keep upload route focused; do not add analytics here | Low |
| `/app/reports/sales/analytics` | stores, selected sales summary, missing dates, current-month summary, suspicious warnings | `getSalesSummary`, `getMissingSalesReportDates`, second `getSalesSummary`, warnings | Raw sales rows loaded for selected period and current month | Add date guard, summary tables, SQL aggregation, lazy drilldowns | High for custom/year |
| `/app/reports/stock` | stores, recent stock reports, stock overview | stock reports and overview | Medium, mostly reports table | Keep upload/status only | Low-medium |
| `/app/reports/stock/analytics` | stores, latest stock month, stock summary | `getLatestStockMonth`, `getStockSummary` | Re-fetches stock/sales rows through candidate helpers | Fetch once per request; lazy slow/dead sections; monthly item summary | Very high with 25k+ stock rows/store/month |
| `/app/reports/correction` | owner check, stores, paginated reports, audit logs, suspicious warning deep check for current page | `getCorrectionSalesReports`, `getRecentCorrectionAuditLogs`, `getSuspiciousSalesReportWarningsForReportIds` | Page-size bounded; deep warning checks rows for page report IDs | Keep pagination; add filters and Data Health link; do not load all historical reports | Medium |
| `/app/stores` | accessible stores | `getAccessibleStores` | Low | Keep | Low |
| `/app/stores/[storeId]` | store, statuses, reviews, updates, checklist, sales summaries, staff summary, tasks count, latest stock month, stock summary, weekly audit | many Today-like calls plus stock/audit | Repeats store sales and stock analytics live | Make first viewport light; lazy audit/stock; store KPI summary | High |
| `/app/tasks` | task list and stores | `getTasksForProfile`, `getAccessibleStores` | Tasks fetched then filtered by tab | Add pagination, status counts, assigned-store filter | Medium |
| `/app/checklist` | stores and checklists | `getAccessibleStores`, checklist queries | Per-store checklist work can grow | Batch checklist status; manager-focused view | Low-medium |
| `/app/updates` | stores and up to 80 updates | `getManagerUpdates` | Limit helps, no pagination beyond query limit | Add real pagination/infinite load | Medium |
| `/app/settings` | profile, stores/settings | auth/store/settings queries | Low | Keep | Low |
| `/app/users` | owner profile, profiles, stores, store_users | three parallel Supabase queries | Low-medium as users grow | Add audit log viewer later | Low |
| `/app/secretary` | owner chats/memories; prompt builds context | `ai_chats`, `ai_memories`; action calls many Today-style helpers | Prompt latency can be high due to live stock/sales context | Use cached exception summary, make stock/audit conditional | High |
| payslip/salary/receivables | owner batches, generated rows, receivables | payslip query helpers | Batch rows and receivables can become wide | Paginate rows and aggregate receivables | Medium |

Likely root causes:

- Dashboard pages aggregate raw rows on request.
- Stock summary fetches the same stock/sales data through several helpers.
- Today includes decision, operations, payroll, review, update, store, and analytics sections in one request.
- Several pages use large wide tables instead of paginated drilldowns.
- Historical import increases `sales_rows`, making raw sales scans more visible.

Quick wins:

- Remove duplicate Today sales sections.
- Lazy-load stock pulse, weekly audit, receivables, reviews, and lower status cards.
- Keep Reports as navigation/status, not analytics.
- In `getStockSummary`, fetch stock rows and movement rows once and derive all candidates from memory.
- Default heavy reports to month, require explicit action for year/custom.

Medium fixes:

- Add server-side pagination for tasks, updates, staff aliases, employees, receivables, and wide report rows.
- Add Data Health Center fed by `reports.summary`, `audit_logs`, `sales_upload_batches`, and status helpers.
- Add request-level summary reuse for Today and Secretary.
- Add drilldown routes for brand/product/staff instead of one giant page.

Long-term fixes:

- Persist `daily_store_sales_summary`, `daily_staff_sales_summary`, `daily_brand_sales_summary`, `monthly_stock_item_summary`, and `owner_daily_exception_summary`.
- Generate weekly audit snapshots instead of recomputing live.
- Build SQL/RPC aggregation for common reporting views.

## 3. Today Page v2 Audit

Current visible sections:

- Header with signed-in role.
- Owner Command Center quick actions, also shown to managers with owner-only items filtered.
- Daily Sales Upload Status.
- Owner-only AI Secretary card.
- Operational summary cards for staff phones, stock, salary, and related status.
- Sales pulse.
- Monthly stock workflow.
- Daily checklist.
- Today store reviews.
- Task cards.
- Monthly salary workflow.
- Manager updates.
- Manager quick actions.
- Accessible stores.
- Yesterday sales reports.
- Generic status cards.

Owner-only sections:

- AI Secretary.
- Historical Sales Import / Correction Center shortcut.
- Fix Wrong Upload links.
- Owner private/personal task card.
- Receivable summary where available.

Manager-visible sections:

- Most command shortcuts except owner-only tools.
- Daily sales status.
- Sales/staff/stock/salary attendance status.
- Checklist, reviews, tasks, updates, store list.
- Manager quick actions.

Heavy sections on first render:

- Sales pulse: `getSalesSummary` for yesterday and month plus `getStaffSalesSummary`.
- Stock pulse/workflow: `getLatestStockMonth` and `getStockSummary`.
- Checklist/review/update/task summaries.
- Owner receivables.
- Weekly audit on audit day.

Sections duplicating Reports/Store Detail:

- Yesterday Sales Reports duplicates Daily Sales Upload Status.
- Monthly stock workflow duplicates Reports Stock.
- Monthly salary workflow duplicates Salary Attendance route.
- Accessible stores duplicates Stores.
- Sales pulse duplicates Sales Analytics.
- Stock pulse duplicates Stock Analytics/Business Report.

Today top priority:

1. What is missing or suspicious today?
2. Who must upload/fix data?
3. What buying/staff/manager issue needs attention?
4. What action button should be tapped next?

Lazy-load:

- Stock pulse and detailed restock candidates.
- Weekly audit.
- Review details/history.
- Receivable details.
- Lower analytics cards.
- Store list.

Hide behind More:

- Salary attendance unless due/missing.
- Staff phone directory unless missing phone count is non-zero.
- Reviews unless incomplete.
- Accessible stores.
- Generic status cards.
- Recent lower reports.

Move to Reports or Settings:

- Salary workflow details.
- Generic status cards.
- Store targets and firm mapping.
- Full stock analytics.
- Full sales pulse.

Owner vs manager:

- Today is not different enough today. Managers still see a broad operations page that feels like a filtered owner dashboard. A manager should see assigned-store duties first, not owner decision reporting.

Proposed Today v2 owner layout:

Top cards:

1. Missing/Suspicious Sales Reports.
2. Daily Sales Upload Status.
3. Historical Completion Warning.
4. Buying/Restock Urgent.
5. Staff Issues: top staff, zero/unmatched staff.
6. Manager Pending Tasks/Updates.
7. Fix Wrong Upload.
8. Ask AI Secretary.

Middle sections:

- Exception list grouped by store.
- Sales status and target progress.
- Buying urgent rows only.
- Staff performance snapshot.
- Manager accountability snapshot.

Lower lazy sections:

- Stock analytics detail.
- Weekly audit.
- Checklist/review details.
- Payroll/receivables.
- Store cards.
- Recent uploads.

Remove/move:

- Duplicate Yesterday Sales Reports.
- Generic bottom status cards.
- Full stock workflow detail.
- Full salary workflow detail.
- Accessible stores from first-load body.

Proposed Today v2 manager layout:

Top cards:

1. My Assigned Store.
2. Upload Daily Sales.
3. Upload Stock.
4. Fix Staff Names.
5. Checklist.
6. Tasks.
7. Send Update.
8. Store Upload/Status Warnings.

Middle sections:

- Today duty checklist.
- Sales upload status for assigned store.
- Stock/salary attendance due only if relevant.
- Pending tasks.
- Open updates.

Lower lazy sections:

- Staff sales.
- Store reviews.
- Recent assigned-store reports.
- Store detail link.

## 4. Reports Page Reorganization Audit

Current Reports page works as a hub, but cards are mixed. Uploads, analytics, buying, staff aliases, staff phones, stock, salary attendance, correction, and payslips appear in one long column. Managers can use many cards safely, but labels can sound owner-level.

Recommended groups:

| Group | Cards | Owner visibility | Manager visibility | Recommended labels | Shortcut priority |
| --- | --- | --- | --- | --- | --- |
| Owner Decisions | Buying & Restock, Business Reports, Sales Analytics, Staff Performance Summary, Target Progress | Yes | Limited assigned-store view if allowed | "Owner Decisions", "Buying & Restock", "Sales Target Progress" | High |
| Daily Operations | Daily Sales Status, Missing Uploads, Checklist, Tasks, Manager Updates | Yes | Yes assigned stores | "Daily Operations" | Critical |
| Uploads | Upload Daily Sales, Upload Stock, Salary Attendance Upload | Yes | Yes assigned stores | "Uploads" and "Salary Attendance Upload" | Critical |
| Staff | Staff Sales, Fix Staff Names, Staff Phone Directory | Yes | Yes assigned stores | "Staff Sales", "Fix Staff Names", "Staff Directory" | High |
| Stock & Buying | Stock Upload, Stock Analytics, Buying & Restock | Yes | Yes assigned stores, if owner wants | "Stock & Buying" | High |
| Data Health / Corrections | Data Health Center, Historical Sales Import, Fix Wrong Upload, Suspicious Reports, Audit Logs | Yes | Manager read/actions only for assigned safe issues later | "Data Health / Corrections" | Critical |
| Payroll | Salary Attendance, Payslip Generation, Receivables | Owner for payslips/receivables; attendance both | Managers see attendance only | "Payroll" and "Salary Attendance Upload" | Medium |
| Admin / Settings | Users, Store Targets, Firm Mapping, Account Settings, Permission Matrix | Owner mostly | Manager account settings only | "Admin / Settings" | Medium |

Missing cards:

- Data Health Center.
- Historical Completion Dashboard.
- Suspicious Reports.
- Upload Missing Dates.
- Secure Uploaded Files, after storage review.
- Audit Logs.
- Permission Matrix.
- Staff Targets.

## 5. Data Health / Exception Center Audit

The app does not yet have one place where the owner can see all problems. Warnings exist across Today, Reports, Staff Sales, Correction Center, Business Reporting, and AI Secretary context.

New module recommendation: `Data Health Center`.

Route suggestion: `/app/reports/health` or `/app/data-health`.

What it should show:

- Missing sales uploads by store/date.
- Suspicious sales reports.
- Report uploaded but zero analytics.
- Reports without staff column.
- Unmatched staff names.
- Stale stock month.
- Missing stock upload.
- Historical import missing dates.
- Duplicate reports, if found.
- Report summary vs rows mismatch.
- Failed or partial historical imports.
- Manager upload issues.
- Recent sensitive audit logs.

Owner view:

- All stores.
- Critical, High, Medium issue tabs.
- Store/date filters.
- Action buttons: Upload, Fix Staff Names, Replace Report, Delete Report, Import Missing Dates, View Audit.

Manager view:

- Assigned stores only.
- No delete/replace/historical replace.
- Safe actions: Upload Daily Sales, Upload Stock, Fix Staff Names, Send Update.
- No owner audit/security/payslip information.

Performance approach:

- First render should use lightweight `reports.summary`, status helpers, `sales_upload_batches`, `audit_logs`, and limited warning queries.
- Deep row checks should run only on selected report or small page.
- Cache daily exception summary after uploads.

Data sources:

- `reports`
- `sales_rows` only for deep mismatch checks
- `stock_rows` only for selected stock freshness/detail
- `sales_upload_batches`
- `audit_logs`
- `staff_name_aliases`
- `employee_contacts`
- tasks/checklists/updates/reviews for manager accountability

Phase recommendation:

- Build shell in Phase 5/v7.7.0 after Today v2 speed work.
- Add deep repair/reprocess actions in later phases.

## 6. Historical Data Completion Audit

Historical import exists in v7.5.0 and supports current month, financial year from 1 April, and custom range. It previews missing dates, duplicates, no-staff-column dates, and suspicious zero-total dates before import. That is strong import-time safety.

Remaining gaps:

- Owner cannot easily see after import whether FY from 1 April is complete.
- Missing dates by store are not persistent on Today.
- Current-month completeness is shown indirectly through upload status, not as a historical completion module.
- Imported/skipped/failed/suspicious dates are stored in batch summary but not surfaced as a dedicated status dashboard.
- No Today card says "Historical sales incomplete".
- AI Secretary knows recent batches, but not a full missing-date dashboard.
- Reports links to Historical Sales Import, but Data Health would be clearer.
- Browser file reselect limitation is explained through preview message but remains awkward.

Recommend:

- FY completeness dashboard by store.
- Store-wise missing date list.
- Month-wise import status.
- "Upload missing dates" shortcut with prefilled store/range.
- Historical import status on Today and Data Health.
- Recent import batch detail page.
- AI Secretary exception context: "FY missing dates by store".

## 7. Sales Upload / Data Trust Audit

Daily upload:

- Manager/owner assigned-store upload works.
- Duplicate daily report protection exists.
- Suspicious parser guard blocks amount-like unmapped zero totals.
- Store validation rejects explicit wrong-store rows.
- Single daily upload blocks multi-date files, sending owner to historical import.

Historical import:

- Owner-only.
- Preview required.
- Confirmation phrase required.
- Duplicate mode defaults to skip.
- Range presets and missing-date detector exist.
- Replace is guarded but still high risk.

Correction replace/delete:

- Owner-only Data Correction Center exists.
- Delete/replace have confirmation phrases.
- Audit logs are written.
- Storage cleanup is attempted.
- Reprocess with latest parser is not built.

Remaining trust gaps:

- No report reprocess with latest parser.
- No one-click recalculate summary from rows.
- No secure uploaded file download/open.
- Replacement is not a true database/storage transaction across every step.
- Summary vs rows mismatch is detected in some paths, but not in one global inbox.
- No report status for "needs review" vs "processed but suspicious".
- Manager guidance after upload can still be too sparse.

Recommendations:

- Reprocess with latest parser.
- Recalculate report summary.
- Download/open uploaded file after storage review.
- Upload preview examples and accepted file guide.
- Explain "summary vs staff-wise report" near warnings.
- Add transaction/rollback improvement where possible.
- Add failed upload/partial import dashboard.

## 8. Manager Dashboard / Manager Workflow Audit

Manager experience today:

- Managers can access assigned stores via `getAccessibleStores` and RLS.
- Managers can upload daily sales, stock, and salary attendance for assigned stores.
- Managers can fix staff aliases and staff contacts for assigned stores.
- Managers can use tasks, checklists, reviews, and updates.
- Managers can change password through account recovery work from v7.3.0.
- Owner pages are guarded: Correction Center, Users, AI Secretary, payslips, receivables, Life Flow.

Issues:

- Manager first page is not clean enough.
- Manager sees owner-style cards like Buying & Restock and broad reports unless filtered by role in UX.
- Manager duties are not ranked as "do these today".
- No dedicated "My Store Dashboard" route.
- Upload success feedback should point to next action: fix staff names, missing staff column, suspicious report, or done.
- Manager with no assigned store gets empty sections instead of a clean blocked/help state.

Recommended Manager Dashboard:

- Route: either `/app/today` role-specific version or `/app/manager`.
- First viewport: assigned store, Upload Daily Sales, Upload Stock, Checklist, Tasks, Send Update, Fix Staff Names.
- Warnings: missing sales, suspicious upload, missing staff column, stale stock, pending tasks.
- Hide: owner decisions, correction, historical import, payslips, receivables, admin/users, broad AI Secretary.
- Keep: staff sales for assigned store, store detail, updates, tasks, checklist, reviews, assigned-store reports.

## 9. Owner Command / Business Autopilot Audit

Owner should know:

- Which store did not upload sales.
- Which report is suspicious.
- Which dates are missing historically.
- Which staff names need fixing.
- Which staff did best/worst.
- Which brand/category needs reorder.
- Which stock is stale.
- Which manager has pending tasks.
- Which customer/receivable/salary issue needs action.
- What to do first today.

Current state:

- Most raw ingredients exist.
- The owner still needs to open Today, Reports, Staff, Business, Correction, Tasks, Updates, and Secretary to build the full picture.

Recommend Owner Autopilot:

- Top exception cards.
- AI Secretary daily summary powered by cached exception facts.
- One-click actions for each issue.
- WhatsApp summary.
- Daily closing checklist.
- Morning business digest.
- "What should I do first today?" button.

## 10. Buying / Restock Roadmap Audit

Current Buying & Restock:

- Can search brand/category/product/size.
- Shows stock vs sales, staff, returns, restock signals, slow/no-sale, low stock by size.
- Shows latest stock month label and warnings.
- Exports/copies owner-ready report.
- Uses historical sales rows, which makes it more useful after import.

Gaps:

- No dedicated brand detail page.
- No product detail page.
- Reorder quantity is not calculated.
- Supplier/vendor mapping is absent.
- Purchase draft and purchase order export are absent.
- Stock freshness is visible but not forceful enough.
- Match confidence exists but should be more prominent for decisions.
- Mobile tables are wide.

Roadmap:

- Brand detail page.
- Product detail page.
- Size-wise reorder page.
- Reorder quantity suggestion.
- Supplier/vendor mapping.
- Purchase draft.
- Purchase order export.
- Avoid-buying list.
- Stock freshness warning.
- Buying AI summary.

## 11. Staff Sales / Staff Management Roadmap Audit

Current:

- Staff Sales aggregates sales by mapped aliases.
- Staff Alias page maps source names to contacts.
- Staff Contacts exist.
- Managers can maintain assigned-store aliases/contacts.
- Missing staff warnings exist.

Gaps:

- No staff target setup.
- No target vs achievement.
- No zero-sale active staff warning.
- No staff performance by brand/category in dedicated staff detail.
- No staff sales + attendance comparison.
- No auto-seed staff contacts from sales names.
- No alias history/revert UI.
- No owner review queue for manager alias changes.
- Manager staff directory could be simpler.

Recommend:

- Staff target setup.
- Target vs achievement.
- Zero-sale staff warning.
- Staff performance by brand/category.
- Staff sales + attendance comparison.
- Auto-seed staff contacts from sales names.
- Alias history/revert.
- Owner review of manager alias changes.
- Manager staff directory improvements.

## 12. User / Permission / Security Audit

Current strengths:

- Owner-only pages use owner guards.
- Manager access is store-assignment based.
- Managers cannot access payslip/receivable owner pages.
- Manager historical bulk upload is disabled.
- Service-role usage is server-side.
- Password/account recovery was added in v7.3.0.
- Correction actions write audit logs.

Risks/gaps:

- No permission matrix page.
- No full audit logs viewer.
- Manager action log is incomplete.
- Storage `reports` bucket has broad authenticated select policy in initial migration, which is risky before download links.
- Uploaded file download must use signed URLs through server-side permission checks only.
- First-login force password change is not present.
- RLS should be reviewed before any file open/download feature.

Recommend:

- Permission matrix page.
- Manager action log.
- Owner view of manager actions.
- Storage policy review before file downloads.
- First-login force password change.
- Audit logs viewer.
- Route/RLS regression checklist.

## 13. Uploaded File Download/Open Audit

Current:

- `reports` storage bucket is private.
- Initial storage policy allows authenticated select for `reports` objects.
- App does not currently expose broad download/open links for reports.
- Correction Center shows `file_path`, but not a safe file download.
- Payslips storage is owner-only.

Risks:

- If a future UI exposes paths or generic signed URLs, broad authenticated select can leak files across stores.
- Manager assigned-store file downloads require strict DB lookup plus `canAccessStore`.
- Owner download should be audited.
- Storage paths should not be exposed unnecessarily.

Secure approach:

- Owner-only signed download action for any report file.
- Optional manager signed download only for assigned-store files and only after owner policy decision.
- No public URLs.
- Audit every download action.
- Do not expose storage paths in normal UI.
- Review and tighten storage object select policy before adding download links.

## 14. AI Secretary Upgrade Audit

Current context includes:

- Checklist status.
- Sales statuses and latest uploads.
- Recent historical import batches.
- Suspicious sales reports this month.
- Month sales by store.
- Top staff yesterday.
- Stock pulse.
- Manager updates.
- Tasks.
- Salary attendance and stock report overview.
- Memories.
- Weekly audit when Monday or prompt asks.

Gaps:

- Does not know full missing historical date list.
- Does not know all unmatched staff names as a ranked issue.
- Does not include manager action log.
- Does not include storage/security warnings.
- Stock pulse is heavy.
- It does not yet produce a proactive daily digest unless owner asks.

Recommend:

- Daily owner digest.
- Exception summary.
- Buying summary.
- Staff summary.
- Manager accountability summary.
- "What should I do first today?"
- Use cached exception facts instead of live stock/sales rebuild on every prompt.

## 15. Mobile UX Audit

PWA strengths:

- Forms stack acceptably.
- Bottom navigation exists.
- Buttons are generally large.
- Upload flows are usable.

Mobile problems:

- Today first screen is crowded.
- Reports page is long and mixed.
- Correction Center cards and forms are dense.
- Historical import requires file reselect after preview.
- Staff Sales table is wide.
- Buying report tables are very wide.
- Stock analytics table/cards require scrolling.
- Manager view is not simplified enough.

Recommend:

- Mobile card layouts for wide tables.
- Collapsed sections.
- Sticky urgent actions.
- Bottom action buttons for upload/preview/import.
- Manager-specific Today.
- Keep first viewport focused on only urgent status and next action.

## 16. Feature Master List

| Category | Feature name | Problem solved | User | Priority | Complexity | Dependencies | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | Lazy-load Today stock pulse | Slow Today | Both | Critical | Medium | Today split | v7.6 |
| A | Lazy-load weekly audit | Slow Today/Store | Owner | High | Medium | Audit component boundary | v7.6 |
| A | Remove duplicate Today sales section | Confusion and load | Both | Critical | Low | Today layout | v7.6 |
| A | Fetch stock analytics rows once | Repeated stock queries | Both | Critical | Medium | `lib/analytics/stock.ts` | v7.6 |
| A | Server pagination for tasks | Large task list | Both | Medium | Medium | task queries | v7.8 |
| A | Server pagination for updates | Large update feed | Both | Medium | Medium | update queries | v7.8 |
| A | Server pagination for staff aliases | Alias page scale | Both | Medium | Medium | alias query | v7.8 |
| A | Summary tables for daily sales | Raw sales scans | Both | High | High | schema/job | v8.0 |
| A | Monthly stock item summary | Heavy stock analytics | Owner | High | High | schema/job | v8.0 |
| A | Cached owner exception summary | Slow dashboards/AI | Owner | High | High | Data Health | v8.0 |
| B | Owner Today v2 | Crowded owner home | Owner | Critical | Medium | layout | v7.6 |
| B | Manager Today v2 | Manager clutter | Manager | Critical | Medium | role layout | v7.6 |
| B | Urgent exception cards | Owner must know what first | Owner | Critical | Medium | status helpers | v7.6 |
| B | Historical incomplete card | Missing FY clarity | Owner | High | Medium | batch/report query | v7.7 |
| B | Buying urgent card | Purchase signal hidden | Owner | High | Medium | business summary | v7.7 |
| B | Staff issue card | Unmatched/zero staff hidden | Both | High | Medium | staff queries | v7.7 |
| B | Manager accountability card | Owner follow-up | Owner | High | Medium | tasks/updates | v7.7 |
| B | More drawer for lower Today sections | Mobile clarity | Both | Medium | Low | UI layout | v7.6 |
| C | Data Health Center shell | Problems scattered | Owner | Critical | Medium | existing warnings | v7.7 |
| C | Missing uploads tab | Upload follow-up | Both | Critical | Medium | reports query | v7.7 |
| C | Suspicious reports tab | Trust | Owner | Critical | Medium | detector | v7.7 |
| C | Staff name issues tab | Staff trust | Both | High | Medium | aliases | v7.7 |
| C | Stock freshness tab | Buying trust | Owner | High | Medium | stock reports | v7.7 |
| C | Failed/partial imports tab | Historical trust | Owner | High | Medium | sales_upload_batches | v7.7 |
| C | Summary mismatch deep scan | Data trust | Owner | High | High | rows aggregation | v7.8 |
| C | Manager issue view | Manager accountability | Owner | Medium | Medium | tasks/updates | v7.8 |
| D | FY completeness dashboard | Historical missing dates | Owner | Critical | Medium | reports by range | v7.7 |
| D | Store-wise missing date list | Find gaps | Owner | Critical | Medium | date range helper | v7.7 |
| D | Month-wise import status | Know what imported | Owner | High | Medium | batches | v7.7 |
| D | Upload missing dates shortcut | Faster repair | Owner | High | Low | correction route params | v7.7 |
| D | Import batch detail page | Audit import | Owner | Medium | Medium | batches | v7.8 |
| E | Upload result next-action panel | Manager guidance | Both | High | Low | upload actions | v7.6 |
| E | Accepted sales file guide | Parser confusion | Manager | High | Low | docs/UI | v7.6 |
| E | Staff column warning near upload | Staff trust | Both | High | Low | summary warnings | v7.6 |
| E | Summary-vs-staff explanation | Analytics confusion | Both | Medium | Low | copy | v7.6 |
| E | Duplicate handling explainer | Import safety | Owner | Medium | Low | correction UI | v7.7 |
| F | Reprocess with latest parser | Parser fixes old file | Owner | High | High | secure file access | v8.0 |
| F | Recalculate report summary | Stale warnings | Owner | High | Medium | rows aggregation | v7.8 |
| F | Repair summary mismatch | Trust | Owner | High | Medium | mismatch detector | v7.8 |
| F | Correction audit detail | Owner review | Owner | Medium | Low | audit_logs | v7.8 |
| G | Manager dashboard route | Clean manager flow | Manager | Critical | Medium | Today v2 | v7.8 |
| G | Manager no-store state | Empty manager app | Manager | High | Low | auth/stores | v7.6 |
| G | Manager daily duty checklist | Operational clarity | Manager | High | Medium | checklist/tasks | v7.8 |
| G | Manager upload history | Accountability | Both | Medium | Medium | reports | v7.8 |
| G | Manager alias review queue | Staff trust | Owner | Medium | High | audit/history | v8.0 |
| H | Brand detail page | Buying drilldown | Owner | High | Medium | business report | v7.9 |
| H | Product detail page | Item decisions | Owner | High | Medium | item identity | v7.9 |
| H | Size-wise reorder page | Quantity decision | Owner | High | Medium | stock/sales size | v7.9 |
| H | Reorder quantity suggestion | Purchase planning | Owner | High | High | targets/rules | v7.9 |
| H | Supplier/vendor mapping | Purchase workflow | Owner | Medium | High | schema | v8.1 |
| H | Purchase draft | Actionable buying | Owner | Medium | High | supplier mapping | v8.1 |
| H | Purchase order export | Supplier sharing | Owner | Medium | Medium | purchase draft | v8.1 |
| H | Avoid-buying list | Reduce dead stock | Owner | High | Medium | stock signals | v7.9 |
| H | Buying AI summary | Faster decisions | Owner | Medium | Medium | Secretary upgrade | v8.0 |
| I | Staff targets | Staff accountability | Owner | High | Medium | settings/schema | v8.0 |
| I | Target vs achievement | Performance clarity | Both | High | Medium | staff targets | v8.0 |
| I | Zero-sale staff warning | Missed sales effort | Both | High | Medium | employee_contacts | v7.8 |
| I | Staff brand/category detail | Coaching | Owner | Medium | Medium | staff detail | v7.9 |
| I | Staff sales + attendance compare | Payroll/performance | Owner | Medium | High | salary attendance | v8.1 |
| I | Auto-seed staff contacts | Missing staff directory | Both | High | Medium | sales names | v7.8 |
| I | Alias history/revert | Bad mapping recovery | Owner | High | High | audit/history | v8.0 |
| J | Permission matrix page | Owner confidence | Owner | High | Medium | auth policy map | v8.0 |
| J | Manager action log | Accountability | Owner | High | Medium | audit logs | v8.0 |
| J | Audit logs viewer | Security review | Owner | High | Medium | audit_logs | v8.0 |
| J | First-login password change | Temporary password safety | Both | Medium | High | profile flag | v8.1 |
| J | Route/RLS regression checklist | Safety | Dev/owner | High | Medium | tests | v8.0 |
| K | Owner signed file download | Verify uploads | Owner | High | Medium | storage review | v8.0 |
| K | Manager assigned-store download | Optional file access | Manager | Medium | High | owner decision | v8.1 |
| K | Download audit log | File security | Owner | High | Medium | audit logs | v8.0 |
| K | Hide storage paths | Reduce leak risk | Both | High | Low | UI cleanup | v8.0 |
| L | Daily owner digest | Autopilot | Owner | High | Medium | Data Health | v8.0 |
| L | Exception summary context | Better AI answers | Owner | High | Medium | Data Health | v8.0 |
| L | Buying summary context | Purchase help | Owner | Medium | Medium | buying report | v8.0 |
| L | Staff summary context | Coaching | Owner | Medium | Medium | staff data | v8.0 |
| L | Manager accountability context | Follow-up | Owner | Medium | Medium | tasks/updates | v8.0 |
| M | Mobile card report rows | Table usability | Both | High | Medium | report components | v7.8 |
| M | Sticky mobile actions | Upload speed | Both | Medium | Low | UI | v7.8 |
| M | Collapsed report sections | Less scrolling | Both | Medium | Low | UI | v7.8 |
| M | Manager mobile first viewport | Daily use | Manager | High | Medium | Manager dashboard | v7.8 |
| N | Receivables shortcut in Reports | Payroll follow-up | Owner | Medium | Low | reports page | v7.8 |
| N | Payslip action audit | Sensitive action log | Owner | Medium | Medium | audit_logs | v8.0 |
| N | Salary attendance correction | Wrong attendance upload | Owner | Medium | High | correction center | v8.1 |
| O | Multi-store summary snapshots | SaaS readiness | Owner | Low | High | summary tables | Future |
| O | Tenant isolation review | SaaS safety | Owner/dev | Low | High | architecture | Future |
| O | Public signup delay | Avoid premature SaaS | Owner | Low | High | permission model | Future |

## 17. Recommended Next 10 Builds

1. Phase: Speed and Today v2 foundation
   - Version: v7.6.0
   - Build: split Today by owner/manager, remove duplicate sales section, lazy-load heavy lower sections.
   - Why now: owner already feels slowness and confusion.
   - Business value: faster daily start.
   - Risk: layout churn.
   - Complexity: Medium.
   - Files/areas: `app/app/today/page.tsx`, Today components, status helpers.
   - Codex or Cline: Codex.
   - Push: no push requested unless owner asks.

2. Phase: Stock summary performance fix
   - Version: v7.6.1
   - Build: refactor stock analytics to fetch stock/sales rows once per request.
   - Why now: stock analytics is one of the clearest slow causes.
   - Business value: faster buying pages.
   - Risk: candidate logic regression.
   - Complexity: Medium.
   - Files/areas: `lib/analytics/stock.ts`, stock analytics page.
   - Codex or Cline: Codex.
   - Push: no push requested unless owner asks.

3. Phase: Reports reorganization
   - Version: v7.6.2
   - Build: group Reports cards into Owner Decisions, Daily Operations, Uploads, Staff, Stock & Buying, Data Health, Payroll, Admin.
   - Why now: low-risk clarity win.
   - Business value: fewer wrong clicks.
   - Risk: user relearning.
   - Complexity: Low.
   - Files/areas: `app/app/reports/page.tsx`.
   - Codex or Cline: Codex.
   - Push: no push requested unless owner asks.

4. Phase: Data Health Center shell
   - Version: v7.7.0
   - Build: new exception center with missing uploads, suspicious reports, staff issues, stock freshness, partial imports.
   - Why now: owner should not search across pages.
   - Business value: trust and speed.
   - Risk: query load if built too deep.
   - Complexity: Medium.
   - Files/areas: new route, sales/stock/status queries.
   - Codex or Cline: Codex.
   - Push: no push requested unless owner asks.

5. Phase: Historical completeness dashboard
   - Version: v7.7.1
   - Build: FY/current-month completion by store, missing date list, upload missing dates shortcut.
   - Why now: v7.5.0 import needs post-import visibility.
   - Business value: owner knows whether data is complete.
   - Risk: date-range edge cases.
   - Complexity: Medium.
   - Files/areas: Correction/Data Health/Today, report queries.
   - Codex or Cline: Codex.
   - Push: no push requested unless owner asks.

6. Phase: Manager dashboard
   - Version: v7.8.0
   - Build: manager-first Today or `/app/manager` with assigned store duties.
   - Why now: managers need a clean workday flow.
   - Business value: fewer missed uploads/tasks.
   - Risk: role-specific layout drift.
   - Complexity: Medium.
   - Files/areas: Today, stores, tasks, checklist, uploads.
   - Codex or Cline: Codex.
   - Push: no push requested unless owner asks.

7. Phase: Staff trust improvements
   - Version: v7.8.1
   - Build: zero-sale staff warning, auto-seed staff contacts, better alias next actions.
   - Why now: staff sales is only useful when staff data is clean.
   - Business value: better staff accountability.
   - Risk: duplicate staff/contact creation.
   - Complexity: Medium.
   - Files/areas: employees, staff aliases, sales reports.
   - Codex or Cline: Codex.
   - Push: no push requested unless owner asks.

8. Phase: Buying drilldowns
   - Version: v7.9.0
   - Build: brand detail, product detail, size-wise reorder view, avoid-buying list.
   - Why now: next biggest owner business value after speed/trust.
   - Business value: purchase decisions.
   - Risk: match-confidence mistakes.
   - Complexity: High.
   - Files/areas: business analytics, report routes.
   - Codex or Cline: Codex for initial drilldowns, Cline optional for larger UI pass.
   - Push: no push requested unless owner asks.

9. Phase: Secure file download and audit logs
   - Version: v8.0.0
   - Build: storage policy review, owner-only signed downloads, download audit log, audit logs viewer.
   - Why now: owner needs original files, but only after security review.
   - Business value: safer correction.
   - Risk: file leak if done casually.
   - Complexity: High.
   - Files/areas: storage policies, correction, reports, audit logs.
   - Codex or Cline: Codex.
   - Push: no push requested unless owner asks.

10. Phase: AI Secretary autopilot upgrade
    - Version: v8.0.1
    - Build: daily digest, exception summary, buying/staff/manager summaries from Data Health facts.
    - Why now: after exception data exists, AI can be useful without becoming slow.
    - Business value: owner asks one question and gets priorities.
    - Risk: context bloat.
    - Complexity: Medium.
    - Files/areas: `lib/secretary/context.ts`, Data Health summary.
    - Codex or Cline: Codex.
    - Push: no push requested unless owner asks.

Recommended immediate Phase 4:

- Treat the next immediate build as "Speed and Today clarity" even if internally it becomes v7.6.0. Do not build buying automation, manager historical import, or file downloads before the daily dashboard is fast and trusted.

## 18. Quick Wins

| Improvement | Expected impact | Risk | Files likely touched |
| --- | --- | --- | --- |
| Rename Owner Command Center for managers | Reduces role confusion | Low | `app/app/today/page.tsx` |
| Remove duplicate Yesterday Sales Reports section | Less scroll and load | Low | `app/app/today/page.tsx` |
| Move generic status cards behind More | Cleaner Today | Low | Today components |
| Lazy-load stock pulse | Faster first render | Medium | Today, stock component |
| Lazy-load weekly audit | Faster audit-day load | Medium | Today/audit components |
| Add "No store assigned" manager state | Clear manager setup issue | Low | Today/layout |
| Reorganize Reports cards | Better navigation | Low | `app/app/reports/page.tsx` |
| Add helper copy to Historical Import file reselect | Less preview confusion | Low | sales correction form |
| Add warnings linking directly to filtered action pages | Faster fixing | Low | warning components |
| Add empty states for missing staff/stock/sales | Less confusion | Low | report pages |
| Add loading skeletons for lazy panels | Better perceived speed | Low | new components |
| Add mobile card rows for Staff Sales | Mobile usability | Medium | staff page |
| Add "latest stock month is not live inventory" stronger banner | Better buying trust | Low | business/stock pages |
| Add Reports shortcut for Receivables | Owner payroll clarity | Low | Reports page |
| Add Data Health placeholder card | Sets navigation expectation | Low | Reports page |

## 19. Risky Builds To Delay

- Manager historical import: high risk because replacing financial-year history should remain owner-only until a manager-safe skip-only policy is designed.
- Uploaded-file download before storage review: broad authenticated storage select must be tightened or wrapped safely first.
- Live purchase order automation: buying signals need confidence, supplier mapping, and owner review first.
- Incentives/payroll automation: staff alias correctness and salary rules must be stable first.
- SaaS/multi-tenant public signup: current app is business-specific and not ready for public tenant isolation.
- Auto-delete/auto-repair reports: destructive data changes must stay owner-confirmed with audit logs.
- Parser auto-inference for sizes from item names: can create false buying quantities.
- Fully automatic AI actions: AI should summarize and suggest, not mutate business data.

## 20. Verification

Commands requested:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `git status`
- `git log --oneline -25`

Results:

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Next.js 16.2.6 compiled successfully and generated 38 static pages.
- `git status --short`: only `docs/REAL_USE_PERFORMANCE_CONFUSION_AND_ROADMAP_AUDIT.md` was untracked before commit.
- `git log --oneline -25` before audit commit:
  - `777d907 feat: add last month and custom date range to staff sales report`
  - `62ad712 add historical sales import guardrails and release 7.5.0`
  - `e4fe503 fix staff alias unmatched report warnings`
  - `730fbeb add suspicious sales report detector and release 7.4.0`
  - `e5df6b1 add password account recovery and release 7.3.0`
  - `9c93377 add full webapp confusion permission and feature gap audit`
  - `2833a14 fix staff alias server action export`
  - `5f165db add fix staff names shortcuts and alias audit logs`
  - `05c8ec7 add unmatched staff alias workflow audit`
  - `c67b68a explain sales report delete replace workflow`
  - `7c64a5b add daily sales zero after upload audit`
  - `b9f97a7 add daily sales upload status card and release 7.2.0`
  - `e9cbfc0 add manager daily sales visibility audit`
  - `9ce7a0f fix duplicate today shortcut key`
  - `1c391ab fix mobile header logout and date layout`
  - `07449dc polish owner command center and buying workflow`
  - `38d306d fix mobile app header and add refresh control`
  - `97f0ad6 add owner workflow reality audit`
  - `4b69e85 release version 6.0.0 with auth and performance fixes`
  - `beca9e4 add business reporting phase 2 actions`
  - `2517299 add business reporting dashboard phase 1`
  - `9b50795 add sales correction center and bulk upload`
  - `fc65969 add correction and bulk sales schema`
  - `2c80e7d add business autopilot full audit`
  - `88c0c2d emergency add owner creation and staff sales visibility`

## 21. Git

Expected commit:

`add real use performance confusion and roadmap audit`

Push status:

Do not push.

## Final Snapshot

- Audit file: `docs/REAL_USE_PERFORMANCE_CONFUSION_AND_ROADMAP_AUDIT.md`
- Overall readiness rating: 7/10
- Speed rating: 5.5/10
- Slowest pages: `/app/today`, `/app/reports/stock/analytics`, `/app/reports/business`, `/app/stores/[storeId]`, AI Secretary prompt context
- Top immediate build: Speed and Today v2 clarity
- Biggest trust build after that: Data Health Center plus Historical Completion Dashboard
- Biggest manager build: role-specific manager dashboard
- Biggest buying build: brand/product/size drilldowns with reorder suggestions
- Risky builds to delay: manager historical import, file download before storage review, purchase automation, payroll automation, public SaaS signup, auto-delete/auto-repair

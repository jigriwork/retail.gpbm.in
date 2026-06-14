# Full Webapp Confusion Permission And Feature Gap Audit

Date: 2026-06-14

Version: v7.2.0

Scope: audit-only review of workflow confusion, missing shortcuts, route guards, manager permissions, password/account recovery, data-quality glitches, performance risks, mobile UX, and future features. No code, schema, parser, RLS/security, uploaded data, reports, or rows were changed.

## 1. Executive Summary

Overall app readiness: 7/10.

The app has strong business foundations: sales upload, stock upload, buying/restock reporting, staff sales, staff aliases, store detail pages, tasks, checklists, reviews, manager updates, weekly audit, payslips, receivables, and owner-only correction tools are all present. The main problem is not absence of core modules. The main problem is that the app feels like many powerful tools placed in different rooms, not yet one guided business autopilot.

Ratings:

| Area | Rating | Reason |
| --- | ---: | --- |
| Owner usability | 7/10 | Many actions exist, but Today is crowded and some critical warnings/actions are still scattered. |
| Manager usability | 6.5/10 | Managers can do assigned-store work, but guidance and shortcuts are uneven. |
| Navigation clarity | 6/10 | Reports mixes uploads, analytics, correction, salary, staff, and buying. |
| Shortcut completeness | 6/10 | Core shortcuts exist; password, audit, suspicious data, summary repair, and manager action shortcuts are missing. |
| Daily sales workflow | 7/10 | Upload and status exist; suspicious zero-sales and format guidance need stronger prevention. |
| Stock/purchasing workflow | 7/10 | Buying & Restock is useful; needs product/brand drilldowns, purchase drafts, and clearer freshness. |
| Staff sales workflow | 7/10 | Aliases now have shortcuts; summary warnings can remain stale after alias fixes. |
| Data correction workflow | 7/10 | Delete/replace/bulk exist owner-only; no download, reprocess, summary recalculation, or rollback. |
| Reporting clarity | 6.5/10 | Many reports exist, but grouping and labels need owner-decision framing. |
| Performance readiness | 6/10 | Today and Business Reporting can grow heavy as uploads increase. |
| Business autopilot readiness | 5.5/10 | Good data blocks exist; proactive exception queue is still missing. |
| Password/account recovery readiness | 2/10 | No forgot password, no change-password page, no owner reset/send-reset workflow. |
| User management security readiness | 6/10 | Owner-only creation/assignment exists; no password lifecycle, audit logs, or first-login change. |
| Manager permission safety | 8/10 | Strong RLS/app checks overall; storage object select and manager alias edits are the main risks. |
| Store assignment isolation safety | 8/10 | Assigned-store filtering is consistent for most tables; staff directory depends on contacts being created. |

Biggest 10 confusions:

1. Today is trying to be dashboard, command center, audit page, task page, upload monitor, stock page, payroll reminder, and store list at once.
2. Reports page mixes owner decisions, uploads, staff tools, salary attendance, correction, payslips, and staff directory without sectioning.
3. A processed sales report can still be analytically wrong if parser mapping fails.
4. Staff Sales can show no data when the uploaded report has no staff column, but that explanation is not always near the user action.
5. Unmatched staff warnings from `reports.summary` may remain after aliases are fixed because summaries are not recalculated.
6. Salary Attendance and Payslip Generation are separate concepts but appear close together.
7. Managers can upload salary attendance files, while payslips are owner-only; this may sound like salary access even though it is only attendance files.
8. Store Detail repeats Today/Reports information but does not fully become a manager home dashboard.
9. Correction Center can fix data, but owner cannot download/open the uploaded file before deciding.
10. Password/account recovery is invisible; users may assume only developer/Supabase access can rescue accounts.

Biggest 10 missing shortcuts:

1. Change My Password.
2. Forgot Password.
3. Owner Send Password Reset Link.
4. Suspicious Zero Sales Reports.
5. Recalculate Report Summary / Clear Staff Alias Warning.
6. Reprocess Report With Latest Parser.
7. Owner Audit Logs.
8. Manager Action Log.
9. Manager Store Dashboard.
10. Missing Uploads exception queue.

Biggest 10 hidden glitch risks:

1. `reports` row inserted, but `sales_rows` insert fails afterward and report remains processed.
2. `row_count > 0`, but `summary.totalNetSale = 0` and persisted rows have zero/null sales.
3. Report summary differs from `sales_rows` after repair or future manual changes.
4. Staff alias fixes do not update old `reports.summary`.
5. Manager alias edits can instantly change old analytics with no durable owner-visible audit if audit RLS blocks log insert.
6. Storage object select policy allows any authenticated user to select report files if a signed/download path is later exposed incorrectly.
7. Brand Mark manager may see no staff if `employee_contacts` were never created for Brand Mark, even though RLS allows them.
8. Stock month can become stale but still drive Buying & Restock.
9. Timezone/yesterday confusion can send users to the wrong date.
10. Large bulk history can make Today/Business/Correction slow without pagination and exception-first loading.

Biggest manager permission risks:

1. Storage `reports` bucket select is broad for authenticated users; no current download UI, but risky for future file-view features.
2. Managers can update aliases for assigned stores, including aliases created by owner.
3. Manager alias audit logs are best-effort and may fail under current owner-only `audit_logs` insert policy.
4. Managers can upload salary attendance for assigned stores; wording must make clear this is not payslip/salary access.
5. Staff Phone Directory allows managers to create/deactivate contacts in assigned stores; intended, but needs action logging.
6. `assignManagerToStore` can assign any store passed in, while multi-assignment limits active GP/BM only. It is owner-only, but behavior is inconsistent.
7. Tasks assigned directly to a manager can be visible even outside store scope if not private; this may be intended but should be explicit.
8. Manager can access Weekly Audit for assigned stores; safe, but it exposes more performance context than a simple daily checklist.
9. Managers may see Reports cards that lead to pages they can use but that sound owner-level, such as Buying & Restock.
10. Inactive-store hiding depends on `stores.is_active` and app/RLS patterns; keep MITTY covered by regression tests.

Top 10 future features:

1. Password/account recovery suite.
2. Suspicious report detector and exception inbox.
3. Recalculate/reprocess sales report summary.
4. Owner audit log center including manager actions.
5. Manager Store Dashboard.
6. Staff contact auto-seed from sales staff names.
7. Buying assistant product/brand drilldown and purchase draft.
8. Signed owner-only uploaded-file download/view.
9. Today performance split with lazy sections.
10. AI Secretary daily proactive summary with data-quality warnings.

Recommended next 5 builds:

1. Password/account recovery and Settings account page.
2. Suspicious sales report detector plus Today/Reports/Correction warning center.
3. Staff directory/alias cleanup: auto-create staff contacts from sales names, recalculate unmatched summaries, owner alias-change log.
4. Today v2: exception-first dashboard and lazy-loaded lower sections.
5. Manager permission and action audit hardening, including storage policy review before file downloads.

## 2. Main Page / Today Audit

Route: `/app/today`.

Today is useful but too crowded. It contains identity, command shortcuts, daily sales status, AI Secretary, staff phones, payslips, sales pulse, stock workflow, checklist, reviews, tasks, salary workflow, updates, manager quick actions, stores, yesterday reports, and status cards. This is powerful but mentally expensive on mobile.

What works:

- Owner Command Center is useful and now includes Buying & Restock, Upload Daily Sales, Staff Sales, Fix Staff Names, Fix Wrong Upload, AI Secretary, tasks, checklist, stock.
- Fix Wrong Upload is owner-only in the command shortcut filter.
- Fix Staff Names is visible when stores exist.
- Daily Sales Upload Status shows file name, uploaded by, upload time, total sale, bills, returns, unmatched staff, and store-scoped action links.
- Manager data uses `getAccessibleStores(profile)` and should be limited to assigned active stores.
- AI Secretary and payslip sections are owner-only.

Confusions:

- Header says Owner Command Center even for managers.
- Daily Sales Upload Status is valuable but competes with many lower sections.
- Salary/payslip cards are mixed with sales/stock/store operations.
- Manager Quick Actions appears far below another command center.
- Yesterday Sales Reports partly duplicates Daily Sales Upload Status and Sales Pulse.
- Staff phones card may appear as a business priority even when no phone work is urgent.

Heavy sections:

- Sales pulse calls sales summaries and staff summaries.
- Stock pulse calls stock analytics after latest month.
- Weekly audit can call multiple summaries on audit day.
- Checklists, reviews, updates, tasks, salary overview, stock overview, and sales statuses all load on first render.

Today top 10 cards/shortcuts for owner:

1. Missing/Suspicious Uploads.
2. Upload Daily Sales.
3. Daily Sales Upload Status.
4. Buying & Restock.
5. Staff Sales.
6. Fix Staff Names.
7. Fix Wrong Upload.
8. Stock Upload/Stock Status.
9. Manager Updates / Urgent Issues.
10. AI Secretary daily summary.

Today top 8 cards/shortcuts for manager:

1. My Store Dashboard.
2. Upload Daily Sales.
3. Upload Stock.
4. Fix Staff Names.
5. Staff Sales.
6. Checklist.
7. Tasks.
8. Add Store Update.

Sections to remove from first load:

- Recent store list.
- Generic status cards.
- Yesterday Sales Reports duplicate section.
- Owner Life/Payroll-adjacent cards unless urgent.

Sections to lazy-load:

- Sales pulse.
- Stock pulse.
- Weekly audit.
- Reviews history/status.
- Manager updates feed.
- Checklist details.

Sections to move to Reports/Settings:

- Salary workflow detail.
- Staff Phone Directory except urgent missing-phone count.
- App release.
- Store targets.
- Firm mapping.

Owner-only sections that must stay hidden from managers:

- AI Secretary.
- Payslip generation and receivables.
- Fix Wrong Upload / Correction Center.
- Users.
- Store target editing.
- Firm mapping.
- Owner personal Life Flow.

Manager data isolation:

- Today uses accessible stores for sales, stock, salary attendance, reviews, updates, checklist, tasks, staff sales, missing phones.
- No direct evidence of unassigned-store data in Today.
- Risk remains in storage object access if future file links are added without owner/assigned-store signed URL checks.

## 3. Navigation / Shortcut Audit

Shortcut matrix:

| Shortcut | Exists | Where | Owner | Manager | Today? | Reports? | Owner-only? | Manager-safe? | Recommended label |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Upload Daily Sales | Yes | Today, Reports, Sales Upload | Yes | Yes assigned stores | Yes | Yes | No | Yes | Upload Daily Sales |
| Daily Sales Upload Status | Yes | Today, Reports status | Yes | Yes assigned stores | Yes | Partial | No | Yes | Daily Sales Status |
| Fix Wrong Upload | Yes | Today owner, Reports, Correction | Yes | Hidden/blocked | Yes | Yes | Yes | Yes | Fix Wrong Upload |
| Fix Staff Names | Yes | Today, Staff Sales, Correction, Store Detail, Reports | Yes | Yes assigned stores | Yes | Yes | No | Yes | Fix Staff Names |
| Buying & Restock | Yes | Today, Reports | Yes | Yes assigned stores | Yes | Yes | No | Yes | Buying & Restock |
| Staff Sales | Yes | Today, Reports, Store Detail | Yes | Yes assigned stores | Yes | Yes | No | Yes | Staff Sales |
| Sales Analytics | Yes | Reports | Yes | Yes assigned stores | Optional | Yes | No | Yes | Sales Analytics |
| Stock Upload | Yes | Today, Reports | Yes | Yes assigned stores | Yes | Yes | No | Yes | Upload Stock |
| Stock Analytics | Yes | Reports, Stock page | Yes | Yes assigned stores | Optional | Yes | No | Yes | Stock Analytics |
| Business Reports / Downloads | Yes | Today, Business page actions | Yes | Yes assigned stores | Yes | Yes | No | Yes | Business Reports / Downloads |
| Salary Attendance | Yes | Today, Reports | Yes | Yes assigned stores | Lower | Yes | No | Sensitive label | Salary Attendance Upload |
| Payslip Generator | Yes | Today owner, Reports owner | Yes | Hidden/blocked | Lower | Yes | Yes | Yes | Payslip Generator |
| Receivables | Partial | Payslips page | Yes | No | Optional owner | Missing from Reports | Yes | Yes | Salary Receivables |
| Users / Manager creation | Yes | Header Users | Yes | Hidden/blocked | Maybe Settings | Missing Reports/Admin | Yes | Yes | Users & Managers |
| Store Targets | Yes | Settings | Yes edit, manager view enabled | No | No | Yes | Owner edit | Mostly | Store Targets |
| Staff Contacts | Yes | Reports, Settings, Today phone card | Yes | Yes assigned stores | Maybe urgent only | Yes | No | Yes | Staff Phone Directory |
| Missing Uploads | Partial | Today/Reports inline | Yes | Yes assigned stores | Yes | Missing exception page | No | Yes | Missing Uploads |
| Suspicious Zero Sales Report | Partial | Zero values visible, no detector | Yes | Yes assigned stores | Needed | Needed | No | Yes | Suspicious Reports |
| Recalculate Report Summary | No | None | Needed | Maybe no | Needed owner | Needed correction | Owner preferred | Risky | Recalculate Summary |
| Bulk Historical Upload | Yes | Correction Center | Yes | No | Owner lower | Yes | Yes | Yes | Bulk Historical Sales Upload |
| Change My Password | No | None | Needed | Needed | Settings | Settings | No | Yes | Change My Password |
| Forgot Password | No | None | Needed | Needed | Login | Login | No | Yes | Forgot Password |
| Send Password Reset Link | No | None | Needed | No | Users | Users | Yes | Yes | Send Reset Link |
| Manager Store Dashboard | Partial | Store Detail | Yes | Yes assigned | Yes manager | Maybe | No | Yes | My Store Dashboard |
| Manager Assigned Store Tasks | Yes | Today, Tasks | Yes | Yes assigned | Yes | No | No | Yes | My Store Tasks |
| Owner Audit Logs | Partial | Correction recent logs only | Yes | No | Optional | Admin | Yes | Yes | Audit Logs |
| Manager Action Log | No | None | Needed | Maybe own actions | Owner admin | Admin | Owner review | Needs guard | Manager Action Log |

## 4. Owner Workflow Audit

Daily morning:

- Can complete today: mostly yes.
- Where: Today, Reports, Staff Sales, Buying & Restock, Tasks, Updates.
- Confusing: Too much scrolling, duplicate sales sections, payroll cards mixed into daily operations.
- Missing shortcut/data: consolidated exception queue, suspicious report detector, stale stock warning.
- Missing warning: report uploaded but suspicious zero sales.
- Priority: Critical.

Purchasing:

- Can complete today: partly.
- Where: Buying & Restock, Stock Analytics.
- Confusing: Needs more drilldown from brand/category/product into one purchase decision.
- Missing shortcut/data: product detail, brand detail, supplier mapping, purchase draft, size-level reorder.
- Missing warning: latest stock month freshness.
- Priority: High.

Wrong upload:

- Can complete today: delete/replace yes; repair/reprocess limited.
- Where: Correction Center.
- Confusing: Owner cannot open/download original file.
- Missing shortcut/data: suspicious report inbox, reprocess parser, recalculate summary, rollback.
- Missing warning: summary-vs-rows mismatch detector.
- Priority: Critical.

Staff performance:

- Can complete today: mostly.
- Where: Staff Sales, Sales Analytics, Staff Aliases.
- Confusing: source file without staff column yields no staff sales; stale unmatched warnings after alias fix.
- Missing shortcut/data: zero-sale staff, target progress by staff, alias history/revert.
- Missing warning: staff column missing.
- Priority: High.

Store operations:

- Can complete today: yes.
- Where: Tasks, Checklist, Updates, Reviews, Weekly Audit, Store Detail.
- Confusing: Store Detail and Today overlap.
- Missing shortcut/data: owner exception queue by store.
- Missing warning: missed checklist/review trend.
- Priority: Medium.

User/password management:

- Can complete today: create/deactivate/assign managers yes; password recovery no.
- Where: Users.
- Confusing: owner sets temporary password manually; no reset link.
- Missing shortcut/data: change own password, forgot password, send reset, force first-login change.
- Missing warning: no audit log for user actions.
- Priority: Critical.

Manager control:

- Can complete today: assign stores and deactivate managers yes.
- Where: Users, Today, Reports, RLS.
- Confusing: no permission matrix page; no "view as manager".
- Missing shortcut/data: manager action log, manager alias changes, upload history by manager.
- Missing warning: manager has no assigned stores.
- Priority: High.

## 5. Manager Workflow Audit

Manager journeys:

| Journey | Current status | Confusion/risk | Priority |
| --- | --- | --- | --- |
| Upload daily sales | Works for assigned stores | Needs stronger file-format guidance and suspicious result warning | High |
| Upload stock | Works for assigned stores | Needs latest month/freshness clarity | Medium |
| Fix staff names | Works for assigned stores | Can make wrong mapping; audit log best-effort only | High |
| View assigned store status | Works through Today/Store Detail | Needs dedicated manager dashboard | High |
| Checklist/tasks | Works | Shortcuts lower than ideal | Medium |
| Send updates | Works | Good enough | Medium |
| See owner expectations | Partial | No daily expected-actions checklist at top | High |
| Change own password | Missing | Must contact owner/developer today | Critical |
| Recover forgotten password | Missing | No forgot password flow | Critical |
| Check only assigned reports | Mostly works | Recent report lists rely on RLS, okay | High |
| Avoid owner-only areas | Mostly works | Some labels sound owner-like but data guarded | Medium |

Manager direct URL access:

- Correction Center returns AccessDenied because page uses `requireOwner`.
- Users returns AccessDenied because page uses `requireOwner`.
- AI Secretary returns AccessDenied because page uses `requireOwner`.
- Payslips and Receivables return AccessDenied via role checks.
- Life Flow returns AccessDenied via `requireOwner`.
- Settings is accessible but hides owner edit forms.
- Salary Attendance is accessible to managers for assigned stores by design.
- Staff Phone Directory is accessible to managers for assigned stores by design.

Manager with no assigned store:

- `getAccessibleStores` returns empty.
- Upload pages show no active assigned store.
- Today still renders many sections with empty store data, which is safe but not helpful.
- Recommended: show a clear "No store assigned" manager home with owner contact and hide empty analytics sections.

Brand Mark manager cannot see Brand Mark staffs:

- Code allows manager staff contacts for assigned active stores through `employee_contacts_manager_select_assigned`.
- Employee page also filters contacts to `allowedStoreIds`.
- If a Brand Mark manager sees no Brand Mark staff, the likely issue is not a manager RLS denial; it is that Brand Mark staff contacts do not exist in `employee_contacts`, are inactive, or the manager is missing the Brand Mark `store_users` assignment.
- Another likely cause: staff contacts are created mainly by owner-only `syncStaffFromPayslips`; if Brand Mark contacts were never seeded from payslip rows or manually added, manager has nothing to see.
- Recommended first fix: add "Sync/Create staff contacts from sales staff names" or owner action to seed contacts per store, then add a visible warning: "No staff contacts found for your assigned store."

## 6. Manager Permission / Store Isolation Audit

Manager permission safety rating: 8/10.

Store isolation rating: 8/10.

Module matrix:

| Module | Direct URL manager access | Navigation | Unassigned data risk | Owner action risk | Server guard/RLS |
| --- | --- | --- | --- | --- | --- |
| Today | Yes | Bottom nav | Low | Low | Uses accessible stores and role checks |
| Reports | Yes | Bottom nav | Low | Medium label confusion | Uses accessible stores/RLS; owner cards hidden |
| Store Detail | Assigned only | Stores | Low | Low | `canAccessStore` guard |
| Upload Daily Sales | Yes | Reports/Today | Low | Low | `canAccessStore` plus RLS insert |
| Upload Stock | Yes | Reports/Today | Low | Low | `canAccessStore` plus RLS insert |
| Staff Sales | Yes | Reports/Today | Low | Low | accessible stores plus RLS |
| Staff Aliases | Yes | Reports/Today | Low | Medium wrong mapping | app checks plus RLS |
| Buying & Restock | Yes | Reports/Today | Low | Low | accessible stores plus RLS |
| Sales Analytics | Yes | Reports | Low | Low | accessible stores plus RLS |
| Stock Analytics | Yes | Reports | Low | Low | accessible stores plus RLS |
| Correction Center | Blocked | Hidden | Low | Low | `requireOwner` page/actions |
| Sales repair/delete/replace | Blocked | Hidden | Low | Low | server actions require owner |
| Bulk Historical Upload | Blocked | Hidden | Low | Low | owner correction action |
| Users | Blocked | Header owner only | Low | Low | `requireOwner` |
| Settings | Yes | Header | Low | Medium label | owner forms hidden; actions owner guarded |
| Store Targets | Read if enabled | Settings | Low | Low | manager view only |
| AI Secretary | Blocked | Bottom owner only | Low | Low | `requireOwner` |
| Payslips | Blocked | Hidden | Low | Low | role guard |
| Salary Attendance | Yes | Reports/Today | Low | Low | intended assigned-store upload |
| Receivables | Blocked | Hidden | Low | Low | role guard |
| Weekly Audit | Yes assigned | Store/Audit | Low | Medium sensitivity | accessible stores/RLS |
| Tasks | Yes | Bottom nav | Medium assigned_to exception | Low | RLS allows store or assigned_to, non-private |
| Checklist | Yes | Today/Bottom? | Low | Low | assigned stores |
| Manager Updates | Yes | Today/Updates | Low | Low | RLS assigned store |
| Audit Logs | Correction only | Hidden | Low | Low | owner select only |
| Employee Contacts | Yes | Reports/Settings | Low | Medium edits | app checks plus RLS |
| File/storage access | No UI link | None | Medium latent | Medium | storage select is broad authenticated |

Leaks found:

- No confirmed page-level unassigned-store leak in inspected routes.
- Latent storage leak risk: `storage_reports_authenticated_select` allows authenticated select on all report objects. Safe only while no broad file browser/download UI exists.

Over-permissions:

- Manager can update owner-created aliases in assigned stores.
- Manager can create/deactivate staff contacts in assigned stores. This appears intended but lacks audit logs.
- Salary attendance upload by manager may be intended, but it sounds close to salary/payroll.

Route-level guard gaps:

- No critical owner-only route guard gap found for Users, Correction, Secretary, Payslips, Receivables, Life Flow.
- Settings is not owner-only, but owner-only forms are hidden; action guards still matter.

RLS mismatch risks:

- Manager alias audit writes can fail because `audit_logs` insert is owner-only.
- Storage policy is broader than store assignment.
- `reports_manager_insert_assigned` requires uploaded_by, but `sales_rows_manager_insert_assigned` and `stock_rows_manager_insert_assigned` only check store assignment, not report ownership. App code controls this, but RLS is less strict than ideal.

## 7. Daily Sales Upload Workflow Audit

Current flow:

- Upload page parses `.xlsx`, `.xls`, `.csv`.
- Manager can upload assigned stores.
- Duplicate same store/date report is blocked.
- Multi-date daily file is blocked.
- Store column mismatch is blocked if a store column exists.
- Upload success shows unmatched staff and alias link.
- Today shows upload status and Fix Staff Names.
- Correction Center is owner-only for delete/replace/bulk.

Issues:

- Parser/data-shape issue can create processed reports with rows but zero analytic values.
- Upload can insert `reports` before `sales_rows`; row insert failure leaves report/storage behind.
- No hard validation rejects row_count > 0 with all net sale zero while raw amount columns exist.
- Summary file versus staff-wise file confusion remains.
- Missing staff column warning is not strong enough before accepting staff expectations.
- File name/uploaded by/upload time are not consistently visible on all report lists.
- No download/open uploaded file.
- No reprocess/repair path for parser alias fixes.

Recommendations:

- Add suspicious zero-sales detector: row_count > 0, totalNetSale = 0, billCount = 0, no staff names.
- Add parser validation for raw amount columns not mapped.
- Add "This file has no staff column; Staff Sales will be unavailable" warning.
- Make reports insert transactional-like: delete/mark failed if row insert fails.
- Add owner-only reprocess with latest parser.
- Add owner-only signed download/view uploaded file.
- Add manager upload guidance with accepted file examples.

## 8. Staff Alias / Unmatched Staff Audit

Current strengths:

- Fix Staff Names shortcuts now exist on Today, Staff Sales, Correction, Store Detail, and Reports.
- Alias page allows owner and managers for assigned active stores.
- Same-store contact validation exists.
- Aliases apply dynamically to old analytics.

Remaining gaps:

- `reports.summary.unmatchedStaffCount` is not recalculated after alias fixes.
- Alias audit logs are best-effort and may fail for managers.
- No owner review page for manager alias changes.
- No alias history/revert.
- Manager can update owner-created alias.
- No duplicate warning beyond unique constraint/upsert behavior.
- Staff contacts must exist or be created; Brand Mark manager may see no staff contacts if not seeded.

Recommendations:

- Add Recalculate Unmatched Staff Summary action.
- Add Recent Alias Changes owner view.
- Add alias history/revert.
- Add warning when mapping two active source names to one contact.
- Seed employee contacts from sales staff names by store.
- Consider owner review mode if incentives/payroll depend on staff sales.

## 9. Stock / Purchasing / Buying Audit

Current strengths:

- Buying & Restock can search brand, category, product, and size.
- It combines sales and stock rows.
- It has CSV/share/WhatsApp-style report actions.
- Stock Analytics includes slow/dead/high-stock/fast-moving low-stock candidates.
- Manager data is assigned-store restricted.

Gaps:

- No product detail page.
- No brand detail page.
- No supplier mapping.
- No purchase order draft.
- No "latest stock is stale" warning.
- No live stock; stock is monthly/latest upload.
- Size-wise reorder exists in report data but needs a more purchasing-oriented screen.
- No barcode/SKU confidence warning on main cards.
- No "avoid buying" workflow with reason and export.

Future purchasing assistant features:

- Brand drilldown.
- Product drilldown.
- Size-wise purchase suggestion.
- Supplier mapping.
- Purchase order draft.
- Dead stock action plan.
- Stock freshness warning.
- Markdown/WhatsApp buying summary.
- Vendor-wise open purchase list.
- Compare last 7/30/90 day sales versus current stock.

## 10. Reports Page Audit

Route: `/app/reports`.

Current issue: Reports is a catch-all. Cards are useful but not grouped by decision type.

Recommended grouping:

- Owner Decisions: Buying & Restock, Business Reports / Downloads, AI Secretary.
- Uploads: Daily Sales, Stock, Salary Attendance.
- Staff: Staff Sales, Fix Staff Names, Staff Phone Directory.
- Corrections: Data Correction Center, Suspicious Reports, Bulk Historical Upload.
- Payroll: Payslips, Receivables, Salary Attendance.
- Admin: Users, Audit Logs, Store Targets, Settings.

Manager visibility:

- Manager sees usable cards for uploads/analytics/staff/stock/salary attendance.
- Owner-only correction/payslip cards are hidden.
- Manager should get a smaller "My Store Work" Reports view, not the same broad owner decision layout.

Missing cards:

- Suspicious Reports.
- Recalculate Summary.
- Password/Account.
- Owner Audit Logs.
- Manager Action Log.
- Receivables direct card.
- Store Targets/Users admin cards.

## 11. Correction Center Audit

Route: `/app/reports/correction`.

Current strengths:

- Owner-only page and server actions.
- Can filter by store/date/file.
- Shows report id, file path, uploaded by/time, rows, total sale, bills, returns, unmatched staff.
- Delete, replace, bulk upload exist.
- Recent correction audit logs visible.
- Unmatched staff shortcut exists.

Missing correction features:

- Suspicious report detector.
- Download/open uploaded file.
- Reprocess with latest parser.
- Recalculate summary.
- Clear unmatched warning after alias fix.
- Repair zero totals from raw_data.
- Rollback/restore deleted report.
- Summary-vs-sales_rows mismatch checker.

Manager access:

- Manager route direct URL is blocked with AccessDenied.
- Correction server actions require owner.

## 12. Suspicious Data / Glitch Risk Audit

| Risk | Current detection | Current warning | Risk | Recommended fix |
| --- | --- | --- | --- | --- |
| Report exists but rows missing | Partial via analytics zero | No explicit | Critical | Transaction cleanup/failed status |
| Row count > 0 but sale 0 | Visible values | No detector | Critical | Suspicious report warning |
| Summary differs from rows | No | No | High | Summary consistency job |
| Duplicate staff aliases | Unique source constraint | No UX warning | Medium | Duplicate/merge warning |
| Wrong manager alias mapping | No | No | High | Audit/review/revert |
| Stock month stale | Latest month shown | Weak | High | Freshness warning |
| Wrong store file | Store column only if present | Partial | High | Filename/store heuristics |
| Multi-date file | Blocked | Yes | Medium | Better path to bulk upload |
| Timezone/yesterday confusion | India helpers | Partial | Medium | Show exact dates |
| Unsupported format accepted | Extensions checked | Yes | Medium | Better parse diagnostics |
| Missing staff column | Partial | Weak | High | Staff-sales warning before submit |
| Missing size column | Weak | No | Medium | Buying report data-quality note |
| Brand/category spelling variants | No | No | Medium | Alias/normalization master data |
| Product search limitations | Server report query but large results risk | No | Medium | Pagination/drilldowns |
| Today stale warnings | Known | No explanation | Medium | Recalc summary action |
| Manager audit log blocked | Known | No UI | High | RLS/admin audit path |
| Password reset gaps | No | No | Critical | Recovery workflow |
| Manager route leak | Mostly guarded | N/A | Low | Regression tests |
| Cross-store data leak | RLS mostly strong | N/A | Low | Store isolation tests |
| MITTY inactive appears | Active filters mostly used | No regression test | Medium | Inactive store test |

## 13. Performance Audit

High-risk pages as data grows:

- Today: many parallel summaries and sections.
- Business Reporting: can scan large sales/stock sets over year/custom periods.
- Stock Analytics: product matching and candidate calculations can grow expensive.
- Sales Analytics: trend/rank calculations over large sales history.
- Staff Sales: staff aggregation plus report-summary warning query.
- Correction Center: paginated reports okay, but audit/report details can grow.
- AI Secretary context: should stay compact and exception-based.
- Store Detail: many summaries for one store in one load.

Recommended performance fixes:

- Split Today into top exception summary plus lazy lower panels.
- Add pagination/drilldowns to Business Reporting.
- Add query indexes for common store/date/brand/category/staff filters; some business indexes already exist.
- Add summary materialization for common daily/monthly widgets.
- Add server-side pagination to staff/contact lists.
- Cache stable settings/store lists per request.
- Keep AI context summarized, not raw.

## 14. Role & Permission Audit

Owner-only actions hidden/guarded:

- Users creation/assignment/deactivation: yes.
- Correction delete/replace/bulk: yes.
- Payslip generation/receivables: yes.
- AI Secretary: yes.
- Life Flow: yes.
- Store target and firm edit: page hides for manager, actions should remain owner guarded.

Manager-safe actions:

- Upload assigned sales/stock/salary attendance.
- View assigned analytics.
- Manage staff aliases/contacts assigned stores.
- Tasks/checklists/reviews/updates assigned stores.

Needs audit logs:

- User creation.
- User activation/deactivation.
- Store assignment changes.
- Manager uploads.
- Manager staff contact edits.
- Manager alias changes.
- Password reset/send reset.

## 15. Password / Login / Account Recovery Audit

User password change:

- Logged-in owner cannot change own password from inside app.
- Logged-in manager cannot change own password from inside app.
- No Change Password page.
- No Settings/Profile account section.
- No old-password confirmation flow.
- No success/error UX.
- No forced re-login flow.

Owner resetting manager password:

- Owner cannot reset manager password today.
- Owner cannot send password reset email today.
- Owner can create a user with a manually typed temporary password using Supabase admin createUser.
- No force password change on next login.
- Service role support exists server-side in `createAdminClient`, and user creation uses it owner-only.
- No password reset audit logs.

Forgot password:

- Login page has no Forgot Password link.
- No reset email request form.
- No reset password route.
- Supabase redirect/site URL setup is unknown from code.
- Manager who forgets password must contact owner/developer.
- Owner who forgets password has no app-level recovery path.
- Email delivery production setup not verified.

User creation password flow:

- Owner manually types a temporary password.
- Password is sent to Supabase admin API, not stored in profile tables.
- Temporary password can be revealed in browser via show/hide button while owner types it.
- Manager does not receive invite/reset email.
- No first-login password change.

Security risks:

- No hardcoded password found in inspected code.
- No password stored in profile table in inspected code.
- Service role key is read only server-side.
- No manager reset route found.
- Missing rate limiting on login/forgot password would need platform/Supabase support.
- Missing audit logs for user/password actions.

Password workflow readiness: 2/10.

Owner password control readiness: 3/10.

Manager self-service readiness: 1/10.

Forgot password readiness: 1/10.

Security readiness: 6/10 for current absence of reset features, but 2/10 for operational account recovery.

Recommended password/account fixes:

1. Add Settings/Profile Account page.
2. Add Change My Password for all logged-in users using Supabase `updateUser`.
3. Add Forgot Password on login using Supabase reset email.
4. Add reset password callback/page.
5. Add owner-only Send Password Reset Link for managers.
6. Consider owner-only temporary password reset if operationally required.
7. Add first-login password-change flag if possible.
8. Add audit logs for user creation, reset link, password reset, activation, role changes, assignment changes.

## 16. AI Secretary Audit

Current context likely includes:

- Sales status/latest uploads.
- Month sales.
- Top staff yesterday.
- Stock/restock context.
- Tasks/updates/checklist summaries.
- Weekly audit prompts.
- Owner memories and chat history.

Gaps:

- Does not appear to include unmatched staff names/action guidance.
- Does not explicitly include suspicious zero-sales reports.
- Does not include manager action logs.
- Does not include alias changes.
- Does not include password/account/security state.
- Context can become heavy if expanded naively.

Recommended improvements:

- Daily owner summary.
- Missing upload warning.
- Suspicious report warning.
- Restock urgent summary.
- Staff performance summary.
- Manager action summary.
- Permission/security summary.
- "What should I fix first?" prompt.

## 17. Mobile UX Audit

PWA mobile strengths:

- Bottom navigation is simple.
- Buttons are generally large enough.
- Cards are readable.
- Upload forms are straightforward.

Mobile issues:

- Today requires too much scrolling before all important actions are seen.
- Wide tables in Staff Sales, Sales Analytics, Business Reporting, Receivables need horizontal scroll.
- Reports cards are long and mixed.
- Correction Center report cards are heavy.
- Business Reporting is powerful but dense.
- Manager mobile view should start with assigned store actions, not broad owner-style cards.

Recommendations:

- Make Today first viewport an exception/action grid.
- Add sticky "urgent actions" strip for manager.
- Add segmented sections in Reports.
- Replace wide tables with expandable mobile rows for Staff/Business/Receivables.
- Keep WhatsApp/share/CSV buttons near top of report outputs.

## 18. Future Feature Master List

| Category | Feature | Why needed | User | Priority | Complexity | Dependency | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Critical fixes | Suspicious zero-sales detector | Prevent trusted wrong analytics | Owner/manager | Critical | Medium | sales summaries | 1 |
| Critical fixes | Report insert rollback/failed status | Avoid processed report with missing rows | Owner | Critical | Medium | upload actions | 1 |
| Critical fixes | Reprocess report with latest parser | Repair parser bugs | Owner | Critical | High | correction | 2 |
| Critical fixes | Recalculate report summary | Clear stale warnings | Owner | High | Medium | correction | 2 |
| Critical fixes | Summary-vs-rows checker | Detect corrupted analytics | Owner | High | Medium | reports | 2 |
| Owner shortcuts | Exception queue | One place for problems | Owner | Critical | Medium | Today | 1 |
| Owner shortcuts | Missing uploads page | Fast daily follow-up | Owner | High | Low | reports | 1 |
| Owner shortcuts | Suspicious reports card | Highlight bad data | Owner | Critical | Low | detector | 1 |
| Owner shortcuts | Receivables Reports card | Easier payroll follow-up | Owner | Medium | Low | payslips | 2 |
| Owner shortcuts | Owner Audit Logs page | Review sensitive actions | Owner | High | Medium | audit logs | 2 |
| Manager permissions | Permission matrix page | See exactly what managers can do | Owner | High | Medium | auth | 2 |
| Manager permissions | Manager action audit log | Accountability | Owner | High | Medium | audit logs | 2 |
| Manager permissions | Assigned-store route tests | Prevent regressions | Owner/dev | High | Medium | tests | 2 |
| Manager permissions | Storage policy tightening | Safe file downloads | Owner/dev | Critical | Medium | storage | 1 |
| Manager permissions | View as manager | Debug permissions | Owner | Medium | High | auth | 3 |
| Sales data quality | Staff column warning | Avoid staff sales confusion | Manager | High | Medium | parser metadata | 1 |
| Sales data quality | Summary file detector | Explain brand/category summaries | Manager | High | Medium | parser | 1 |
| Sales data quality | Raw amount-column detector | Catch parser alias misses | Owner | Critical | Medium | parser | 1 |
| Sales data quality | Uploaded file signed download | Verify original file | Owner | High | Medium | storage policy | 2 |
| Sales data quality | Duplicate replace flow from upload | Smooth correction | Owner | Medium | Medium | correction | 3 |
| Staff aliases | Staff contact seed from sales names | Fix Brand Mark manager empty staff | Owner/manager | High | Medium | employee_contacts | 1 |
| Staff aliases | Alias history/revert | Recover wrong mapping | Owner | High | Medium | audit/history | 2 |
| Staff aliases | Manager alias review | Control incentives risk | Owner | Medium | High | audit logs | 3 |
| Staff aliases | Duplicate canonical warning | Avoid bad merges | Owner/manager | Medium | Low | alias page | 2 |
| Staff aliases | Recalculate unmatched summary | Clear stale warnings | Owner | High | Medium | correction | 2 |
| Stock/purchasing | Brand detail page | Buying decisions | Owner | High | Medium | business report | 3 |
| Stock/purchasing | Product detail page | Item decisions | Owner | High | Medium | business report | 3 |
| Stock/purchasing | Size-wise reorder screen | Purchase quantities | Owner | High | Medium | stock/sales | 3 |
| Stock/purchasing | Supplier mapping | Purchase workflow | Owner | Medium | High | schema | 4 |
| Stock/purchasing | Purchase order draft | Actionable buying | Owner | Medium | High | supplier mapping | 4 |
| Stock/purchasing | Stock freshness warning | Avoid stale decisions | Owner/manager | High | Low | stock reports | 1 |
| Stock/purchasing | Avoid-buying list | Reduce dead stock | Owner | Medium | Medium | stock analytics | 3 |
| Reporting/export | Business report presets | Faster sharing | Owner | Medium | Low | business page | 2 |
| Reporting/export | WhatsApp daily summary | Owner communication | Owner | Medium | Medium | summaries | 3 |
| Reporting/export | CSV all report lists | Offline review | Owner | Low | Low | reports | 4 |
| Reporting/export | PDF owner pack | Monthly review | Owner | Low | High | reporting | 5 |
| Performance | Lazy Today panels | Faster PWA | All | High | Medium | Today | 2 |
| Performance | Business pagination | Large data | Owner | High | Medium | business | 2 |
| Performance | Materialized daily summaries | Speed dashboards | All | Medium | High | schema/jobs | 4 |
| Performance | Correction pagination tuning | Bulk history | Owner | Medium | Low | correction | 2 |
| AI/automation | AI daily summary | Business autopilot | Owner | High | Medium | context | 3 |
| AI/automation | AI suspicious report explanation | Faster repair | Owner | Medium | Medium | detector | 3 |
| AI/automation | AI restock summary | Buying assistant | Owner | Medium | Medium | business | 3 |
| AI/automation | AI manager follow-up draft | Operations | Owner | Low | Medium | updates/tasks | 4 |
| Manager accountability | Manager upload history | Who did what | Owner | High | Medium | reports | 2 |
| Manager accountability | Manager alias changes | Staff sales integrity | Owner | High | Medium | audit logs | 2 |
| Manager accountability | Manager daily checklist score | Store discipline | Owner | Medium | Medium | checklist | 3 |
| Payroll/salary | Payslip access audit logs | Sensitive actions | Owner | High | Medium | audit logs | 2 |
| Payroll/salary | Receivables shortcut | Faster collection | Owner | Medium | Low | reports | 2 |
| Payroll/salary | Salary attendance label cleanup | Reduce confusion | All | Medium | Low | reports/today | 1 |
| Security/audit | User creation audit logs | Accountability | Owner | High | Low | auth actions | 1 |
| Security/audit | Store assignment audit logs | Permission history | Owner | High | Low | auth actions | 1 |
| Security/audit | Password reset audit logs | Security trail | Owner | High | Medium | password flow | 1 |
| Security/audit | Storage access tests | Prevent file leak | Dev | Critical | Medium | storage | 1 |
| Password/account | Change My Password page | Self-service | All | Critical | Medium | Supabase auth | 1 |
| Password/account | Forgot Password flow | Account recovery | All | Critical | Medium | Supabase email | 1 |
| Password/account | Owner Send Password Reset Link | Manager recovery | Owner | Critical | Medium | admin/auth | 1 |
| Password/account | Owner Reset Manager Password | Emergency recovery | Owner | High | Medium | admin/auth | 2 |
| Password/account | First-login password change | Temporary password safety | Manager | High | High | profile flag | 3 |
| Password/account | User invite flow | Safer onboarding | Owner/manager | High | Medium | Supabase invite | 2 |
| Password/account | Profile/Settings account page | Clear account tools | All | Critical | Low | settings | 1 |

## 19. Keep / Improve / Hide / Rebuild Verdict

| Module | Verdict | Owner-only | Manager-safe | Assigned-store restricted | Risk |
| --- | --- | --- | --- | --- | --- |
| Today | Improve | No | Yes | Yes | Too crowded/performance |
| Reports | Improve | No | Yes | Yes | Poor grouping |
| Buying & Restock | Improve | No | Yes | Yes | Needs drilldowns |
| Sales Upload | Improve | No | Yes | Yes | Data-quality validation |
| Sales Analytics | Keep/improve | No | Yes | Yes | Needs warnings |
| Staff Sales | Keep/improve | No | Yes | Yes | Missing staff/stale warning |
| Staff Aliases | Improve | No | Yes | Yes | Audit/revert needed |
| Stock Upload | Keep/improve | No | Yes | Yes | Stale month |
| Stock Analytics | Improve | No | Yes | Yes | Dense mobile UI |
| Correction Center | Improve | Yes | No | Owner all | Needs reprocess/download |
| Store Detail | Improve | No | Yes | Yes | Should be manager dashboard |
| Tasks | Keep | No | Yes | Mostly | assigned_to exception |
| Checklist | Keep | No | Yes | Yes | Good |
| Manager Updates | Keep | No | Yes | Yes | Needs owner summary |
| Weekly Audit | Improve | No | Yes assigned | Yes | Sensitive but useful |
| AI Secretary | Improve | Yes | No | Owner all | Needs exception context |
| Users | Improve | Yes | No | Owner all | Password gaps |
| Settings | Improve | Mixed | Yes | Yes | Missing account tools |
| Password/account recovery | Build now | No | Yes | N/A | Critical gap |
| Payslips | Keep/improve | Yes | No | Owner all | Sensitive |
| Salary Attendance | Improve label | No | Yes | Yes | Payroll confusion |
| Receivables | Improve shortcut | Yes | No | Owner all | Hidden |
| Life Flow | Move lower/hide | Yes | No | N/A | Not business-first |

## 20. Recommended Next 10 Builds

1. Password and Account Recovery
   - Scope: Change My Password, Forgot Password, reset page, owner send reset link, account settings.
   - Why now: account recovery is the lowest-rated readiness area.
   - Value: prevents lockouts and owner/developer dependency.
   - Risk: auth redirect/email configuration.
   - Complexity: Medium.
   - Areas: `app/login`, `app/app/settings`, `lib/auth/actions`, Supabase auth.
   - Version bump: patch/minor, likely v7.3.0.
   - Doer: Codex.

2. Suspicious Sales Report Detector
   - Scope: detect row_count > 0 with zero totals, summary/rows mismatch, missing rows.
   - Why now: protects owner trust.
   - Value: catches bad uploads immediately.
   - Risk: false positives for true zero-sale days.
   - Complexity: Medium.
   - Areas: sales queries, Today, Reports, Correction.
   - Version bump: v7.3.0.
   - Doer: Codex.

3. Staff Contact Seed And Brand Mark Staff Visibility Fix
   - Scope: seed employee contacts from sales staff names and show no-contact warnings.
   - Why now: Brand Mark manager cannot see staff.
   - Value: managers can maintain staff contacts and aliases.
   - Risk: duplicate staff names.
   - Complexity: Medium.
   - Areas: employees, staff aliases, sales rows.
   - Version bump: v7.3.0.
   - Doer: Codex.

4. Alias Audit And Summary Recalculation
   - Scope: durable audit path, owner alias-change view, recalculate unmatched summaries.
   - Why now: staff warnings and manager alias changes need trust.
   - Value: better staff sales integrity.
   - Risk: audit RLS/admin handling.
   - Complexity: Medium.
   - Areas: staff aliases, audit logs, reports summaries.
   - Version bump: v7.3.0.
   - Doer: Codex.

5. Today V2 Exception Dashboard
   - Scope: top exception/action cards, lazy lower sections, manager-specific first screen.
   - Why now: reduces confusion.
   - Value: app feels like autopilot.
   - Risk: layout churn.
   - Complexity: Medium.
   - Areas: Today, summary queries.
   - Version bump: v7.4.0.
   - Doer: Codex.

6. Correction Center Reprocess/Download
   - Scope: owner-only signed file view/download, reprocess latest parser, repair summary.
   - Why now: wrong uploads need fast recovery.
   - Value: reduces manual database work.
   - Risk: storage access security.
   - Complexity: High.
   - Areas: correction, storage policies, parser actions.
   - Version bump: v7.4.0.
   - Doer: Codex after storage review.

7. Manager Permission And Action Audit
   - Scope: permission matrix, manager action log, route/RLS checklist.
   - Why now: owner wants confidence.
   - Value: safer delegation.
   - Risk: overlogging/noise.
   - Complexity: Medium.
   - Areas: audit logs, users, reports, employees.
   - Version bump: v7.4.0.
   - Doer: Codex.

8. Reports Page Reorganization
   - Scope: group cards into Owner Decisions, Uploads, Staff, Corrections, Payroll, Admin.
   - Why now: navigation clarity.
   - Value: less hunting.
   - Risk: user relearning.
   - Complexity: Low.
   - Areas: Reports page.
   - Version bump: patch/minor.
   - Doer: Codex.

9. Buying Assistant Drilldowns
   - Scope: brand/product detail, stock freshness warning, size reorder view.
   - Why now: biggest owner business value after trust/security.
   - Value: better purchasing decisions.
   - Risk: data matching quality.
   - Complexity: High.
   - Areas: business analytics, stock analytics.
   - Version bump: v7.5.0.
   - Doer: Codex.

10. AI Secretary Exception Context
    - Scope: missing uploads, suspicious reports, restock, staff, manager actions.
    - Why now: turns tools into autopilot.
    - Value: owner asks "what needs attention" and gets useful answer.
    - Risk: context bloat.
    - Complexity: Medium.
    - Areas: secretary context/actions.
    - Version bump: v7.5.0.
    - Doer: Codex.

## 21. Verification

Requested commands to run after creating this audit:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `git status`
- `git log --oneline -25`

## 22. Git

Commit message:

`add full webapp confusion permission and feature gap audit`

Push status: do not push.

## Final Snapshot

- Audit file: `docs/FULL_WEBAPP_CONFUSION_PERMISSION_AND_FEATURE_GAP_AUDIT.md`
- Overall app readiness: 7/10
- Manager permission safety: 8/10
- Store isolation safety: 8/10
- Password/account recovery readiness: 2/10
- User can change own password today: no
- Owner can reset manager password today: no
- Forgot password status: missing
- Biggest immediate fix: password/account recovery plus suspicious sales report detector
- Brand Mark manager staff issue: likely missing `employee_contacts` seed/assignment/data, not an RLS denial based on code
- Most important permission risk: broad authenticated storage select before adding file download/open links
- Most important workflow risk: processed sales reports that are uploaded but analytically wrong

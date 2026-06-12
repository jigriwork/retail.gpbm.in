# Manager Daily Sales Visibility Audit

Date: 2026-06-12

Version: v7.2.0

Scope: audit-only review of manager daily sales upload visibility for owner. No code, schema, data, parser, RLS/security, or uploaded data changes were made.

## 1. Executive Summary

Owner visibility readiness rating: 6/10.

What works:

- Manager daily sales upload is functional from `/app/reports/sales`.
- Upload creates a `reports` row with `report_type = sales`.
- Upload inserts detailed `sales_rows`.
- Owner can see sales uploads through Reports, Sales Upload, Sales Analytics, Buying & Restock, Store Detail, AI Secretary context, and Weekly Audit.
- Today already has sales information, but it is framed around yesterday's sales and monthly sales, not "manager uploaded this file just now".

What is hidden or confusing:

- Today does not have a top-level "Daily Sales Upload Status" card.
- Today sales status is lower down after several unrelated owner sections.
- Today primarily checks yesterday's report, while managers may think they uploaded "today".
- It does not show uploaded by, upload time, file name, returns, bill count, or unmatched staff in the Today status cards.
- The latest amount shown can come from `latestReport`, while the status badge is based on yesterday's report. If the latest upload is not yesterday, this can confuse the owner.

Biggest gap:

- The owner does not get a clear, store-wise confirmation on Today that a manager uploaded daily sales, with report date, uploaded by, upload time, total sale, bills, returns, and staff alias status.

Recommended next fix:

- Add a lightweight top Today card named `Daily Sales Upload Status`, using batched `reports` queries only. It should show today status, yesterday status, latest uploaded report, uploaded by, upload time, total sale, bills, returns, unmatched staff, and direct actions.

## 2. Manager Upload Flow Audit

Route: `/app/reports/sales`

Primary files:

- `app/app/reports/sales/page.tsx`
- `components/reports/sales-upload-form.tsx`
- `lib/reports/sales-actions.ts`
- `lib/reports/sales-parser.ts`
- `lib/reports/sales-queries.ts`

Can manager upload daily sales for assigned stores only?

- Yes. The page loads `getAccessibleStores(profile)`.
- Non-owner upload is blocked unless `canAccessStore(storeId, profile)` returns true.
- The database RLS also limits manager report insert to assigned stores and `uploaded_by = auth.uid()`.
- Manager sales row insert is allowed only for assigned stores.

What validation happens?

- Requires active account.
- Requires store, report date, non-empty file.
- Allows only `.xlsx`, `.xls`, `.csv`.
- Requires selected store to be active and accessible.
- Parses the file and rejects files with no usable rows.
- Requires a detected sales header row with expected columns when title rows are present.
- Rejects files with more than one detected bill date.
- Blocks duplicate sales report for same store and final report date.
- Validates store column rows if the file contains store/godown names.
- Requires at least one summarized sales row.

Does it block duplicate store/date upload?

- Yes. It queries `reports` for `report_type = sales`, selected `store_id`, and final `report_date`; if found, it returns "Sales report for this store and date already exists."

Does it block multi-date files?

- Yes. If parsed rows contain more than one unique bill date, upload is blocked with a one-day-at-a-time message.

Does it validate store column?

- Yes, when parsed rows include a store name. Rows with store names that do not match the selected active store are rejected.
- If the file has no store column, the selected store is trusted.

Does it show upload success summary?

- Yes. `SalesUploadForm` shows an `Upload summary` after successful upload.

What exactly is shown to manager after upload?

- Store name.
- Report date.
- Detected date from bill date, if present.
- Rows processed.
- Total sale.
- Bill count.
- Returns.
- Skipped rows.
- Unmatched staff count.
- Unmatched staff names, if any.
- Staff found.
- Top categories.
- Top brands.

Does it link to staff aliases if unmatched staff exist?

- Yes. If unmatched staff names exist, the upload summary includes an `Open alias mapping` link to `/app/reports/staff-aliases`.

## 3. Database Impact Audit

After successful daily sales upload:

`reports` row inserted?

- Yes. `lib/reports/sales-actions.ts` inserts into `reports`.
- Key fields: `report_type`, `store_id`, `uploaded_by`, `report_date`, `file_name`, `file_path`, `row_count`, `summary`, `status`.
- `status` is set to `processed`.
- `sales_upload_batch_id` is not set for normal daily upload.

`sales_rows` inserted?

- Yes. Rows are inserted in batches into `sales_rows`.
- Fields include `report_id`, `store_id`, `sale_date`, bill details, product fields, brand/category/size/color, quantity, MRP, discount, net sale, staff, customer details, and raw row data.

`reports.summary` content?

- Summary includes total net sale, row count, bill count, staff names, brand summary, category summary, top staff, top brands, top categories.
- Metadata includes detected date, returns count, skipped rows, unmatched staff count, and unmatched staff names.

`reports.row_count`?

- Yes. It is saved as the summarized row count.

`reports.uploaded_by`?

- Yes. It is set to `profile.id`.
- Current sales list/status queries do not select joined profile name, so owner-facing pages generally do not show the manager name for daily sales.

Storage file path saved?

- Yes. File is uploaded to Supabase Storage bucket `reports`.
- Path format: `sales/{store_code}/{report_date}/{timestamp}-{slug_file_name}`.
- The path is saved in `reports.file_path`.

Tasks auto-completed?

- Yes, only matching tasks for the same store and final report date.
- `completeMatchingTasks(storeId, finalReportDate, ["sales report", "daily_sales"])` marks pending/in-progress/waiting matching tasks as done.
- There is no explicit owner notification when this happens.

Report status updated?

- The inserted report status is `processed`.
- There is no later status transition for normal daily upload unless repair/correction tools are used separately.

Any audit log?

- No for normal daily upload.
- `audit_logs` exists and is used by correction tooling, but daily manager upload does not insert an audit log.

Any notification created?

- No. There is no in-app notification or upload event feed created after normal daily upload.

Important failure edge:

- If file storage and `reports` insert succeed but `sales_rows` insertion fails, the action returns an error saying the file was saved but rows could not be inserted. The `reports` row remains, so owner could see a processed report record with missing row-level analytics. This is rare but should be made clearer in a future hardening pass.

## 4. Owner Visibility Audit

### `/app/today`

Does it show uploaded/missing daily sales?

- Yes, but mainly for yesterday.
- `getStoreSalesStatuses(stores)` returns `yesterdayReport`, `latestReport`, and recent reports per store.
- Today has a `Sales pulse` section and a later `Yesterday sales reports` section.

Does it show today or yesterday?

- The status badge is based on yesterday.
- Sales pulse also shows yesterday and month totals.
- It does not show a dedicated today upload status.

Does it show store-wise status?

- Yes, store-wise uploaded/missing for yesterday.

Does it show uploaded by manager?

- No.

Does it show total sale?

- Yes, yesterday amount in Sales pulse and latest report total in the lower Yesterday sales reports section.
- It does not make clear when latest total is not the same as yesterday's upload status.

Does it show report date?

- The lower section shows due date and latest upload date.

Does it show latest upload?

- Yes, as latest report date, but without uploader, upload time, or file name.

Does it update immediately after upload?

- The upload action revalidates `/app/today`, so the next server render should reflect it.
- It is not a live push/notification.

Is it visible enough for owner?

- No. It is too low and too generic for the owner's expected "manager uploaded daily sales" workflow.

### `/app/reports`

- Shows Daily Sales Upload status store-wise for yesterday.
- Shows latest report total and latest date.
- Shows missing yesterday sales report names.
- Shows recent sales uploads via `SalesReportList`.
- Does not show uploaded by or upload time for sales.
- Useful, but not the owner's first screen.

### `/app/reports/sales`

- Shows upload form and recent sales reports.
- Owner can see recent reports from accessible stores.
- Shows store, report date, status, total sale, rows, bills, top categories, and store link.
- Owner can repair totals from this page.
- Does not show uploaded by, upload time, returns, unmatched staff, or file path.

### `/app/reports/sales/analytics`

- Reads from `sales_rows`.
- Shows totals, quantity, bill count, ABV, staff count, brand/category count, rows, store summary, daily trend, rankings, and missing sales reports.
- Default period is yesterday.
- Shows today only when the period is changed to Today.
- Does not show uploaded by, upload event, file name, or upload time.

### `/app/reports/business`

- Reads `sales_rows` and stock rows to power Buying & Restock.
- Shows sales totals, bill count, item/brand/category/size/staff performance and reorder signals.
- Can show today's sales if period is Today, but default is month.
- Does not show upload status, uploaded by, or upload time.

### `/app/stores/[storeId]`

- Shows Daily sales status for yesterday.
- Shows last uploaded date, latest total sale, latest rows, recent sales reports, and links to upload/sales analytics/staff sales.
- Does not show uploaded by manager or upload time for daily sales.
- Stronger than Today for one store, but owner must drill into the store.

### `/app/secretary`

- Owner-only.
- AI Secretary context includes yesterday sales status and monthly sales by store.
- It does not include a latest manager upload event, uploaded by, upload time, returns, unmatched staff, or file name.
- It is not automatic; owner has to ask.

### `/app/audit`

- Weekly audit shows store performance for a selected week.
- Shows missing sales days, total sales, daily sale breakdown, staff, categories, brands.
- Useful for weekly review, not for immediate upload visibility.
- Does not show manager upload event details.

## 5. Today Page Specific Audit

Which sales status component or function it uses:

- `app/app/today/page.tsx` calls `getStoreSalesStatuses(stores)` from `lib/reports/sales-queries.ts`.
- It also calls `getSalesSummary` for yesterday and month, and `getStaffSalesSummary` for yesterday.

Does Today show today's sales upload or yesterday's sales upload?

- It shows yesterday's upload status.
- It can include current month totals through sales rows, but the explicit uploaded/missing badge is yesterday.

Does it show current date or previous date?

- Previous date for the sales report due status.
- It uses India today from `getIndiaToday()` and `addDays(..., -1)`.

Does it show uploaded/missing status per store?

- Yes, for yesterday.

Does it show manager uploaded file?

- No. It does not show file name or file path.

Does it show total sale after upload?

- Yes, if rows and report summary are available.
- Sales pulse uses `sales_rows`; lower status uses `latestReport.summary.totalNetSale`.

Is it lower down and hidden because Today is crowded?

- Yes. The page has many sections before the explicit `Yesterday sales reports` cards, including command shortcuts, AI Secretary, staff phones, payslips, salary receivables, weekly audit, stock pulse, sales pulse, stock workflow, checklist, reviews, tasks, salary workflow, manager updates, manager actions, and stores.
- The earlier `Sales pulse` is useful but not labelled as "Daily Sales Upload Status".

Is it excluded by date logic/timezone?

- Not broken, but date framing can confuse users.
- The status is driven by India yesterday, not by upload-created time and not by "today's file was uploaded".

Is it only showing yesterday sales pulse, not today?

- Yes for the primary status.

Is it using cached `reports.summary` or live `sales_rows`?

- Both.
- `getStoreSalesStatuses` uses `reports.summary` for latest/yesterday report status.
- `getSalesSummary` uses live `sales_rows` for yesterday and month totals.

Is it checking `report_date` properly in India timezone?

- Yes. It computes yesterday from `getIndiaToday()` using `Asia/Kolkata`.

Is it broken by manager upload or duplicate logic?

- No direct bug found.
- Duplicate prevention works on final report date.
- The visibility issue is mainly UX and date semantics.

Exact reason owner may not see upload:

- If a manager uploads the default report date, the app records it as yesterday's sales. Today shows that only in yesterday-oriented sections, and the clearest per-store upload cards are far down the page. The page does not show "latest manager upload" near the top and does not show uploaded by/upload time, so the owner does not get a clear confirmation that a manager completed today's upload task.

## 6. Owner Expected Workflow

Owner expects after manager upload:

- Go Planet daily sales uploaded or missing.
- Brand Mark daily sales uploaded or missing.
- Uploaded by manager name.
- Upload time.
- Report date.
- Total sale.
- Bills.
- Returns.
- Unmatched staff count.
- Quick links: View Sales Report, Staff Sales, Buying Report, Fix Wrong Upload.

Current app versus expected workflow:

- Store-wise uploaded/missing: available, but yesterday-oriented and not top-priority.
- Uploaded by manager: stored in DB, not shown on current sales status cards.
- Upload time: stored as `reports.created_at`, not shown on Today sales cards.
- Report date: shown in some places.
- Total sale: shown.
- Bills: shown in sales list/analytics, not Today status cards.
- Returns: stored in summary, shown only in upload success and some analytics/business contexts, not Today status cards.
- Unmatched staff: stored in summary and upload success, not Today status cards.
- Quick links: partial. Today links to upload and analytics; it does not offer one compact action cluster per store.

## 7. Missing Alerts / Notifications Audit

In-app notification when manager uploads sales:

- Missing.

Today highlight/banner:

- Missing.

Owner alert for missing sales report:

- Partial. Today and Reports show missing yesterday status.
- There is no high-priority top Today alert.

Owner alert for uploaded report waiting review:

- Missing. Daily uploads are immediately `processed`; no owner review workflow exists.

Manager success confirmation:

- Present. The upload form shows a detailed success summary.

AI Secretary context includes latest upload:

- Partial. It includes yesterday status and monthly sales, but not latest upload event/uploader/time.

Task auto-completion visible to owner:

- Indirect only. Matching tasks may be marked done, but the upload itself does not create a visible completion event.

Simple implementation recommendation:

- Add a top Today `Daily Sales Upload Status` card.
- Add a lightweight "latest manager upload" line per store from `reports`.
- Later add an owner-only notification/audit event for manager upload.

## 8. Date/Timezone Audit

Is app using India timezone?

- Yes. Shared date helpers use `Asia/Kolkata`.

Does upload date come from report date or file detected date?

- The form defaults to yesterday.
- If the uploaded file contains a bill date, final report date uses the detected bill date.
- If no bill date is detected, it uses the selected report date.

Does Today expect today's report or yesterday's report?

- Today expects yesterday's daily sales report for upload status.

If manager uploads yesterday's sales today morning, where does it show?

- It should show as uploaded in Today `Sales pulse` and `Yesterday sales reports`.
- It also appears on Reports, Sales Upload recent reports, Sales Analytics default period, Store Detail, AI Secretary context, and Weekly Audit.

If manager uploads today's sales at night, where does it show?

- It appears in reports and analytics when period is Today or current month.
- It will not satisfy Today page's yesterday status until the next India date changes and the uploaded report date becomes yesterday.

Is owner confused because Today page says yesterday/month sales, not today upload status?

- Yes. The language and card placement do not match the owner's mental model: "manager uploaded daily sales, show me clearly on Today."

## 9. Manager vs Owner Permissions Audit

Manager upload allowed only assigned stores:

- Yes at application level through `canAccessStore`.
- Yes at RLS level for `reports` and `sales_rows`.

Owner sees all active stores:

- Yes. Owner `getAccessibleStores` returns all active stores.
- RLS gives owner all access to `reports` and `sales_rows`.

Owner can see manager uploads:

- Yes, because uploads are saved in `reports` and `sales_rows`.
- The current UI does not show the manager name for daily sales because sales status queries do not join `profiles`.

Managers cannot see other stores:

- Application queries and RLS both limit manager access to assigned stores.

Manager upload does not bypass owner-only correction:

- Correct. Correction page and audit log write paths require owner.

RLS is respected:

- No RLS weakening found in this audit.

## 10. Recommended UI Fix

Add a top Today card:

`Daily Sales Upload Status`

Show per active store:

- Store name.
- Today report status.
- Yesterday report status.
- Last uploaded report date.
- Uploaded by.
- Upload time.
- Total sale.
- Bills.
- Returns.
- Unmatched staff.
- Status:
  - Uploaded.
  - Missing.
  - Late.
  - Needs staff alias review.
- Action buttons:
  - View Sales.
  - Staff Sales.
  - Buying Report.
  - Fix Wrong Upload, owner-only.

Also add upload success to owner context:

- Latest manager upload card on Today.
- AI Secretary context line for latest manager upload per store.

Do not change parsers or uploaded data for this fix.

## 11. Performance Considerations

Today must not get slower.

Recommended approach:

- Use `reports.summary` for status cards.
- Batch one `reports` query for all active stores with `store_id IN (...)`.
- Do not load `sales_rows` for the new Today upload status card.
- Load only today, yesterday, and latest report rows per active store.
- Select only needed fields: `store_id`, `report_date`, `created_at`, `uploaded_by`, `summary`, `row_count`, `status`, `file_name`, and joined `profiles(full_name,email)`.
- Keep action links static.

Avoid:

- Loading row-level sales data on Today for this card.
- Calling per-store queries.
- Adding a notification system in the same phase as the UI card.

## 12. Recommended Build Plan

Phase 1: Today Daily Sales Upload Status card

- Business value: high. Solves the immediate owner complaint.
- Risk: low if based only on `reports.summary`.
- Complexity: low to medium.
- Recommended first because it is performance-safe and does not require schema change.

Phase 2: Upload notification/audit log

- Business value: medium to high. Creates a real event trail for manager upload.
- Risk: medium because daily upload actions would start writing new event/audit records.
- Complexity: medium.
- Keep RLS owner-safe and do not expose file paths unnecessarily.

Phase 3: Missing sales alerts/WhatsApp reminder

- Business value: high if managers regularly miss uploads.
- Risk: medium to high because messaging/reminders can spam or confuse if date rules are not precise.
- Complexity: medium to high depending on WhatsApp integration.
- Implement after Today card clarifies the workflow.

## 13. Verification

Requested commands to run after this audit doc is written:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `git status`
- `git log --oneline -15`

## 14. Git

Commit audit doc only with message:

`add manager daily sales visibility audit`

Do not push.

## Key Findings

- Normal daily manager upload writes `reports`, `sales_rows`, and Supabase Storage.
- Normal daily manager upload does not write `audit_logs` or `sales_upload_batches`.
- Normal daily manager upload does not create an in-app notification.
- Today is not broken, but it is oriented to yesterday's sales report and not to an upload event.
- The owner can see the uploaded data, but not clearly enough on the first screen.
- Best next fix is a lightweight top Today status card backed by batched `reports` queries.

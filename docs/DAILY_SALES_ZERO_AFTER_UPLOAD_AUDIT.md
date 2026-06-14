# Daily Sales Zero After Upload Audit

Date: 2026-06-14

Version: v7.2.0

Scope: urgent audit-only review for daily sales upload showing uploaded while sales and staff sales show 0. No code, schema, data, parser, RLS/security, report files, or uploaded rows were changed.

## 1. Executive Summary

This is a parser/data-shape issue with a validation gap. It is not a missing `sales_rows` insert issue, not an RLS permission issue, and not primarily a UI date-default issue for the affected upload.

Affected upload:

- Store: Go Planet
- Report date: `2026-06-13`
- Report id: `a7419e39-04a9-476b-b9fc-9d90defc6d96`
- Uploaded by: Rahul Sethi
- Uploaded at: `2026-06-13T16:29:57.861333+00:00`
- File: `130626.xlsx`
- Storage path: `sales/gp/2026-06-13/1781368197185-130626.xlsx`

The report was uploaded and the `reports` row exists with `status = processed`. `sales_rows` were also inserted: 65 rows are linked to this report. The problem is that all 65 persisted rows have null/zero `net_sale`, null/zero `quantity`, no `bill_no`, and no `staff_name`.

The uploaded workbook is a `DAILY SALE BOOK` brand/category summary. It contains real sales values in raw columns named `NET SALE QTY` and `NET SALE VALUE`, totaling:

- Raw `NET SALE QTY`: 181
- Raw `NET SALE VALUE`: INR 215,043

But the current parser aliases do not match `NET SALE QTY` as quantity or `NET SALE VALUE` as net sale. The parser did match `BILL DATE`, `BRAND NAME`, and `CATEGORY`, so it accepted and inserted rows with brand/category/date only. Because analytics and staff pages read persisted `sales_rows.net_sale`, `quantity`, `bill_no`, and `staff_name`, they correctly show 0 from the bad persisted fields.

Urgency rating: Critical. The owner sees "uploaded" and may trust a processed report, but the app's analytic sales value for that day is wrong.

Recommended fix: Do not reupload blindly until duplicate handling/repair is chosen. Owner should use the correction path to delete/replace or repair this report, then upload the correct agent/transaction sales report or reprocess this file with parser aliases/validation fixed.

## 2. Identify Relevant Date and Store

Important date clarification:

- User-mentioned date: `13/07/2026`
- ISO equivalent: `2026-07-13`
- Current environment date: `2026-06-14`
- India yesterday from the app date helper logic: `2026-06-13`

`13/07/2026` is in the future relative to this audit environment date. I still checked it literally and also checked the real India-yesterday date.

Active stores checked:

- Brand Mark, code `BM`, id `881aec03-4a88-461b-90b9-fd6463b71c32`
- Go Planet, code `GP`, id `77c23e20-e3e1-4873-825d-7954103e2267`

Findings:

- No sales report exists for `2026-07-13`.
- No report exists near `2026-07-13` in the range `2026-07-10` to `2026-07-16`.
- One sales report was uploaded for India yesterday, `2026-06-13`.
- That report belongs to Go Planet.
- Brand Mark has no `sales_rows` or report for `2026-06-13` or `2026-07-13`.

## 3. Database Audit: `reports`

Matching `reports` row:

| Field | Value |
| --- | --- |
| report id | `a7419e39-04a9-476b-b9fc-9d90defc6d96` |
| store_id | `77c23e20-e3e1-4873-825d-7954103e2267` |
| store name | Go Planet |
| report_type | `sales` |
| report_date | `2026-06-13` |
| created_at | `2026-06-13T16:29:57.861333+00:00` |
| uploaded_by | Rahul Sethi, `rahulsethi8610401108@gmail.com` |
| file_name | `130626.xlsx` |
| file_path | `sales/gp/2026-06-13/1781368197185-130626.xlsx` |
| row_count | 65 |
| status | `processed` |
| sales_upload_batch_id | null |

Report summary:

- `summary.totalNetSale`: 0
- `summary.rowCount`: 65
- `summary.billCount`: 0
- `summary.returnsCount`: 0
- `summary.staffNames`: empty array
- `summary.unmatchedStaffCount`: 0
- `summary.unmatchedStaffNames`: empty array
- `summary.topBrands`: brands present, each sale 0
- `summary.topCategories`: categories present, each sale 0

Answers:

- Does report exist? Yes, for Go Planet on `2026-06-13`.
- Does report summary show real sale or zero? It shows zero.
- Is `row_count > 0`? Yes, 65.
- Is status processed? Yes.
- Is report date correct for India yesterday? Yes, `2026-06-13`.
- Is uploaded_by present? Yes.

## 4. Database Audit: `sales_rows`

For report id `a7419e39-04a9-476b-b9fc-9d90defc6d96`:

| Metric | Value |
| --- | ---: |
| sales_rows count for report_id | 65 |
| sales_rows count for Go Planet + `2026-06-13` | 65 |
| sum `net_sale` | 0 |
| sum `quantity` | 0 |
| distinct `bill_no` count | 0 |
| negative return rows count | 0 |
| rows with `staff_name` | 0 |
| rows missing `staff_name` | 65 |
| rows with `net_sale = 0/null` | 65 |
| rows with `quantity = 0/null` | 65 |

Sample persisted rows:

| sale_date | bill_no | brand | category | item_name | staff_name | quantity | net_sale |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
| `2026-06-13` | null | FAHRENHEIT | TOP WEAR | null | null | null | null |
| `2026-06-13` | null | FINE CREATION | LADIES WEAR | null | null | null | null |
| `2026-06-13` | null | AMSTEAD | TOP WEAR | null | null | null | null |
| `2026-06-13` | null | BIG AIR | BOTTOM WEAR | null | null | null | null |
| `2026-06-13` | null | BIMAL TRADERS | FOOT WEAR | null | null | null | null |
| `2026-06-13` | null | BLACKBERRYS | BOTTOM WEAR | null | null | null | null |
| `2026-06-13` | null | BLACKBERRYS | TOP WEAR | null | null | null | null |
| `2026-06-13` | null | CAMPUS | FOOT WEAR | null | null | null | null |
| `2026-06-13` | null | CEEPENS | BOTTOM WEAR | null | null | null | null |
| `2026-06-13` | null | CHUNI LAL & SONS | LADIES WEAR | null | null | null | null |

Answers:

- Were rows inserted? Yes.
- Are rows linked to the correct report_id? Yes.
- Are rows saved with correct sale_date? Yes, `2026-06-13`.
- Are net_sale values saved correctly? No. Raw file has values, persisted `net_sale` is null/zero.
- Are staff names present? No.
- Is staff sales 0 because staff_name is missing, or because sales_rows are missing? Staff sales is 0 because `staff_name` is missing on all rows and `net_sale` is null/zero. Rows are present.

## 5. Compare `reports.summary` vs `sales_rows`

The report summary and persisted rows agree with each other, but both are wrong versus the raw file:

- `reports.summary.totalNetSale = 0`
- `sales_rows` sum `net_sale = 0`
- `reports.row_count = 65`
- `sales_rows` count = 65
- `reports.summary.billCount = 0`
- `sales_rows` distinct bill count = 0

This is not the classic partial-upload bug where Today shows uploaded because `reports` exists while analytics has zero rows. Here, Today shows uploaded because `reports` exists, and analytics shows zero because `sales_rows` exist but contain null/zero analytic fields.

Today upload status uses `reports.summary` via `getStoreSalesStatuses` in `lib/reports/sales-queries.ts`. Sales Analytics, Staff Sales, and Business Reporting use `sales_rows` through `getSalesSummary`, `getStaffSalesSummary`, and `getBusinessReport` in `lib/analytics/sales.ts` and `lib/analytics/business.ts`.

## 6. Upload Flow Failure Audit

Relevant code:

- `lib/reports/sales-actions.ts:399` inserts the `reports` row.
- `lib/reports/sales-actions.ts:418` builds `sales_rows`.
- `lib/reports/sales-actions.ts:440` inserts `sales_rows` after the report exists.
- `lib/reports/sales-actions.ts:442` handles row insert failure.
- `lib/reports/sales-actions.ts:446` returns: "Report file was saved, but sales rows could not be inserted. Ask owner/admin to review this report."

Answers:

- Does it insert `reports` before `sales_rows`? Yes.
- What happens if `sales_rows` insert fails after reports insert? The function returns an error, but the report row remains.
- Does the report remain as processed? Yes, because it was inserted with `status = processed` before row insert.
- Is there cleanup/rollback? No cleanup for the report row or storage file after row insert failure.
- Could a report show uploaded even if rows failed? Yes, that risk exists.
- Is this exactly what happened here? No. Here `sales_rows` did insert. The problem is that inserted rows have bad/null parsed values.

## 7. Query/UI Audit

`/app/today`:

- Calls `getStoreSalesStatuses(stores)` and uses `reports.summary` for uploaded/latest status.
- Calls `getSalesSummary` for yesterday and month from `sales_rows`.
- Calls `getStaffSalesSummary` for yesterday from `sales_rows`.
- Today/yesterday dates use India helper logic.

`/app/reports/sales`:

- Uses upload action and `getRecentSalesReports`.
- Recent reports read `reports.summary`.

`/app/reports/sales/analytics`:

- Default period is `yesterday`.
- Reads `sales_rows`.
- For the affected date/store, it will show 65 rows but total sale, quantity, bills, and staff count as 0.

`/app/reports/staff`:

- Default period is `yesterday`.
- Reads `sales_rows`.
- Skips rows with missing `staff_name`; all affected rows are missing staff, so it shows no staff sales.

`/app/reports/business`:

- Default period is `month`.
- Reads `sales_rows` and latest `stock_rows`.
- The affected rows contribute brand/category options but zero net sales and zero sold quantity.

Date mismatch status:

- Literal `2026-07-13`: no report and no rows.
- Actual India-yesterday `2026-06-13`: report and rows exist.
- UI default is not the main root cause for the affected upload because Sales Analytics and Staff Sales default to yesterday, which matches the affected report date.

## 8. Parser Audit for This File Type

Stored file inspection:

- Sheet name: `Report`
- Dimensions: `A2:Q70`
- Title row: `DAILY SALE BOOK From 13/06/2026 to 13/06/2026`
- Header row: row 2

Header row:

`SNO.`, `SHOW ROOM`, `BILL DATE`, `BRAND NAME`, `CATEGORY`, `NET SALE QTY`, `MRP VALUE`, `DISCOUNT VALUE`, `NET SALE VALUE`, `TAXABLE AMOUNT`, `SCHEME/UNIT`, `TOTAL CGST AMOUNT`, `TOTAL SGST AMOUNT`, `TOTAL IGST AMOUNT`, `CREDIT`, `GODOWN NAME`, `SCHEME(RS.)`

Parser match behavior:

- Matched `BILL DATE` as `saleDate`.
- Matched `BRAND NAME` as `brand`.
- Matched `CATEGORY` as `category`.
- Did not match `NET SALE QTY` as `quantity`.
- Did not match `NET SALE VALUE` as `netSale`.
- Did not match any bill number column because the file has none.
- Did not match staff name because the file has none.

Code evidence:

- Parser aliases are in `lib/reports/sales-parser.ts:45`.
- Minimum header matches is 4 in `lib/reports/sales-parser.ts:78`.
- The upload action then filters rows through `rowHasSalesIdentity` in `lib/reports/sales-actions.ts:104`; brand/category are enough to keep the row.

Raw data totals from persisted `raw_data`:

- Row count: 65
- Sum raw `NET SALE QTY`: 181
- Sum raw `NET SALE VALUE`: INR 215,043
- Sum raw `TAXABLE AMOUNT`: INR 201,879.06
- Sum raw `MRP VALUE`: INR 320,115
- Sum raw `DISCOUNT VALUE`: INR -105,072.58

Conclusion: the uploaded file had real sales values, but under column names the parser did not map. It was also not staff-wise because the workbook has no staff/agent column.

## 9. RLS / Permission Audit

RLS does not explain this incident.

Relevant policies:

- `reports_owner_all`: `supabase/migrations/20260531174800_initial_schema.sql:368`
- `reports_manager_insert_assigned`: `supabase/migrations/20260531174800_initial_schema.sql:370`
- `sales_rows_owner_all`: `supabase/migrations/20260531174800_initial_schema.sql:372`
- `sales_rows_manager_insert_assigned`: `supabase/migrations/20260608184500_allow_manager_insert_sales_rows.sql:3`
- Storage report insert/select policies: `supabase/migrations/20260531174800_initial_schema.sql:421` to `423`

Answers:

- Did manager have insert permission for reports but not sales_rows? No evidence of that. `sales_rows` were inserted.
- Could RLS allow reports insert but block sales_rows insert? In theory before the manager insert policy, yes; in current schema no, and this incident inserted rows.
- Any policy mismatch after recent changes? Not for this case.
- Owner sees reports but not sales_rows? No evidence. The service-role audit sees both; UI zero is caused by persisted row values.
- Manager assigned store rules correct? The upload was for Go Planet and inserted under Go Planet.

## 10. Exact Root Cause

Report row exists and `sales_rows` exist, but the uploaded `DAILY SALE BOOK` file was parsed into rows with only date, brand, and category. The parser did not map `NET SALE QTY` to quantity or `NET SALE VALUE` to net sale, and the file contains no bill number or staff/agent column. Therefore persisted `sales_rows.net_sale`, `quantity`, `bill_no`, and `staff_name` are null/zero, causing Sales Analytics and Staff Sales to show 0 even though the upload status says processed.

## 11. Recommended Fix Plan

For this incident:

- Treat report `a7419e39-04a9-476b-b9fc-9d90defc6d96` as bad processed data.
- Owner should delete/replace it from Data Correction Center, or add a repair/reprocess path that recalculates this report from raw file columns.
- Avoid leaving this report as processed with zero sales because it pollutes monthly/business analytics.

Parser/validation fix:

- Add aliases for `NET SALE QTY` and `NET SALE VALUE`.
- Add validation that rejects a daily sales file when `row_count > 0` but all parsed `net_sale` values are null/zero while raw amount-like columns are present.
- Add validation for staff reports: if the file has no staff/agent column, warn that Staff Sales will be zero.
- Consider separate support for summary-style `DAILY SALE BOOK` files versus transaction/agent sales reports. Summary files do not have bill-level or staff-level data.

Upload-flow hardening:

- If `sales_rows` insert fails after `reports` insert, mark the report failed or remove the created report/storage file.
- Add a Today warning for processed reports where `row_count > 0` but `sales_rows` sum is 0 and raw amount columns indicate real sales.
- Add an owner repair/reprocess action for bad parser mappings.

UI fix:

- In Today and Recent Sales, flag suspicious processed reports: `row_count > 0`, `totalNetSale = 0`, `billCount = 0`, and no staff names.
- Link Today actions with date/store query params so Sales Analytics and Staff Sales open the exact report date.

## 12. Emergency Safety Recommendation

Owner should not rely on the Go Planet `2026-06-13` sales analytics until this report is repaired/replaced.

Recommended immediate action:

- Do not reupload the same date until deciding how to handle duplicate protection, because the existing Go Planet `2026-06-13` report will block a normal duplicate upload.
- Use Data Correction Center as owner to delete/replace the bad report, or implement a targeted repair/reprocess action first.
- If the required owner view is staff-wise sales, ask staff to upload the agent/transaction sales report, not this brand/category `DAILY SALE BOOK` summary, because this file has no staff names.
- If this summary file is accepted as the source of truth, repair must map `NET SALE VALUE` and `NET SALE QTY`, but staff sales will still remain unavailable unless a staff column exists.

## 13. Verification

Commands requested for final verification:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `git status`
- `git log --oneline -20`

These were run after writing this audit doc.

## 14. Git

Commit message required:

`add daily sales zero after upload audit`

Push status: do not push.

## Final Finding Snapshot

- Affected store/date/report id: Go Planet, `2026-06-13`, `a7419e39-04a9-476b-b9fc-9d90defc6d96`
- Report exists: yes
- `reports.summary.totalNetSale`: 0
- `sales_rows` count: 65
- `sales_rows.net_sale` sum: 0
- Raw file `NET SALE VALUE` sum: INR 215,043
- Raw file `NET SALE QTY` sum: 181
- Staff name status: missing in all rows; source file has no staff column
- Date mismatch status: user-mentioned `2026-07-13` has no data; real app-yesterday `2026-06-13` has the bad Go Planet upload
- Exact root cause: parser alias/validation gap for a summary-format sales file
- Recommended fix: owner repair/delete/replace now; then add parser aliases and zero-total validation before accepting similar uploads

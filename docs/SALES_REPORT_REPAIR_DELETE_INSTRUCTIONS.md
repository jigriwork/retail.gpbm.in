# Sales Report Repair Delete Instructions

Date: 2026-06-14

Version: v7.2.0

Scope: confirmation-only audit for safely deleting or replacing the known bad Go Planet daily sales report. No code, schema, parser, RLS/security, uploaded files, reports, or rows were changed.

Known bad report:

- Store: Go Planet
- Report date: `2026-06-13`
- Report id: `a7419e39-04a9-476b-b9fc-9d90defc6d96`
- File: `130626.xlsx`
- Uploaded by: Rahul Sethi
- Problem: report exists and 65 `sales_rows` exist, but persisted `net_sale`, `quantity`, `bill_no`, and `staff_name` are null/zero.

## 1. Current Delete/Replace Capability

Owner can delete this exact report from the UI.

- Page: `/app/reports/correction`
- Owner-only guard: `requireOwner()` in `app/app/reports/correction/page.tsx`
- Delete action: `deleteSalesReport` in `lib/reports/sales-correction.ts`
- Report list can be filtered by store/date/file name.
- Exact report can be found with Go Planet and date `2026-06-13`, or by searching file name `130626.xlsx`.

Owner can replace this exact report from the UI.

- Page: `/app/reports/correction`
- Replace action: `replaceSalesReport` in `lib/reports/sales-correction.ts`
- Replacement form is shown on each report card.

Confirmation phrases:

- Delete phrase: `DELETE SALES 2026-06-13`
- Replace phrase: `REPLACE SALES 2026-06-13`

Delete behavior:

- Deletes `sales_rows` where `report_id = a7419e39-04a9-476b-b9fc-9d90defc6d96`.
- Deletes the `reports` row where `id = a7419e39-04a9-476b-b9fc-9d90defc6d96` and `report_type = sales`.
- Then attempts to remove the storage file at `sales/gp/2026-06-13/1781368197185-130626.xlsx`.
- Writes an `audit_logs` row with action `delete_sales_report`.
- Revalidates Reports, Sales, Sales Analytics, Staff Sales, Correction Center, Today, and the store page.

Replace behavior:

- Requires owner.
- Requires a corrected file to be selected.
- Parses the replacement file before final confirmation.
- Requires the replacement file date to match the old report date `2026-06-13`.
- Uses the old report store, Go Planet, and rejects rows that explicitly belong to another store.
- Blocks multi-date replacement files with this message path: use Bulk Historical Sales Upload instead.
- Uploads the new file to storage.
- Creates a new `reports` row and new `sales_rows`.
- Deletes the old `sales_rows` and old `reports` row.
- Attempts to remove the old storage file.
- Writes an `audit_logs` row with action `replace_sales_report`.
- If creating the corrected report succeeds but deleting the old report fails, it rolls back the corrected report and new storage file.

Important replace UI detail:

- The first submit without the exact phrase previews the parsed replacement file.
- Browser file inputs do not persist across server action round-trips.
- For final replace, owner must reselect the same file and type `REPLACE SALES 2026-06-13`.
- This is already stated in the form: "Submit without the phrase to preview. For final replace, reselect the same file and type the phrase."

Duplicate behavior:

- Normal daily upload checks for an existing `reports` row for the same store/date.
- Normal upload is blocked until the bad Go Planet `2026-06-13` report is deleted or replaced.
- After delete succeeds, normal upload for Go Planet `2026-06-13` is allowed again.
- Replace does not need normal duplicate upload to pass because it creates the corrected report as part of the correction workflow, then deletes the old report.

## 2. Exact Owner Steps

### Option A: Delete Bad Report, Then Upload Correct Report Again

This is the clearest and safest operational path if the owner has the correct staff-wise or bill-wise report file ready.

Steps:

1. Open `/app/reports/correction`.
2. In Store, choose Go Planet.
3. Set Start to `2026-06-13`.
4. Set End to `2026-06-13`.
5. Optionally search file name `130626.xlsx`.
6. Click Apply.
7. Find the report card for Go Planet, `2026-06-13`, file `130626.xlsx`.
8. In the Delete box, type `DELETE SALES 2026-06-13`.
9. Click Delete sales report.
10. Open `/app/reports/sales?storeId=77c23e20-e3e1-4873-825d-7954103e2267`.
11. Choose report date `2026-06-13`.
12. Upload the correct daily sales file.
13. Confirm the upload summary has non-zero total sale, rows, bill count, and staff names if staff sales are needed.
14. Check `/app/today`.
15. Check `/app/reports/sales/analytics?storeId=77c23e20-e3e1-4873-825d-7954103e2267&period=yesterday`.
16. Check `/app/reports/staff?storeId=77c23e20-e3e1-4873-825d-7954103e2267&period=yesterday`.

### Option B: Replace Bad Report With Correct File

This is safer than delete-then-upload if the owner wants one audited correction action and wants to avoid a gap where the report has been deleted but the new upload has not yet succeeded.

Steps:

1. Open `/app/reports/correction`.
2. In Store, choose Go Planet.
3. Set Start to `2026-06-13`.
4. Set End to `2026-06-13`.
5. Optionally search file name `130626.xlsx`.
6. Click Apply.
7. Find the report card for Go Planet, `2026-06-13`, file `130626.xlsx`.
8. In the Replace box, choose the corrected `.xlsx`, `.xls`, or `.csv` sales file.
9. Leave the confirmation blank and click Replace sales report to preview.
10. Review preview totals: row count, total sale, bill count, return rows, and unmatched staff names.
11. Reselect the same corrected file.
12. Type `REPLACE SALES 2026-06-13`.
13. Click Replace sales report.
14. Confirm success message: "Sales report replaced with corrected file."
15. Check Today, Sales Analytics, and Staff Sales for Go Planet and `2026-06-13`.

Safest recommendation for this bad report:

- Use Option B if the corrected file is ready and owner wants the most controlled correction flow with one audit log entry.
- Use Option A if owner wants to fully remove the bad upload first and then do a normal upload flow.
- Do not reupload through normal Daily Sales Upload before delete/replace, because duplicate protection should block Go Planet `2026-06-13`.

## 3. What File Owner Should Upload

If owner needs staff sales, upload an agent-wise, bill-wise, or transaction sales report with a staff column such as:

- `AGENT NAME`
- `STAFF`
- `STAFF NAME`
- `SALESMAN`
- `SALES PERSON`
- `SOLD BY`

The bad uploaded `DAILY SALE BOOK` summary file cannot produce staff sales because it has no staff/agent column.

If owner uploads only a summary file like `DAILY SALE BOOK`, total sale can be supported after parser aliases/validation are fixed for `NET SALE VALUE` and `NET SALE QTY`, but staff sales will still remain unavailable unless the file includes staff names.

## 4. Last Uploaded File Visibility Audit

### `/app/today` Daily Sales Upload Status card

Currently visible:

- File name: yes, in "Latest Upload" as report date plus file name.
- Upload time: yes.
- Uploaded by: yes.
- Report date: yes.
- File path: no.
- Download/open file link: no.

### `/app/reports/sales`

Currently visible:

- File name: no in the recent sales report list.
- Upload time: no.
- Uploaded by: no.
- Report date: yes.
- File path: no.
- Download/open file link: no.

### `/app/reports/correction`

Currently visible:

- File name: yes.
- Upload time: yes.
- Uploaded by: yes.
- Report date: yes.
- Report id: yes under View details.
- File path: yes under View details.
- Total sale, rows, bills, returns, unmatched staff: yes.
- Download/open file link: no.

### `/app/reports`

Currently visible:

- File name: no.
- Upload time: no.
- Uploaded by: no.
- Report date: yes, latest date and recent sales report date.
- File path: no.
- Download/open file link: no.

### `/app/stores/[storeId]`

Currently visible for sales:

- File name: no.
- Upload time: no.
- Uploaded by: no.
- Report date: yes.
- Latest total sale: yes.
- Latest rows: yes.
- File path: no.
- Download/open file link: no.

Note: store detail pages show uploaded by and file name for salary attendance and stock, but not for sales.

### `/app/reports/sales/analytics`

Currently visible:

- File name: no.
- Upload time: no.
- Uploaded by: no.
- Report date: indirectly through period/date filters and daily trend.
- File path: no.
- Download/open file link: no.

Conclusion:

- Owner can identify the last uploaded sales file most clearly on Today and Correction Center.
- Owner cannot download or open the uploaded sales file from any checked UI page.
- The best next places to add file visibility are Today and Correction Center.
- The best next place to add a safe download/open uploaded file action is Correction Center, owner-only, using a short-lived signed URL if storage access rules and audit expectations are acceptable.

## 5. Recommended Small UI Improvement

No UI code was changed in this task.

Recommended next UI additions:

Today Daily Sales Upload Status card:

- File name
- Uploaded by
- Upload time
- Report date
- View Sales
- Fix Wrong Upload
- Owner-only Download/View Uploaded File if a short-lived signed URL is safe
- Suspicious zero-sales warning when row count is positive but totals are zero

Correction Center:

- Keep showing file name, uploaded by, uploaded time, report id, total sale, row count, bill count, and file path.
- Add a visible warning badge for suspicious zero-sales reports.
- Add owner-only Download/View Uploaded File if signed URL handling is approved.

Suggested warning text:

`Uploaded report has rows but total sale is 0. Please replace or repair this report.`

## 6. Suspicious Zero-Sales Warning Audit

Suspicious condition checked:

- `row_count > 0`
- `summary.totalNetSale = 0`
- `summary.billCount = 0`
- `staffNames` empty

Current status:

- Today card: no explicit suspicious zero-sales warning. It shows total sale 0, bills 0, and latest upload file, but does not label the report suspicious.
- Sales Upload recent report list: no explicit suspicious zero-sales warning. It shows total sale 0, rows 65, bills 0.
- Correction Center: no explicit suspicious zero-sales warning. It shows total sale 0, rows 65, bills 0, unmatched staff 0, and file details.
- Buying Report: has a generic "No sales data" data-confidence state when selected sales metrics are all zero, but it does not point to the uploaded report as suspicious or recommend replacement.

Recommended next fix:

- Add the exact warning text above to Today, Sales Upload recent reports, and Correction Center.
- In Buying Report, add a link to Correction Center when the selected date/store has a processed report with positive rows but zero total sale.

## 7. Verification

Requested commands:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `git status`
- `git log --oneline -20`

These were run after creating this document.

## 8. Git

Commit message:

`explain sales report delete replace workflow`

Push status: do not push.

## Final Answers

- Delete available: yes, owner-only at `/app/reports/correction`.
- Replace available: yes, owner-only at `/app/reports/correction`.
- Delete phrase: `DELETE SALES 2026-06-13`.
- Replace phrase: `REPLACE SALES 2026-06-13`.
- Delete removes rows and report: yes.
- Delete removes storage file: it attempts to remove the stored file and reports a warning if storage removal fails.
- Replace deletes old rows/report: yes, after the corrected report is created.
- Replace inserts new rows/report: yes.
- Replace requires same date: yes.
- Replace uses same store and rejects explicit wrong-store rows: yes.
- Replace blocks multi-date file: yes.
- Replace requires file reselect after preview: yes.
- Audit logs written: yes for delete and replace.
- Duplicate protection blocks normal upload until delete/replace: yes.
- Duplicate protection allows normal upload after delete: yes.
- Uploaded file can currently be downloaded/opened: no.
- Recommended safest immediate action: replace with the correct staff-wise or bill-wise file if ready; otherwise delete the bad report and upload the correct report normally.

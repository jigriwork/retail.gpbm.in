# Sales Correction and Bulk Upload Notes

Date: 2026-06-11

Scope: Sales Data Correction Center and Bulk Historical Sales Upload. Payslip/salary modules, stock parser, RLS weakening, and existing daily sales parser behavior were not changed.

## Correction Route

Route: `/app/reports/correction`

Audience: owner only. Managers are blocked by the page guard and by server-side owner checks inside every mutation action.

Sections:

- Sales Report Correction
- Bulk Historical Sales Upload
- Recent Audit Logs

The Reports page includes an owner-only Data Correction Center card.

## Delete Workflow

Action: `deleteSalesReport`

Behavior:

- Validates the current user is owner server-side.
- Loads only `reports.report_type = sales`.
- Requires confirmation phrase: `DELETE SALES YYYY-MM-DD`.
- Deletes child `sales_rows`.
- Deletes the `reports` row.
- Attempts storage cleanup using `reports.file_path`.
- Revalidates sales/report/today/store paths.
- Writes an `audit_logs` record with action `delete_sales_report`.

After deletion, the normal daily duplicate protection no longer finds that store/date report, so the owner or assigned manager can upload the date again through the regular daily sales page.

## Replace Workflow

Action: `replaceSalesReport`

Behavior:

- Validates owner server-side.
- Loads only an existing sales report.
- Parses the corrected file using the same sales parser.
- Blocks files with multiple detected bill dates and directs owner to bulk upload.
- Validates the corrected file date matches the existing report date.
- Validates any store column rows match the existing report store.
- Shows preview when the confirmation phrase is missing.
- Requires confirmation phrase: `REPLACE SALES YYYY-MM-DD`.
- Uploads the corrected file.
- Inserts a new `reports` row and child `sales_rows`.
- Deletes the old report rows/report after the corrected report is inserted.
- Attempts cleanup of the old storage file.
- Writes an `audit_logs` record with action `replace_sales_report`.

Note: browser file inputs cannot be persisted across action submissions. If owner previews first, the final replace submission requires reselecting the same corrected file and entering the confirmation phrase.

## Bulk Historical Sales Upload Workflow

Action: `bulkHistoricalSalesUpload`

Behavior:

- Owner only.
- Accepts `.xlsx`, `.xls`, and `.csv`.
- Parses the same sales file structure as daily upload.
- Requires every usable row to have `BILL DATE`.
- Groups rows by `saleDate`.
- Preserves negative return rows.
- Uses the current parser's footer/total row skipping.
- Validates store column rows when present.
- Creates one `sales_upload_batches` row for the full upload.
- Stores the original bulk file path on the batch.
- Creates one daily `reports` row per bill date.
- Inserts `sales_rows` under each date's report.
- Links daily reports through `reports.sales_upload_batch_id`.
- Updates batch totals, date counts, status, and summary JSON.
- Writes an `audit_logs` record with action `bulk_sales_upload`.

## Duplicate Behavior Modes

Default: stop if duplicates.

- `stop`: if any date already has a sales report for the store, upload is blocked before batch/file creation.
- `skip`: existing dates are not imported; only missing dates are created.
- `replace`: duplicate dates get new daily reports, then old daily reports are deleted. A per-date `replace_sales_report` audit entry is written for replaced dates.

## Audit Log Behavior

Recent audit logs are shown on `/app/reports/correction`, limited to the latest 25 records.

Logged actions:

- `delete_sales_report`
- `replace_sales_report`
- `bulk_sales_upload`

Metadata includes old/new summaries, file names, storage cleanup result, duplicate behavior, imported/skipped/replaced/failed dates, row counts, and net sale where relevant.

## Owner-Only Security

The correction page uses `requireOwner`.

Every server action also calls `requireOwner`, so direct action calls from a manager are rejected. The implementation uses the normal Supabase server client and relies on existing owner-only RLS for `audit_logs` and `sales_upload_batches`.

The service role key is not exposed or used for these actions.

## Storage Cleanup Limitation

Database rows and storage objects are not in one transaction. If storage cleanup fails after a database delete/replace succeeds, the action still completes and returns a storage warning. The audit log records `storage_deleted` and `storage_warning`.

For replace, the corrected report is parsed and inserted before deleting the old report, so an invalid corrected file does not remove existing business data.

## Known Limitations

- Replace preview requires reselecting the file for final confirmation because file inputs are not retained by the browser after submission.
- Bulk upload uses the original bulk file path for each generated daily report. It does not split and store separate daily files.
- Bulk replace handles one existing report per store/date, matching the app's intended duplicate protection model.
- Bulk upload does not reopen old auto-completed tasks or checklist records for historical dates.
- There is no dedicated automated fixture suite for multi-date sales files yet.

## What Was Not Changed

- Payslip/salary calculations and payslip modules were not changed.
- Stock parser and stock upload behavior were not changed.
- Existing daily sales parser footer skipping and row parsing behavior were reused, not redesigned.
- Existing manager daily sales upload permissions were not weakened.
- RLS policies were not weakened.
- `.env.local` was not touched.


# Suspicious Sales Report Detector Notes

Date: 2026-06-14

Version: v7.4.0

Scope: suspicious sales report detector, upload validation, warning visibility, and release bump. No stock parser, payslip/salary module, uploaded data, report rows, RLS policy, storage policy, or environment secret was changed.

## Detector

Sales reports are flagged when a processed report has rows but the saved summary has zero sale, zero bills, and no staff names.

The shared detector also supports owner-only deep checks for Correction Center report cards:

- saved `sales_rows` exist but their net sale sum is zero
- report summary total differs from saved `sales_rows` total by more than INR 1

Today, Reports, Sales Analytics, Staff Sales, Buying & Restock, and Sales Upload recent reports use summary-level checks to avoid heavy dashboard scans.

Warning text:

`Uploaded report has rows but total sale is 0. Please replace or repair this report.`

Staff warning text:

`This report may not contain staff names. Staff Sales may be unavailable for this report.`

## Warning Locations

Warnings now appear in:

- Today Daily Sales Upload Status cards
- Reports page sales status cards
- Recent sales report cards used by Reports and Sales Upload
- Correction Center report cards
- Sales Analytics for the selected store/date range
- Staff Sales for the selected store/date range
- Buying & Restock data-confidence section
- AI Secretary context as a lightweight monthly suspicious report count and affected store/date/file list

## Parser And Upload Guard

Parser aliases were added:

- `NET SALE VALUE` maps to net sale
- `NET SALE QTY` maps to quantity

Daily upload, report replacement, and bulk historical upload now reject files when parsed rows exist, total sale is zero, and raw sale amount-like columns are present but unmapped.

Error text:

`This file has sale amount columns but the app could not map them. Upload the correct agent-wise report or contact owner to update parser mapping.`

## Staff Column Warning

Daily upload and replacement preview/success now warn when the file has no staff/agent column.

Warning text:

`This file has no staff/agent column. Total sales may work, but Staff Sales will be 0 or unavailable.`

This warning does not block upload because summary-style reports can still be valid for total sales.

## Correction Center

Suspicious report cards show:

- suspicious zero-sales warning
- summary-vs-rows mismatch detail when detected
- `Replace Report`
- `Delete Report`
- `Fix Staff Names` when unmatched staff exists
- `Reprocess with latest parser coming later.`

No fake repair or reprocess action was added.

## Bulk Import Awareness

Bulk Historical Sales Upload uses the same parser guard before storage and batch rows are created. This protects daily upload, correction replacement, bulk historical upload, and future imports that use the same parser/action path.

Full Historical Sales Import and broader Bulk Upload Guardrails remain Phase 3 work.

## Security Notes

- `.env.local` remains ignored and was not committed.
- No RLS or storage policy was weakened.
- No uploaded data, report rows, payslip/salary data, or stock parser behavior was changed.
- AI Secretary receives compact suspicious-report context only, not raw rows.

## Known Limitations

- Today and analytics pages use summary-level detection only.
- Correction Center deep checks are limited to the current report page.
- Reprocess with latest parser is still future work.
- True zero-sale days can look suspicious if they also have rows, zero bills, and no staff names.
- Staff aliases cannot fix reports whose source file has no staff/agent column.

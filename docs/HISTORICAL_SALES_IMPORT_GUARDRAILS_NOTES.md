# Historical Sales Import Guardrails Notes

Date: 2026-06-14

Version: v7.5.0

Scope: historical sales import guardrails, owner preview workflow, financial-year/current-month presets, duplicate controls, missing-date detector, AI Secretary import context, and release bump. No payslip/salary module, stock parser, existing sales data, report rows, RLS policy, storage policy, or environment secret was changed.

## Existing Bulk Upload Audit

The existing Bulk Historical Sales Upload lived in the owner-only Data Correction Center.

Confirmed behavior before this release:

- Owner-only page and action through `requireOwner`.
- Grouped uploaded sales rows by parsed `BILL DATE` / sale date.
- Split one file into one daily `reports` row and matching `sales_rows` per date.
- Supported duplicate modes: stop, skip, replace.
- Validated selected store and rejected explicit wrong-store rows.
- Did not allow multi-date daily replacement; historical bulk handled multi-date files.
- Wrote `sales_upload_batches` and `audit_logs`.
- Inserted sales rows in batches.
- Used the v7.4.0 suspicious parser guard for unmapped amount columns.

Main gaps:

- No required preview step.
- Default duplicate mode was stop instead of skip.
- No date-range preset for current month or financial year.
- No selected-range missing date detector.
- No final confirmation phrase for imports.

## Owner Import Workflow

Owner can use `/app/reports/correction` and open `Historical Sales Import`.

The form supports:

- Current Month to Date
- Financial Year from 1 April
- Custom date range

First submit previews only. Final import requires reselecting the file and typing:

`IMPORT HISTORICAL SALES`

Preview includes:

- selected range
- dates found
- dates found list
- store
- total rows
- total sale
- bill count
- duplicate dates already existing
- dates missing in the selected range
- suspicious zero-total dates
- dates with no staff column
- capped per-date preview rows

## Duplicate Modes

Default mode:

- Skip existing dates

Other modes:

- Stop if duplicates
- Replace existing dates

Replace is still owner-only because Historical Sales Import remains inside the owner-only Correction Center. Replace never happens silently because final import requires the exact confirmation phrase.

## Financial Year Preset

`Financial Year from 1 April` uses India business logic.

For 2026-06-14, the selected range is:

- start: `2026-04-01`
- end: `2026-06-14`

In later years, the start is April 1 of the current Indian financial year.

## Current Month Preset

`Current Month to Date` uses:

- start: first day of the current India month
- end: current India date

For 2026-06-14, the selected range is:

- start: `2026-06-01`
- end: `2026-06-14`

## Missing Date Detector

Preview and final summary show dates missing in the selected range.

The detector treats a date as covered when:

- the uploaded file contains that date, or
- an existing sales report already exists for that store/date

This helps owner check whether April-to-date or month-to-date data is complete.

## Safety Validations

Historical import blocks:

- unsupported file extensions
- no usable rows
- rows without bill/sale date
- future dates
- file dates outside selected range
- explicit wrong-store rows
- amount-like columns that remain unmapped while total sale is zero
- stop mode when duplicate dates exist

Historical import warns in preview for:

- duplicate dates
- missing dates in selected range
- suspicious zero-total dates
- dates without a staff/agent column

## Manager Permission Decision

Manager historical bulk upload is disabled in v7.5.0.

Reason:

- importing financial-year history and replacing existing daily sales reports is high-risk
- Correction Center is already owner-only
- manager replacement of historical dates should wait for a dedicated manager-safe route and policy review

Future manager-safe version should allow managers to import only assigned active stores, skip duplicates only, block replacements, block future dates, and keep strict assigned-store validation.

## Data Update Expectation

After import:

- Sales Analytics reads the new `sales_rows`
- Staff Sales updates if the file has staff names
- Buying & Restock reads the imported sales rows
- Today Daily Sales Upload Status sees the latest report from `reports.summary`
- AI Secretary receives lightweight recent historical import batch context

## Performance Approach

- Preview first.
- Show counts and capped date lists, not raw row tables.
- Insert sales rows in batches.
- Use report summaries for dashboards.
- Keep Today from loading imported rows directly.
- Keep mobile form controls stacked and scannable.

## What Was Not Changed

- Payslip/salary modules
- Stock parser
- Existing uploaded data rows
- Existing reports
- RLS policies
- Storage policies
- Environment secrets

## Known Limitations

- Browser file inputs still require reselecting the same file after preview.
- Import progress is shown as final summary, not a live progress bar.
- Manager historical import remains future work.
- The missing-date detector does not know store closed days or holidays.
- Historical import still depends on a valid bill/sale date column in the file.

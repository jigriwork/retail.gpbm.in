# Daily Sales Upload Status Card Notes

Date: 2026-06-12

Version: v7.2.0

Scope: Today page owner/manager visibility for daily sales uploads. No payslip/salary modules, sales parser, stock parser, uploaded data, RLS/security, incentive logic, report deletion, or data deletion were changed.

## Purpose

The Today page now shows a lightweight `Daily Sales Upload Status` card near the top, below Owner Command Center.

The card answers the owner's immediate question after a manager uploads daily sales:

- Which store has today's report uploaded.
- Which store has yesterday's report uploaded.
- What the latest uploaded report date is.
- Who uploaded the latest report.
- When it was uploaded.
- Total sale, bills, returns, and unmatched staff count from the saved report summary.

## What It Shows

For each active accessible store:

- Store name.
- `Today Report` status.
- `Yesterday Report` status.
- `Latest Upload` report date and file name.
- Uploaded by manager/owner name or email.
- Upload time in India time.
- Total sale.
- Bills.
- Returns.
- Unmatched staff count.
- Staff alias review hint when unmatched staff names exist.

Status badge logic:

- `Needs Staff Alias Review` when the latest report has unmatched staff.
- `Uploaded` when today or yesterday report exists.
- `Late` when neither today nor yesterday exists, but an older latest report exists.
- `Missing` when no sales report exists for the store.

## Today / Yesterday / Latest Logic

Dates use existing India timezone helpers.

- Today report uses India today.
- Yesterday report uses India yesterday.
- Latest upload is the most recent sales report by report date and upload time for that store.

If a manager uploads yesterday's report today morning:

- Yesterday Report shows `Uploaded`.
- Latest Upload shows the report date, upload time, uploader, and totals.

If a manager uploads today's sales at night:

- Today Report shows `Uploaded`.
- Yesterday Report remains based on yesterday.

If the latest report is not today or yesterday:

- Latest Upload still shows its report date.
- The overall badge shows `Late`.

## Owner / Manager Visibility

- Owner sees all active stores through the existing accessible store logic.
- Manager sees only assigned active stores.
- `Fix Wrong Upload` is owner-only.
- Managers see `View Sales`, `Staff Sales`, and `Buying Report`.
- No salary, payslip, or incentive data appears in the card.

## Performance Approach

The card does not load `sales_rows`.

It reuses the existing batched sales status query in `lib/reports/sales-queries.ts`:

- `report_type = sales`
- `store_id IN (...)`
- one reports query for all accessible active stores
- joined uploader profile fields

The card uses `reports.summary` for:

- total sale
- bill count
- returns count
- unmatched staff count
- unmatched staff names

No per-store Supabase calls were added for the card.

## AI Secretary Context

AI Secretary context now includes a compact latest daily sales upload line per accessible store:

- latest report date
- uploaded/missing yesterday status remains available
- uploaded by
- upload time
- total sale

This uses the same reports status data and does not load `sales_rows`.

## Upload Success Clarity

The manager upload success summary now includes:

`Owner can see this upload on Today - Daily Sales Upload Status.`

No upload flow redesign was done.

## Known Limitations

- The card is server-rendered and updates on refresh/navigation after upload; it is not a live push notification.
- Normal daily manager uploads still do not create a separate audit log or notification event.
- If a report row exists but `sales_rows` insertion failed, the card can show report summary data while row-level analytics remain incomplete.
- Uploader display depends on the profile join returning name or email.
- The card intentionally uses report summary values and does not recalculate totals from row-level data.

## What Was Not Changed

- Payslip/salary modules were not changed.
- Sales parser was not changed.
- Stock parser was not changed.
- Uploaded data was not changed.
- RLS/security was not weakened.
- Secrets were not exposed.
- `.env.local` was not touched.
- Incentive logic was not added.
- Reports/data were not deleted.
- Today does not load `sales_rows` for this card.

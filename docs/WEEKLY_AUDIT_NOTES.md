# Weekly Audit Notes

Date: 2026-06-01

## Weekly Audit Day

Weekly audit day is Monday.

The audit dashboard defaults to the last completed Monday to Sunday week. If today is Monday, it shows the previous Monday to Sunday.

Routes added:

- `/app/audit`
- `/app/audit/[storeId]`

Pages updated:

- `/app/today`
- `/app/stores/[storeId]`

## Date Range Logic

Date logic uses Asia/Kolkata business dates.

Supported dashboard choices:

- Previous week
- Current week
- Pick week by date

Picking a date resolves to that date's Monday to Sunday week.

## Sections Included

The weekly audit combines:

- sales summary
- daily sales breakdown
- missing sales report dates
- staff sales ranking
- top categories
- top brands
- rack review completion days
- cleaning review completion days
- manager update days
- open urgent updates
- updates created and resolved during the week
- tasks created, completed and overdue/pending
- slow stock count
- dead stock count
- fast moving low stock count
- high stock low sale count

## Calculated Live

The audit is calculated live from existing tables:

- `reports`
- `sales_rows`
- `rack_reviews`
- `cleaning_reviews`
- `manager_updates`
- `tasks`
- `stock_rows`

The existing `weekly_audits` table is not used yet. Snapshot generation is a TODO after the live audit shape is stable.

## Checklist V1

There is no permanent daily checklist snapshot yet.

For weekly audit v1, discipline is estimated from historical signals:

- sales report days
- rack review days
- cleaning review days
- manager update/no-issues days
- open urgent updates

This is enough to review weekly store discipline without adding schema.

## Access Rules

Owner can view both active stores.

Managers can view only assigned active stores.

MITTY remains hidden because inactive stores are not returned by store access queries.

## Limitations

- Checklist completion is estimated, not a historical checklist snapshot.
- Stock signals use latest stock upload and recent sales movement.
- No AI summary is generated yet.
- No weekly audit snapshot button yet.
- No PDF/export yet.

## Next Recommended Step

Build AI Secretary using audit, sales and stock data. It can summarize weekly findings, highlight risks and draft owner follow-up tasks.

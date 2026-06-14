# Fix Staff Names Shortcuts Notes

Date: 2026-06-14

Version: v7.2.0

Scope: implementation notes for Fix Staff Names shortcuts and staff alias audit logging. No sales parser, stock parser, salary/payslip module, uploaded report data, schema, RLS policy, incentive logic, or environment secret was changed.

## What Unmatched Staff Means

Unmatched staff means a staff name from an uploaded sales file does not have an active store-wise alias in `staff_name_aliases` for source type `sales_report`.

Alias mapping turns uploaded names such as `RITA S`, `RITA1`, or salesman codes into the real staff name used in Staff Sales. Alias changes are applied dynamically by analytics queries, so old reports update in Staff Sales, Sales Analytics, Business Reporting, Today, and Store Detail without rewriting `sales_rows`.

Aliases cannot fix reports where the source file has no staff column. Those reports need a corrected staff-wise, bill-wise, or transaction sales file.

## Shortcuts Added

`/app/today` Daily Sales Upload Status:

- Shows a clear `Unmatched staff found` warning when the latest sales report summary has `unmatchedStaffCount > 0`.
- Shows count and first names from `reports.summary.unmatchedStaffNames`.
- Adds a `Fix Staff Names` button linking to `/app/reports/staff-aliases?storeId={storeId}`.
- Uses the already-loaded sales report summary and does not add a heavy sales row scan.

`/app/today` command shortcuts:

- Adds `Fix Staff Names`.
- Uses the copy: `Map uploaded staff names to real staff names so staff sales becomes accurate.`
- Owner sees it for active stores.
- Manager sees it when the manager has assigned active stores.

`/app/reports/staff`:

- Adds the info message `Staff names are combined using aliases.`
- Adds a `Fix Staff Names` link.
- Uses sales report summaries for the selected store and period to warn when unmatched names are present.
- Links with `storeId` when a single store is selected; otherwise links to the general alias page.

`/app/reports/correction`:

- Adds `Unmatched staff in this upload` on report cards with `summary.unmatchedStaffCount > 0`.
- Shows count and names when available.
- Links to `/app/reports/staff-aliases?storeId={report.store_id}`.

`/app/stores/[storeId]`:

- Adds a latest-sales-upload unmatched staff warning when the latest sales report summary has unmatched staff.
- Links to `/app/reports/staff-aliases?storeId={storeId}`.

`/app/reports/staff-aliases`:

- Adds helper copy explaining that uploaded staff names are mapped to real staff names.
- Adds owner/manager role guidance.

## Owner And Manager Visibility

Owner can manage aliases for all accessible stores. Manager can manage aliases only for assigned active stores, using the existing app authorization checks and existing RLS. Same-store contact validation remains in place before an alias can be saved.

Manager access was not removed. Cross-store alias mapping was not added.

## Audit Log Actions

Alias saves now attempt to write an `audit_logs` row after the alias upsert succeeds.

Actions:

- `create_staff_alias`
- `update_staff_alias`
- `inactivate_staff_alias`
- `activate_staff_alias`

Metadata includes:

- store id
- alias id
- source name
- old values for updates
- new values
- employee contact id
- actor profile id
- actor role

Audit logging is best-effort. If the audit insert fails, the alias save still succeeds. Current audit log RLS is owner-oriented, so manager alias saves may be recorded only if the database policy permits the insert in that environment.

## Known Limitations

Staff Sales warnings are based on `reports.summary`, not a fresh `sales_rows` scan. This keeps the page lightweight, but report summaries are not recalculated when aliases are fixed. A warning can therefore remain visible for an old report even after the analytics view is already corrected by the new alias.

The shortcuts do not recalculate old report summaries, do not rewrite `sales_rows`, and do not create employee contacts unless the existing alias form action is used with `Create staff contact`.

No download/open uploaded file action was added.

No salary, payslip, stock parser, sales parser, incentive, schema, RLS/security, or uploaded data behavior was changed.

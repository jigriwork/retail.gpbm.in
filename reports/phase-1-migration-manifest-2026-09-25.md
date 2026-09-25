# Phase 1 exact migration manifest

Prepared: 25 September 2026 (Asia/Kolkata)
Branch: `codex/phase-1-performance-foundation`
Baseline: `1d7bee3a1754243b9c6766f637f6be99e1cd8613`
Status: **prepared before application; subsequently rehearsed only on isolated localhost databases**

This manifest is the pre-application record required by the owner. At the time it was written, the proposed migration had not been run against production, preview, local, or any other database.

The unchanged manifest was later applied to disposable PostgreSQL and localhost Supabase environments. Production and the linked production project were not contacted for migration application. Results are recorded in `reports/phase-1-db-evidence-2026-09-25.json`.

## 1. Filename and order

One migration is proposed, after the existing 25 migrations:

1. `supabase/migrations/20260925090000_phase1_analytics_summaries.sql`

It is additive and transactional. There is no data migration and no second/index migration in the initial candidate. Supporting indexes are intentionally omitted because the repository already contains composite store/date/month/dimension indexes. An index may be proposed only as a separate manifest revision if isolated `EXPLAIN (ANALYZE, BUFFERS)` evidence proves it necessary.

## 2. Complete object manifest

| Object | Operation | Exact reason |
| --- | --- | --- |
| `public.sales_analytics_summary_v2(uuid[],date,date,integer)` | Create function; `stable`, `security definer`, `search_path=''`, returns `json` | Compute bounded sales totals, daily/store summaries and top-N dimensions in PostgreSQL rather than transferring grouped row detail to Node. |
| `public.staff_sales_summary_v2(uuid[],date,date,integer)` | Create function; `stable`, `security definer`, `search_path=''`, returns `json` | Compute alias-aware staff summaries and source breakdowns without returning all sales rows. |
| `public.stock_analytics_summary_v2(uuid[],date,integer,integer)` | Create function; `stable`, `security definer`, `search_path=''`, returns `json` | Reproduce the current stock/sales identity matching and candidate rules inside PostgreSQL and return only summary/top-N results. |
| `public.weekly_audit_summary_v2(uuid[],date,date,integer)` | Create function; `stable`, `security definer`, `search_path=''`, returns `json` | Collapse the weekly audit network fan-out into one bounded call per requested scope; reuse the three new aggregate functions and aggregate checklist/update/task/review signals in the database. |

Created or changed tables: **none**.
Created or changed columns: **none**.
Created indexes: **none**.
Changed existing indexes: **none**.
Created or changed RLS policies: **none**.
Changed existing functions: **none**.
Dropped or renamed objects: **none**.

The functions read the existing `profiles`, `store_users`, `stores`, `reports`, `sales_rows`, `stock_rows`, `staff_name_aliases`, `rack_reviews`, `cleaning_reviews`, `manager_updates`, and `tasks` objects. They do not read or change employee, payroll, payslip, staff-authentication, announcement, or review/task schema definitions.

## 3. Validation and authorization behaviour

Every RPC:

- rejects an unauthenticated or inactive profile through `public.is_active_user()`;
- rejects null, empty, or null-containing store arrays;
- calls `public.can_access_store` for every requested store;
- rejects an invalid or over-broad date/lookback/top-N input;
- executes with `security definer` only after those checks;
- uses `set search_path = ''` and fully qualified object names;
- reads only `status='processed'` and `is_current=true` reports;
- returns aggregate/minimal JSON, never customer names, customer phones, raw report data, or file paths.

Store authorization is database-enforced. Owners may request accessible active stores under existing rules. A manager may request only current `store_users` assignments. Supplying another store UUID fails before any business result is returned.

## 4. Locks and expected duration

The migration uses only `CREATE FUNCTION`, `REVOKE`, `GRANT`, and `COMMENT ON FUNCTION` inside one transaction.

- It takes PostgreSQL catalog locks needed to create function definitions and ACL rows.
- It does **not** request `ACCESS EXCLUSIVE`, `SHARE`, or row locks on any business table.
- It does not scan business tables during migration.
- Expected migration duration is under one second on an ordinarily responsive database; isolated rehearsal will record the actual duration.
- Later function execution takes normal `ACCESS SHARE` locks while reading source tables, released at statement/transaction end. These do not block ordinary inserts/updates but are not migration-time locks.

No `CREATE INDEX` is present. If a later proven index is proposed, its lock/write characteristics must be added to a revised manifest before that SQL is applied.

## 5. Existing-row writes and backfills

None. The migration does not execute `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `COPY`, a data-changing trigger, or a settings seed. It creates no table and backfills no row.

Freshness is returned from existing report/source timestamps. The application has typed default SLAs. If an owner later creates `app_settings.key='freshness_sla_v1'`, the application may read that validated value; this migration does not insert or alter the setting.

## 6. Execute grants and RLS

For each exact signature:

```sql
revoke all on function ... from public, anon;
grant execute on function ... to authenticated, service_role;
```

| RPC | `anon` | `authenticated` | `service_role` | Internal authorization |
| --- | --- | --- | --- | --- |
| `sales_analytics_summary_v2` | none | execute | execute | active profile + every requested store accessible |
| `staff_sales_summary_v2` | none | execute | execute | active profile + every requested store accessible |
| `stock_analytics_summary_v2` | none | execute | execute | active profile + every requested store accessible |
| `weekly_audit_summary_v2` | none | execute | execute | active profile + every requested store accessible; nested RPCs repeat checks |

No new RLS policy is needed because no relation is created. The functions are security-definer so their explicit active-user/store checks are the authorization boundary; tests must call them as anonymous, owner, assigned manager, cross-store manager, inactive user, and service-role-without-user context. A bare service-role request without an authenticated `auth.uid()` is expected to fail the active-profile check despite having execute privilege.

## 7. Compatibility with `analytics_data`

- `public.analytics_data(uuid[],date,date,date[])` is not dropped, replaced, renamed, re-granted, restricted, or referenced by the migration.
- Its JSON shape and all callers remain available.
- The application feature flag is server-only: `ANALYTICS_QUERY_PATH=legacy|shadow|v2`.
- Default and missing value are `legacy`.
- `legacy` uses only current paths.
- `shadow` renders legacy results while calling v2 for safe aggregate comparison/telemetry in preview; it is not intended for normal production traffic.
- `v2` consumes new RPC output. Legacy code remains compiled and callable.

This allows application rollback without a database rollback.

## 8. Forward correction and feature-flag rollback

Application rollback:

1. Set `ANALYTICS_QUERY_PATH=legacy` in the affected non-production/production environment.
2. Redeploy the last known application commit or the same candidate with the legacy flag.
3. Verify sales, staff, stock and weekly pages use `analytics_data` and current query paths.
4. Leave the unused v2 functions in place; they cannot affect writes or existing callers.

Database correction:

1. Do not run a destructive down migration.
2. Create a new timestamped forward migration using `create or replace function` for the affected v2 signature.
3. Re-run ACL statements and all reconciliation/security tests.
4. Keep the application flag on `legacy` until the correction is approved.

Removal, if ever desired, is a later separately approved change after dependency checks and an observation window.

## 9. Required reconciliation tests

On an isolated clone containing the approved analytical baseline:

1. Confirm current processed source counts are exactly **23,209 sales rows** and **38,129 stock rows**.
2. Compare each v2 reconciliation block with direct SQL and legacy `analytics_data` for:
   - all accessible stores/all history;
   - GP only and BM only;
   - 1-day, 7-day, current-month, custom and empty ranges;
   - June stock per store with 7/15/30/60/90-day movement windows.
3. Exact-match total net sale, total quantity, distinct bill count, source row count, stock quantity, item count, and per-store totals.
4. Compare ordered top staff/brand/category/item results including deterministic tie-breaking.
5. Compare every stock candidate key, match quality, quantity/value, and candidate count with the legacy TypeScript algorithm.
6. Compare weekly sales/staff/missing-report/review/update/task/stock fields with the current weekly composition.
7. Verify output size is at most 500 KB and no private disallowed field name/value is present.
8. Record discrepancies as failures; do not use rounding tolerance except for serialized numeric representation where exact decimal values remain equal.

## 10. Required plan/payload/page evidence

Before and after evidence must include:

- `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, FORMAT JSON)` for legacy-equivalent source queries and each v2 RPC's principal query on the isolated clone;
- execution time, planning time, shared/temp blocks, sort/hash spill, rows scanned/returned, and index usage;
- RPC JSON byte size for owner/all-stores and assigned-manager/single-store cases;
- at least 20 cold/warm page samples for Today, Checklist, Sales analytics, Staff sales, Stock analytics and Weekly audit;
- p50/p95, TTFB, streamed response duration, HTTP size, RPC duration and RPC payload;
- identical optimized application/database candidate in `iad1` and `bom1` preview deployments, with the isolated non-production Supabase database held constant;
- correctness/security tests repeated after the faster regional configuration.

This section records requirements, not results. Results will be appended to the Phase 1 preview evidence report after isolated execution.

## 11. Exact SQL

The exact proposed SQL is the tracked file:

`supabase/migrations/20260925090000_phase1_analytics_summaries.sql`

Its SHA-256 will be recorded in the preview evidence and production runbook. Any SQL change requires refreshing this manifest and re-running the full evidence set. Nothing in this manifest authorizes production application.

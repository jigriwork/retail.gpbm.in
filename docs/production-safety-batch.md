# Production-safety batch: H01, H02, H03, H04, H09

Branch: `fix/p0-security-recovery-safety`. Starting commit: `3394934433dddced93b0726a1a2e0a797461c99e`. This document belongs to the batch commit; `git log -1 --format=%H -- docs/production-safety-batch.md` identifies it.

No deployment, push, merge, production migration, business-data mutation, Storage upload, overwrite or deletion was performed. Dependency manifests/lockfiles and the existing untracked `reports/` and `supabase/temp/` were preserved. C01's internal phone helper remains server-only; C02's permanent evidence retention is preserved and strengthened by transactional report versions.

## Before and after

| Finding | Before | After |
| --- | --- | --- |
| H01 | Analytics inherited PostgREST's 1,000-row cap; some failures rendered zero. | A store-authorized, database aggregate RPC returns a complete snapshot. Server calculations retain full totals, ranks, return counts, staff mappings, stock/buying signals and AI context. Details use stable primary-key ordering, explicit ranges and exact completeness checks; failures surface visibly. Candidate counts cover all matches while display lists retain their existing top-ten size. |
| H02 | Report status could become processed before all row batches succeeded; retries could duplicate partial imports. | Private processing/failed/processed import records, file/operation fingerprints, immutable reserved upload paths and idempotent staging. One PostgreSQL transaction publishes every row, report, batch and audit. Same-store/type locks serialize concurrent publication; successful retries return the saved result. |
| H09 | Corrections could lose valid rows when later operations failed. | Build a complete new version, switch it active and audit in the same transaction. Retain old rows/files, source history, batch links and an owner-only restore RPC. Archive replaces physical report deletion. |
| H04 | Membership ignored inactive profiles; old JWTs could continue reading directly. | Active profiles and active assigned stores are checked by DB helpers; restrictive RLS also protects direct user-ID policies. Server authorization rejects inactive profiles. |
| H03 | Broad authenticated Storage policies crossed store boundaries. | DB-generated reservations and trusted metadata authorize uploads/reads. Photo-reference triggers prevent foreign-path laundering. Original report/photo overwrite and deletion are denied, including to owners. Payslips remain active-owner-only. |

Salary-attendance upload metadata uses the same report lifecycle because direct report writes are now revoked. No payroll calculations or payslip-generation logic were changed. Existing owner-created user actions remain intact.

## Forward-only migrations (not applied to production)

Apply these once, in order through migration history:

1. `20260909100000_active_membership_storage_scope.sql`: active membership helpers, restrictive profile RLS, scoped task policies, source reservations, photo-reference validation, replacement of the six verified broad report/photo Storage policies.
2. `20260909101000_complete_analytics.sql`: one authorized sales/stock/alias snapshot RPC, grouped in PostgreSQL with original row-count weights. JSON output avoids the set-returning API cap; no server row-limit increase.
3. `20260909102000_atomic_report_versions.sql`: private staging/import states, version fields, transactional publication/archive, immutable source linkage, complete batch totals, direct-write privilege removal.
4. `20260909103000_transactional_report_repair.sql`: atomic footer repair and owner-only version restoration.

All four have explicit transaction boundaries. They add schema and change authorization, without deleting/backfilling business records or Storage objects. Existing reports receive `is_current=true`; no blind store/date uniqueness or destructive duplicate cleanup is imposed. Once committed, migration files must not be rerun manually; subsequent corrections should be new forward migrations. Database types were regenerated from the migrated isolated schema using the existing pinned Supabase postgres-meta image.

The app's actual project was identified from its configured URL. Production inspection used read-only Management API queries after the CLI account was corrected: 70 deployed public/Storage policies, the three existing authorization/signup functions, relevant constraints and columns, and 79 distinct report source references. Policies replaced by exact name:

- `storage_reports_owner_all`, `storage_reports_authenticated_insert`, `storage_reports_authenticated_select`
- `storage_review_photos_owner_all`, `storage_review_photos_authenticated_insert`, `storage_review_photos_authenticated_select`

A final read-only bucket check confirmed `reports`, `review-photos` and `payslips` are all private (`public=false`); keep this as a release precondition.

`storage_payslips_owner_all` remains; its `is_owner()` predicate now enforces active status consistently.

## Authorization and transaction self-review

| Surface | Enforced boundary |
| --- | --- |
| `analytics_data` | Active user; every requested store must be active and authorized. Historical inactive report versions excluded. |
| `reserve_source_file` | Active owner/assigned manager, active target store, allowlisted bucket/kind, DB-generated UUID path. No browser-selected path registration. |
| `begin_report_import` | Store authorization; owner required for replacement/bulk; manifest/target-store validation; fingerprint conflict checks; intent audit before upload. |
| `stage_report_chunk`, `commit_report_import`, `fail_report_import` | Derive store from the stored import, validate current access and initiating actor or owner. Commit rechecks state under the same store/type lock as begin. Browser row store/report IDs are ignored. |
| `archive_sales_report`, `repair_sales_report`, `restore_report_version` | Active owner; derive store from the target report; store/type serialization; audit and activation changes in one transaction. |
| Storage helpers and policies | Read access from trusted registry or persisted report/batch/photo references; upload requires the creator's reservation. Restrictive policies deny overwrite/delete of evidence and enforce payslip ownership. |
| Photo triggers | New/changed photo references must match registry store metadata; unchanged legacy references remain compatible. |

All new privileged functions use `SECURITY DEFINER SET search_path=''` and schema-qualified objects. Mutation/analytics RPC execution is revoked from PUBLIC/anon and explicitly granted to authenticated. Anonymous execution of boolean RLS predicates grants no data access. Staging has no client table access. No new service-role application client was introduced. The existing internal staff-alias refresh remains owner-guarded and updates only current report summaries. Exception text returned to clients is limited to known validation messages or a generic retry message; arbitrary DB diagnostics are not exposed.

No original-file `.remove()` path was introduced. New report/photo uploads use `upsert:false`; interrupted-upload retries download and verify the retained object's bytes before staging again. Existing payslip overwrite behavior is outside this batch and unchanged.

## Verification

150 automated tests pass with zero failures or skips:

- Existing 55 C01/C02 cases remain, including 73 daily reports sharing one workbook, delete/replacement retention, the other 72 downloads, unrelated individual evidence, authorization and audit failures. Fixtures now assert retained inactive versions rather than physical report deletion.
- 18 new application cases: complete analytics at 999/1,000/1,001/23,209/38,129 rows, independent totals, stock candidate counts, pagination failures/caps, immutable-upload retries, upload/parser failure and lost commit response.
- 70 real PostgreSQL cases: role/store RLS, old-session deactivation, anonymous/payslip boundaries, forged stores/paths, all 39 stock staging boundaries, a complete 38,129-row stock commit, atomic bulk totals, row/version/audit rollback, archive/restore, concurrent identical uploads and terminated-connection retry.
- Seven real PostgREST HTTP cases: signed disposable JWTs for owner, GP manager, Brand Mark manager, inactive assigned manager and unassigned manager; direct report/Storage-metadata scope, unchanged-JWT deactivation, cross-store/anonymous RPC denial.

The SQL fixtures use native PostgreSQL 16.13 and PostgREST 12.2.12 on fixed loopback ports, with minimal isolated Auth/Storage schemas. They do not use real Auth users or production credentials. Storage RLS is tested in PostgreSQL and through HTTP metadata reads; the full Supabase Storage signed-URL HTTP service and browser login were not emulated. A staging end-to-end check of actual file upload/download/signing remains a release gate.

Other checks: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `git diff --check` all passed. The optimized build generated 38 pages. The build used dummy loopback Supabase settings. A read-only scan of all 55 browser assets found no configured service-role credential; `propagateEmployeePhone` is absent from the public server-action manifest. Live Gemini generation was not run; the relevant context calculations are covered by isolated tests.

Reproduce without loading `.env.local` or selecting a remote database:

```sh
node scripts/test-safety-local.mjs
```

Requires existing `initdb`, `pg_ctl`, `createdb`, `psql`, `pg_isready` and `postgrest` on PATH. The runner refuses an occupied PostgreSQL port 55439, creates its own temporary cluster, applies all repo migrations, starts PostgREST on loopback 55440, runs the suites, and stops/removes only its own cluster. On this Mac the temporary PostgREST binary used the already installed PostgreSQL libpq via `DYLD_LIBRARY_PATH=/opt/homebrew/opt/postgresql@16/lib`; no project dependency was installed or upgraded.

```sh
npx tsc --noEmit
npm run lint
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-build-placeholder SUPABASE_SERVICE_ROLE_KEY=local-build-placeholder npm run build
node scripts/check-safety-build.mjs
git diff --check
```

The final build scanner reads the configured service-role key privately for comparison and emits only pass/fail information.

## Performance evidence

Same 1,001-row fixture, comparing the actual source at starting commit `3394934` with this batch. Times include local module loading and fixture processing, **not production network latency**. Request counts include database/RPC calls. Pagination can add requests when detail datasets exceed one page.

| Flow | Requests before → after | Fixture time before → after |
| --- | ---: | ---: |
| stock summary | 12 → 1 | 194 ms → 46 ms |
| weekly audit (two stores) | 50 → 22 | 204 ms → 72 ms |

The old stock quantity was 2,997; the independently correct complete quantity is 3,003, returned by the new path. The full 38,129-row stock publication also passed independently with 114,387 fixture units. No production performance claim is inferred from these synthetic timings.

## Read-only production reconciliation

| Dataset | Before | After |
| --- | ---: | ---: |
| Reports | 223 | 223 |
| Sales rows | 23,209 | 23,209 |
| Stock rows | 38,129 | 38,129 |
| Report Storage objects | 79 | 79 |

Before: 2026-09-09 09:16:02 UTC. After: 2026-09-09 09:54:18 UTC. The initial check also used read-only SDK counts/Storage listing; the final check used SELECT-only SQL with `read_only:true`. Counts reconcile exactly; this is not a byte-by-byte file comparison. No production mutating request was issued during this batch.

## Application procedure and release gates

1. Review this diff and the four migrations. Take a normal database backup and retain all Storage evidence. Recheck the project identity, deployed policy names and migration history read-only.
2. Apply to an isolated staging project first using the team's migration runner. Run this regression suite and actual Supabase Auth/Storage end-to-end tests for both stores, including cross-store signed-URL creation denial and inactive old JWTs. Confirm recovered source downloads and the owner-created-user workflow.
3. Schedule a coordinated application/database maintenance window. The schema revokes direct report writes; the old application cannot safely keep importing after migration. The new application also requires the new RPCs/columns. Keep writes closed until all four migrations and the matching app revision are present.
4. Use the approved Supabase migration runner to apply precisely the four pending migrations in the order above, recording normal migration history. Do not run ad-hoc cleanup, rewrite legacy files or increase PostgREST's row cap. Validate each transaction and stop if one fails.
5. Recheck business/Storage counts before any intentional uploads. Deploy the matching app only after separate authorization, then verify scoped reads and a staged test import. Reopen writes after validation.

These steps are instructions for a later authorized release; none were performed against production here.

## Rollback / containment plan

Prefer a forward fix. Keep all new tables, staging, source records and report versions. Do not revert only the application to `3394934` after versions exist: older analytics would double-count retained versions and older imports would fail direct-write privileges.

For a publication defect, close writes and use an approved migration to revoke authenticated execution of the affected mutation functions (begin/stage/commit/archive/repair/restore). Leave active membership and immutable-file guards enabled. For a Storage authorization defect, add a temporary restrictive deny policy for reports/review-photos SELECT/INSERT; do not restore broad authenticated policies. For an analytics defect, revoke its RPC until its reviewed `CREATE OR REPLACE FUNCTION` fix is installed. This yields visible unavailability instead of silently insecure/partial results.

Concrete emergency containment SQL, for a later approved operator action only:

```sql
begin;
revoke execute on function public.begin_report_import(uuid,text,text,text,jsonb,text,boolean),
 public.stage_report_chunk(uuid,int,jsonb),public.commit_report_import(uuid),
 public.archive_sales_report(uuid),public.repair_sales_report(uuid,uuid[],jsonb),
 public.restore_report_version(uuid) from authenticated;
create policy safety_hold_read on storage.objects as restrictive for select to anon,authenticated
 using (bucket_id not in ('reports','review-photos'));
create policy safety_hold_insert on storage.objects as restrictive for insert to anon,authenticated
 with check (bucket_id not in ('reports','review-photos'));
commit;
```

Apply that once if needed; record it as a new incident migration. After the forward fix and isolated regression checks, a further approved migration drops only `safety_hold_read`/`safety_hold_insert` and re-grants the exact authenticated execution privileges listed at the end of migrations 102000/103000. Never grant mutation RPCs to anon/PUBLIC or remove the active-profile/source guards.

For a legitimate report rollback, an authenticated active owner can call `restore_report_version` with the verified prior report ID after reviewing its store/date/type and retained source. That atomically changes activation and records an audit; it does not replace or delete the workbook. It is an intentional business-data change requiring separate operational authorization, not part of this batch.

## Manual Supabase Auth action (not performed)

In **Authentication → Sign In / Providers**, turn **Allow new users to sign up** off. Leave email/password login enabled. Existing users can still sign in; owner-created users continue through the existing trusted Admin API action. This is separate from email confirmation settings. [Supabase general configuration](https://supabase.com/docs/guides/auth/general-configuration).

For a removed manager: first deactivate their profile through the owner workflow, remove store assignments, then ban/disable the Auth user to prevent new sessions. Where a session JWT is available to the trusted admin process, revoke all refresh sessions using global admin sign-out. Do not put that JWT in chat or logs. Existing access JWTs can remain valid until expiry, so profile-based DB denial is the immediate control. Previously issued signed URLs remain bearer links until their configured expiration (the current update-photo helper uses ten minutes); already downloaded copies cannot be revoked. [Supabase sessions](https://supabase.com/docs/guides/auth/sessions), [Admin sign-out](https://supabase.com/docs/reference/javascript/auth-admin-signout).

## Remaining risks

- Production is still running the old deployed schema/application until an authorized release. This commit alone does not fix deployed access.
- Full Supabase Auth/Storage service integration and production-scale RPC latency must be checked in staging. The local SQL/HTTP role tests do not simulate every hosted service behavior.
- Grouped analytics can still be large for high-cardinality data; they remain server-only. Transaction payload/memory/timeouts and permanent staging/source growth should be monitored as data grows.
- Detail pagination detects count changes/errors and uses deterministic order; it is not a multi-request MVCC snapshot. Published sales/stock versions are immutable, while rapidly changing operational lists may require retry.
- Existing legacy duplicate logical reports and inconsistent historical summaries are not destructively repaired by this migration. Future writers serialize publication; historical cleanup is a separate authorized task.
- Existing signed URLs can outlive deactivation until expiry. Disabling signup and session cleanup remain manual release actions.

## Exact files changed

- `app/app/error.tsx`
- `app/app/reports/page.tsx`
- `app/app/stores/[storeId]/page.tsx`
- `app/app/today/page.tsx`
- `components/reports/import-status.tsx`
- `docs/production-safety-batch.md`
- `lib/analytics/business.ts`
- `lib/analytics/data.ts`
- `lib/analytics/sales.ts`
- `lib/analytics/stock.ts`
- `lib/audit/weekly.ts`
- `lib/auth/session.ts`
- `lib/checklist/queries.ts`
- `lib/reports/import-lifecycle.ts`
- `lib/reports/salary-actions.ts`
- `lib/reports/salary-queries.ts`
- `lib/reports/sales-actions.ts`
- `lib/reports/sales-correction.ts`
- `lib/reports/sales-queries.ts`
- `lib/reports/source-files.ts`
- `lib/reports/staff-aliases.ts`
- `lib/reports/staff-name-matching.ts`
- `lib/reports/stock-actions.ts`
- `lib/reports/stock-queries.ts`
- `lib/reviews/actions.ts`
- `lib/reviews/queries.ts`
- `lib/secretary/context.ts`
- `lib/supabase/complete-query.ts`
- `lib/supabase/database.types.ts`
- `lib/tasks/queries.ts`
- `lib/updates/actions.ts`
- `lib/updates/queries.ts`
- `scripts/check-safety-build.mjs`
- `scripts/test-safety-local.mjs`
- `supabase/migrations/20260909100000_active_membership_storage_scope.sql`
- `supabase/migrations/20260909101000_complete_analytics.sql`
- `supabase/migrations/20260909102000_atomic_report_versions.sql`
- `supabase/migrations/20260909103000_transactional_report_repair.sql`
- `tests/analytics-safety.test.mjs`
- `tests/database-safety.test.mjs`
- `tests/helpers/app-fixture.mjs`
- `tests/helpers/report-rpcs.mjs`
- `tests/import-lifecycle.test.mjs`
- `tests/postgrest-safety.test.mjs`
- `tests/security-recovery.test.mjs`
- `tests/sql/bootstrap.sql`

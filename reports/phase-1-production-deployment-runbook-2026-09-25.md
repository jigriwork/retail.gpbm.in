# Phase 1 production deployment runbook

Prepared: 25 September 2026 (Asia/Kolkata)
Status: **not authorized for execution**

Candidate baseline: `1d7bee3a1754243b9c6766f637f6be99e1cd8613`
Branch: `codex/phase-1-performance-foundation`
Migration: `20260925090000_phase1_analytics_summaries.sql`
Migration SHA-256: `29b58f4b2e3b585992cbcf0a6cffc29df60ae9f9b135287e961d48a4af4d001c`

The SHA must be recomputed after the final candidate commit and must match the approved evidence. A mismatch aborts the run.

## Preconditions

1. Owner explicitly approves the exact commit, SQL SHA, evidence package, target time, and named operator.
2. Protected Vercel preview is connected only to a separate non-production Supabase project; `iad1` and `bom1` results are complete.
3. Fresh production drift check matches the approved deployed SHA, migration list, function ACLs, RLS policies, table counts, report fingerprints, and Storage inventory.
4. A fresh encrypted logical/Auth/Storage backup has been restored successfully in isolation.
5. `ANALYTICS_QUERY_PATH=legacy` is set for production before deployment.

## Apply

1. Record the production deployment ID and current Auth settings; do not change Auth settings in this database/application release.
2. Apply only `20260925090000_phase1_analytics_summaries.sql` through the established migration operator.
3. Verify all four exact signatures exist, have `prosecdef=true`, `provolatile='s'`, empty configured `search_path`, and the approved comments.
4. Verify `anon` and `public` have no execute; `authenticated` and `service_role` have execute.
5. Re-run owner, assigned-manager, cross-store-manager, inactive-user, anonymous, and service-role-without-user RPC checks.
6. Verify counts remain 23,209 sales rows and 38,129 stock rows and protected fingerprints remain unchanged.
7. Deploy the approved application commit with the flag still `legacy`; smoke-test Today, Checklist, Sales, Staff Sales, Stock, Weekly Audit, reports, payroll, payslips, tasks, and uploads.
8. Enable `shadow` only for the approved owner canary window. Inspect boolean reconciliation, errors, p95, payloads, and privacy-safe telemetry.
9. If shadow evidence remains exact, switch a protected preview/canary to `v2`; production widening requires the owner’s explicit release instruction.

## Abort conditions

- Any unexpected Git/migration/policy/count/object drift
- Any unauthorized-store result, RLS/grant mismatch, reconciliation mismatch, private telemetry field, or report/file regression
- p95 or error-rate regression outside the approved threshold
- Missing verified backup/restore evidence

## Rollback and correction

1. Set `ANALYTICS_QUERY_PATH=legacy` and redeploy the same or last-known-good application. This immediately restores `analytics_data` callers.
2. Leave the additive v2 functions installed; they do not intercept existing paths or write data.
3. Correct a database defect only with a new reviewed forward migration using `create or replace function`, followed by full reconciliation and grant tests.
4. Do not run a destructive down migration, drop an old RPC, change Auth settings, or restore over live production as an ordinary rollback action.

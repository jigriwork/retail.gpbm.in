# Updated release checklist — eight pending migrations

**HARD STOP: no production release is authorized by this document. NOT READY TO RELEASE.** The transport correction is implemented and verified locally; maintenance containment and hosted acceptance are still pending. This checklist supplements the frozen 9 September backup checklist without changing its checksummed artifacts. The old candidate hash/approval phrase does not approve this new candidate.

Candidate: the commit containing `docs/direct-storage-uploads.md` on `fix/p0-security-recovery-safety`. Resolve its exact hash with `git log -1 --format=%H -- docs/direct-storage-uploads.md`. Baseline before this transport batch: `87aa688db1e75d41160bd6817bf5ce2db372619d`. Previous verified live application: `b88d8043b1ea8123a30d16cd61117057e03c8a61`; recheck for drift before any release.

## Completed preparation

- All original 194 tests preserved; total 236 pass.
- Real isolated Auth/Storage/TUS, interrupted resume, concurrent claims, photo and payroll binding, and production-build Chromium upload pass.
- Largest measured Server Action body: 581 bytes with a 15 MiB workbook.
- All 82 available workbook fixtures replayed, zero unexplained differences.
- Typecheck, lint, production build, npm audit (zero), packaged worker and credential scans pass.
- Actual production backup migration rehearsal passes; 54 historical table fingerprints unchanged; failure/containment rollback tested.
- Frozen backup at `/Users/adibsattar/Desktop/retail-gpbm-production-backup-2026-09-09` remains unchanged: 391 checksummed artifacts.

## Exact pending migration order

1. `20260611203000_add_business_reporting_indexes.sql`
2. `20260909100000_active_membership_storage_scope.sql`
3. `20260909101000_complete_analytics.sql`
4. `20260909102000_atomic_report_versions.sql`
5. `20260909103000_transactional_report_repair.sql`
6. `20260909110000_immutable_payslip_versions.sql`
7. `20260909111000_atomic_payroll_imports.sql`
8. **New:** `20260910100000_direct_upload_intents.sql`

The eighth migration adds upload intents, strict scoped upload authorization and atomic completion triggers. It performs no historical data backfill, Storage deletion or bucket configuration change. The preceding seven files are unchanged. All eight were rehearsed together against the actual archive.

## Gates for a later, separately authorized release

1. Recheck candidate/branch, remote and production drift, exact migration history, private bucket limits/MIME settings, current Vercel Fluid/Node settings and backup freshness. If production changed, create a new timestamped backup; never replace the verified backup.
2. Review and obtain explicit approval for the exact candidate and eight-migration bundle. This task does not deploy, push, merge, change Auth settings or apply migrations.
3. Establish and verify a maintenance hold covering all production aliases **and direct Supabase writers**; verify operator bypass and drain active uploads/leases. A Vercel UI-only hold cannot fence direct Storage/database calls. Public signup is unnecessary; any proposed Auth configuration change requires inclusion in the later release approval.
4. In the approved window, dry-run the migration runner against the explicit production project and verify exactly the eight filenames above. Stop on drift/history mismatch; do not reset, seed or blindly repair production migration history. Apply in order with migration history recorded, then compare historical counts/fingerprints before intentional business tests.
5. Deploy only the approved candidate while the hold stays active. Verify private environment variables, parser worker tracing, 128 KiB action limit and 300-second upload-page duration. Validate deployed 1 MB/4.5 MB/6 MB/15 MiB direct uploads, real progress, interruption/resume, expiry, cross-store denial, immutable originals, payroll revision confirmation and signed PDF/ZIP downloads using an approved isolated fixture target. No intentional test mutation belongs in live business records.
6. Measure deployed duration/memory/concurrency and inspect browser network: only metadata through Next; source bytes directly to Storage. Local Mac measurements are not a substitute for this hosted gate. If the 15 MiB workload cannot reliably fit, keep the hold and implement/validate an asynchronous processor before release.
7. Complete owner and assigned-manager acceptance, verify audit/version/source traceability, and only then remove the hold using the reviewed grant/policy restoration plan. Never restore obsolete broad grants.

## Failure and rollback

Stop at the first failed gate and keep writes fenced. New migration DDL is transactional; deliberate failure leaves no partial objects in the rehearsal. Do not drop new tables, delete files or roll back historical data to remove a failed attempt. After a successful schema application, prefer a forward correction. If reverting application code is necessary, keep it behind maintenance because old readers/writers are not compatible with all versioning and privilege changes. Restore only reviewed temporary containment grants; do not reinstate broad pre-security permissions. Backup restoration is a separate approved recovery action, not an automatic rollback command.

No production database, Storage, Auth, GitHub or Vercel changes were performed in this task. The next action is review of the local candidate and remaining operational gates, not automatic release.

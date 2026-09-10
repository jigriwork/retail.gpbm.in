# Controlled production release — 10 September 2026

The user explicitly authorized production candidate `9ce2910dcb0f11e873d0d44544e1ea07a04830e8`, waived pre-release hosted 15 MiB acceptance and instructed an operational write hold without a new maintenance feature. No technical maintenance barrier was claimed.

## Completed production actions

- Exact candidate/branch verified; original 236 tests, typecheck, lint, production build, npm audit (zero findings), worker artifact and credential scans passed again.
- All 391 backup artifacts verified. Live fingerprints for all 54 historical tables matched the verified backup; all 305 live Storage file hashes also matched. No incremental backup was needed.
- All eight migrations in `release-checklist.md` applied in order, individually transactionally recorded in migration history. Every migration passed, and every post-migration comparison preserved all 54 historical table fingerprints using original columns.
- Public signup changed from enabled to disabled and verified.
- `master` fast-forwarded to the exact reviewed candidate and pushed successfully. No squash or extra merge commit.
- Vercel production deployment `dpl_5YozZnq1eKeVa4AcC1wHEhihs8x1` is READY at `https://retailgpbm-h6mm0crms-jigriworks-projects.vercel.app`; `https://retail.gpbm.in` aliases that deployment. Deployment metadata confirms the exact candidate SHA.
- Vercel's production secrets are marked sensitive and cannot be exported in plaintext. The live browser bundle confirms Supabase project `lfqldwbqgsmfvrwozhnu`; authenticated pages and production DB/Storage access confirm the active configuration. No credentials were published.

## Smoke results

Owner and manager authenticated using operator-generated login links without sending email or changing passwords. Owner Today/dashboard, reports, sales/stock analytics, weekly audit, payroll, receivables and batch history returned successfully. Manager assigned-store access passed. Anonymous uploads, cross-store report reads/uploads and manager payroll access were denied. Inactive-user DB/upload denial was checked inside a transaction that restored the original active state by rollback; no existing manager was left inactive. An inactive browser account was unavailable.

The authorized analytics RPC reconciled all 23,209 sales rows and 38,129 stock rows and their numeric totals against live SQL. The first attempt had a transient RPC failure; a repeat succeeded. The shared original workbook referenced by 73 reports and an existing payslip downloaded with owner authorization. Existing 305 files were independently verified against backup SHA-256 values. ZIP failure handling and WhatsApp delivery-status behavior retain the passing regression coverage; no real payslip was deliberately broken or marked delivered for a smoke test.

The controlled upload used a copy of a recovered workbook, explicit `RELEASE_TEST_20260910_...` filename and isolated future date. The original was rehashed and unchanged. The 326,377-byte copy failed during TUS transfer before parsing/finalization. Only the metadata authorization action reached Vercel: **610 bytes**, HTTP 200, approximately **1.917 seconds** to response headers. No report or sales row was published. Duplicate/finalization and 15 MiB production processing could not be tested; hosted peak parser memory remains unmeasured. The separate 15 MiB local fixture was prepared but not submitted after the smaller transfer failed.

The failure is reproducible as `P0001: Upload object does not match its intent`, raised by `public.upload_object_arrived()`. A rolled-back production probe with Supabase's current partial metadata shape (`contentLength`/`mimetype`, no final `size`) reproduces it without committing an object. Current [Supabase Storage uploader code](https://github.com/supabase/storage/blob/master/src/storage/uploader.ts) passes this metadata into its permission-check transaction. The existing trigger skipped only NULL metadata, matching the older local Storage implementation.

Production payroll-page prefetch also generated four new derived ZIP archives during smoke navigation. They were not original PDFs or workbooks. Cleanup checked the exact four object identities against the pre-release inventory and verified zero references from reports, batches, generated payslips or source registry before removing those smoke artifacts. Original business files remain protected. The failed upload intent/source reservation remains for diagnosis and safe retry; its object was not committed. No recovery evidence was deleted.

## Narrow correction prepared locally — NOT deployed

`20260910110000_storage_permission_probe_compatibility.sql` replaces only the arrival trigger function. It leaves NULL or partial metadata probes unconsumed until final `size` exists. Final object size/MIME, intent, actor/store policy, lease, download and SHA-256 checks remain intact. Partial metadata cannot be claimed/finalized. Existing eight migrations remain unchanged.

Two regression tests cover empty and partial permission metadata and prove that neither consumes an intent nor permits a claim. All **238 tests** pass (the original 236 plus two). Typecheck, lint, build and credential scanning pass. A fresh isolated restore of the verified production archive also passed all nine migrations with all 54 historical table fingerprints unchanged, plus transaction-failure and containment-rollback checks. The two payroll ZIP links disable prefetch so viewing a page does not create archives. No new branch, application, Supabase project or maintenance feature was created.

This correction requires a **ninth production migration and a new application commit**. Neither is covered by the exact eight-migration/candidate release already performed. It must be explicitly approved before applying the forward migration, fast-forwarding/pushing master and deploying the correction. Keep the rest of the application live; current uploads fail closed before report publication. Do not weaken validation or remove the upload trigger to bypass the failure.

After approval: apply the ninth migration transactionally and verify original fingerprints; push/deploy the approved correction; repeat the copied-workbook upload, same-intent retry, exact atomic row-count check and 15 MiB test; record request duration/memory if available; remove only successfully verified exact test records/objects; retain failed originals; reverify all original counts/file hashes.

## Historical business inventory

| Item | Before | After eight migrations / smoke business checks |
| --- | ---: | ---: |
| Reports | 223 | 223 |
| Sales rows | 23,209 | 23,209 |
| Stock rows | 38,129 | 38,129 |
| Stores | 3 | 3 |
| Payslip batches | 5 | 5 |
| Payslip rows | 310 | 310 |
| Generated payslips | 221 | 221 |
| Original Storage objects | 305 | 305 |

Auth session/refresh/audit timestamps change as expected from authorized smoke logins. No existing business record or original file was lost. Private operational evidence and the failed copied fixture are retained outside Git at `/Users/adibsattar/Desktop/retail-gpbm-release-2026-09-10`.

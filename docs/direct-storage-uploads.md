# Direct private uploads — release candidate, 10 September 2026

**NOT READY TO RELEASE.** The upload transport blocker is corrected and verified locally. The coordinated maintenance hold and hosted runtime acceptance checks remain release gates. This task authorizes no production changes. Identify this candidate with `git log -1 --format=%H -- docs/direct-storage-uploads.md`.

Branch: `fix/p0-security-recovery-safety`; starting HEAD: `87aa688db1e75d41160bd6817bf5ce2db372619d`. C01/C02/H01/H02/H03/H04/H05/H06/H08/H09/H10/M05/M06 are preserved. The existing seven pending migrations are unchanged; one additive migration is appended. Existing user directories `reports/` and `supabase/temp/` are excluded from this commit.

## Before and after

Previously, Excel/PDF/photo bytes crossed Server Actions with a 16 MB body allowance. That does not bypass Vercel's 4.5 MB function request/response limit. Now the browser hashes and uploads files directly to private Supabase Storage using TUS; Server Actions accept metadata only. PDF and ZIP downloads redirect to short-lived private Storage URLs instead of returning file bodies through Vercel.

All file inputs were traced to their callable actions:

| Workflow | Upload authorization | Finalization |
| --- | --- | --- |
| Daily sales | Active owner or assigned active-store manager | Existing staged atomic report publication |
| Bulk/historical sales | Owner | Existing duplicate/skip/replacement confirmation and atomic multi-day publication |
| Sales replacement | Owner; store derived from target report | New version; original and historical source retained |
| Stock | Active owner or assigned active-store manager | Existing staged atomic report publication |
| Salary-attendance XLS/XLSX/CSV/PDF archive | Active owner or assigned active-store manager | Existing archive validation and atomic publication |
| Payroll workbook | Owner only | Existing fingerprint/revision confirmation, atomic payroll and receivables |
| Rack and cleaning photos | Active owner or assigned active-store manager | Verified intent consumed in photo record transaction |
| Manager-update create/edit attachment | Active owner or assigned active-store manager; edit store derived from existing record | Verified intent consumed in record transaction |

XLS/XLSX/CSV compatibility and the patched vendored SheetJS 0.20.3 engine are unchanged. Photo types are explicitly JPEG/PNG/WebP; the UI no longer advertises arbitrary image formats. All source files have a 15 MiB limit. The only new direct dependency is `tus-js-client` 4.3.1 (previously absent); Next.js and eslint-config-next remain 16.3.3. npm audit has zero findings before and after this transport batch, including development dependencies.

## Authorization and lifecycle

1. Client checks filename, extension, MIME and size before hashing/network I/O. Server repeats validation and current account/store/module authorization before creating an intent. Empty browser MIME is normalized from an allowlisted extension; final bytes must match the approved MIME, fingerprint and parser structure checks.
2. PostgreSQL chooses `uploads/<store UUID>/<random UUID>.<extension>` in the approved private bucket. The browser cannot register its own full path. `source_files` records report/photo ownership; payroll remains owner-only in `payslips`.
3. TUS uses the current user's session, fixed 6 MiB chunks and `x-upsert: false` for every size. Authorization is set exactly once per XHR request, including token refresh. No service-role credential is in the client module. Restrictive Storage policy rechecks intent creator, active profile/store membership, module and expiry.
4. Intent states: `created → uploading → uploaded → processing → processed`, with `failed` retained for retry. Intents expire after 24 hours; expiry revokes unused upload/finalization authority without deleting bytes. A service-only 330-second processing lease prevents simultaneous execution. Two processing slots per Node process bound concurrent parsing memory; busy requests return a safe retry message.
5. Finalization independently claims the stored intent, checks actor/module/store/expiry, loads only its DB-selected bucket/path, checks Storage metadata, downloads with a 30-second deadline, rechecks exact byte count/MIME and SHA-256, and runs the existing isolated spreadsheet validation/parser. Photo magic bytes are checked. Browser path fields cannot select another object.
6. A server-only WeakMap associates the verified internal File with the claim. Privileged binding links it to the existing report/payroll import; it is not a callable browser action. Report/payroll publication consumes the linked intent in the same database transaction. Photo publication additionally checks exact actor, module, store, verified state and live lease. A consumed intent returns saved completion without rerunning mutations, including after a lost response.
7. Failed processing retains its immutable source. A retry reclaims the attempt after failure/lease expiry; the fingerprint and existing atomic import protocol prevent duplicate publication. Payroll revision confirmation delegates to the existing owner-only confirmation RPC and preserves the original binding.

The form displays filename, size, validation, real percentage, retry/resume status, processing and the existing success/duplicate/revision summaries. It blocks repeated submission while uploading/processing. TUS URL persistence and a user/file/form-scoped intent ID allow reselecting the same file after refresh. No credentials are written into that intent cache.

The Next action/proxy limit is now **128 KiB**; the application additionally rejects File entries and metadata above **32 KiB**. Upload result details are bounded to about **60 KB**; large previews are sampled rather than serializing every row. Existing report/batch views retain full records. Generated ZIPs use four downloads at a time, 15 seconds per download and a 90-second scheduling budget, with the existing 1,000-PDF/100-MiB bounds. Any failed PDF prevents archive creation and returns explicit failed IDs. Successful ZIPs are written to unique `exports/<batch>/<UUID>.zip` paths without overwrite, then redirected with a 60-second signed URL. Individual PDF downloads also use owner-authorized 60-second redirects.

## Local verification evidence

All **236 tests passed**, comprising the original **194** and **42** new cases: 27 application/browser boundary tests and 15 database intent tests. These include all requested sizes, oversize/MIME rejection, active/anonymous/inactive/unassigned/cross-store authorization, forged paths, missing bytes, mismatched hashes, expired/reused/concurrent leases, failed parser retention, and same-actor/module photo consumption. Existing domain tests use trusted fixtures behind a mocked transport boundary; the new tests exercise the real boundary separately.

Real isolated Supabase Auth/Storage tests additionally uploaded and finalized all four sizes, interrupted and resumed the 15 MiB TUS transfer, raced simultaneous HTTP claims (one lease only), published a photo atomically, and imported/retried payroll without a second batch. Chromium exercised the production Next build with isolated credentials and a 15 MiB workbook: **3.271 seconds** from submit to summary, **zero page errors**, one authorization header per Storage request. Actual Server Action bodies were **581 and 548 bytes**; largest measured **581 bytes**. A separate real Next transport check measured 427-byte metadata, rejected File submission, and enforced the 128 KiB body limit.

| Workbook bytes | Parsed rows | Local parse seconds | Peak parser process-tree RSS MiB | Direct TUS seconds | Finalization + consumed retry seconds |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000,000 | 219 | 0.518 | 277.9 | 0.089 | 0.560 |
| 4,500,000 | 999 | 0.585 | 328.9 | 0.130 | 0.984 |
| 6,000,000 | 1,332 | 0.565 | 349.9 | 0.123 | 1.113 |
| 15,728,640 (15 MiB) | 3,493 | 0.882 | 484.9 | 0.411 | 2.234 |

These are representative uncompressed OOXML fixtures with valid sales rows, measured on this Mac against loopback Storage. RSS includes the test loader and parser child, not the entire deployed Next instance. They are **not hosted latency or peak-memory measurements**. Read-only Vercel project metadata reports Node 24, Fluid compute, Hobby plan (2 GB/1 vCPU and 300-second maximum). Upload pages explicitly declare 300 seconds; the parser retains its isolated worker timeout/memory/structure limits. Local results fit these limits with substantial margin and do not justify a new asynchronous system, but cold starts, hosted networking and deployed concurrency still require acceptance under a later authorized release hold.

Official references: [Vercel limits](https://vercel.com/docs/functions/limitations), [function duration](https://vercel.com/docs/functions/configuring-functions/duration), [Supabase resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads). Installed Next.js serverActions/maxDuration guides were read before changes.

Replay: **82 files** (79 recovered report workbooks plus three additional files), **zero unexplained differences**. 81 exact matches; one previously explained CRLF-only normalization. Sales: 75 files/23,209 rows. Stock: two files/38,129 rows. Payroll/salary: five files/283 rows. Dates, quantities, totals, returns, brands, categories and staff comparisons are unchanged. No additional original payslip sources were available from the user.

Typecheck, lint, production build, npm audit, packaged worker execution and credential/browser scans pass. The actual production archive was restored into isolated PostgreSQL 17 and all eight pending migrations applied; all **54 historical table fingerprints/counts** remained equal. Deliberate migration failure and privilege-containment rollback also passed. All **391 frozen backup artifacts** still match SHA256SUMS; manifest SHA-256 remains `da318a7f630c456bc454a6ba8a78aa6fb61fbc8b33f92230ce5fc639e09843ed`.

Reproducible checks: `scripts/test-safety-local.mjs`, `scripts/check-upload-limit.mjs`, `scripts/measure-upload-processing.mjs`, `scripts/check-direct-storage.mjs`, `scripts/check-direct-browser.mjs`, existing replay/worker/build scanners. The real Storage script requires a clean disposable Supabase instance at exactly `127.0.0.1:55721`; it never loads project env. Browser testing uses external Playwright via `PLAYWRIGHT_MODULE_PATH`/`CHROMIUM_PATH` and a production build configured solely for that isolated instance. Evidence JSON is summarized alongside this document; credentials and fixture workbooks are excluded from Git.

## Retention and operational policy

Owner-only review can list expired/failed intents through existing owner RLS using: `select id, kind, status, created_at, expires_at from public.upload_intents where status <> 'processed' order by created_at;`. Managers can see only their own assigned-store intents, never another user's. Do not physically delete failed, abandoned or superseded sources; expiry is logical. Reselecting an expired source creates a new unique intent while retaining the prior file. Original reports, bulk workbooks, payroll sources and prior generated PDFs remain recovery evidence permanently. Export ZIPs also accumulate; a future separately reviewed owner-only retention policy may address those derived archives without touching originals.

No cleanup job or delete/overwrite path was introduced. No existing 79 source workbooks, 221 generated records, 226 payslip objects or three July batches were changed. Existing source reservation RPCs remain compatible with the preceding migration batch; new UI workflows use only intent-backed `uploads/` paths.

Full diff review covered all file inputs, action entry points, RLS/SECURITY DEFINER grants, photo binding, atomic consumption, signed-download authorization, package changes and excluded user artifacts. The complete file manifest is recorded in `direct-storage-files.txt`.

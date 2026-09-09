# P1 application safety batch — 2026-09-09

Branch: `fix/p0-security-recovery-safety`. Baseline: `a540026c03eb700a3503bcc1d1d87b43a44c710f`.

This batch implements H05, H06, H08, H10, M05 and M06. The previous C01/C02/H01/H02/H03/H04/H09 fixes and all 150 previous regression tests are retained. No production database, Storage, GitHub or Vercel changes were made. The two new migrations are local only. Existing untracked `reports/` and `supabase/temp/` are excluded from this commit.

## Runtime and dependency decision

Next.js and eslint-config-next move from 16.2.6 to **16.3.3**, the minimum release covering the August security fixes. Merely taking the July 16.2 patch does not cover the subsequent advisories. Official [August security notes](https://nextjs.org/blog/august-2026-security-release) and [16.3 release notes](https://nextjs.org/blog/next-16-3), plus installed App Router/Server Actions/Proxy docs, were reviewed. App Router and Server Actions remain in use.

Both Server Action and Proxy request envelopes are 16 MiB so a **15 MiB file plus multipart overhead** fits; the parser enforces exactly 15 MiB. A real HTTP test through Next Proxy and a Server Action accepts a valid 15 MiB CSV and rejects a file one byte larger at the parser boundary.

| Dependency | Before | After |
| --- | --- | --- |
| next / eslint-config-next | 16.2.6 | 16.3.3 |
| xlsx | 0.18.5, npm registry | 0.20.3, pinned official vendored archive |
| sharp | 0.34.5 | 0.35.4 |
| postcss | 8.5.15 | 8.5.23 |
| nanoid | 3.3.12 | 3.3.18 |
| js-yaml | 4.1.1 | 4.3.2 |
| browserslist | 4.28.2 | 4.28.9 |
| brace-expansion | 1.1.15 / nested 5.0.6 | 1.1.18 / nested 5.0.9 |
| baseline-browser-mapping | 2.10.33 | 2.11.21 |

The lockfile also contains the compatible transitive/platform changes resolved by these updates. No blind or forced audit fix was used. React remains 19.2.4.

`npm audit` before: **9 package findings: 1 critical, 7 high, 1 moderate** (next, xlsx, sharp, postcss, nanoid, js-yaml, browserslist, brace-expansion, baseline-browser-mapping). Next/SheetJS and image-processing paths are application runtime concerns; CSS tooling and nested lint/browser-data packages are primarily build/development concerns, not evidence of a remotely exploitable app endpoint. They were also patched. After: **0 findings at every severity**, including the production-only audit. Audit counts are package findings, not the number of individual advisories. Vendored SheetJS security was reviewed separately; npm audit alone does not establish its safety.

## Spreadsheet processing

The official SheetJS CE 0.20.3 distribution preserves actual Logic parsing semantics and `.xls`, `.xlsx`, `.csv` compatibility. The outdated registry package is removed from the runtime. See [official installation guidance](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) and `vendor/README.md` for source, integrity and license. This avoids an engine replacement that would silently change dates, formatted numbers or legacy BIFF behavior.

All uploaded workbook parsing runs in a child process with no inherited application credentials, a 256 MiB V8 heap limit and a hard 15-second deadline. Child stdout/stderr are suppressed. This is process isolation and resource bounding, **not an OS sandbox or a total RSS cap**.

Limits: 15 MiB input; 16 sheets; 100,000 total rows; 256 columns; 2 million cells/range area; 8,192 characters per string; 128 characters per sheet name; 1,024 ZIP entries and 64 MiB actual expanded ZIP content. ZIP preflight rejects traversal, duplicate paths, encrypted/ZIP64 archives, macros/external-link structures, XML entities/DTDs and invalid OOXML structure. Actual streamed expansion is bounded even if archive metadata lies. MIME, extension and signatures must agree. XLS must be real OLE/BIFF; HTML disguised as XLS is rejected. UTF-8 and BOM UTF-16 CSV are supported. Prototype-pollution keys and unexpected cell structures are rejected. Formulas are not executed or retained as executable formulas.

Sales, stock, payroll and salary-attendance workbook paths use the guarded reader. Payroll parsing finishes before an import can be prepared; finalization failures never publish partial processed batches. Business CSV exports use shared formula-injection escaping, in addition to quote escaping. Unsafe text including formula-leading characters is exported as literal text.

Next production tracing includes the worker and required engine archives. An isolated packaged-worker test copied only traced files into a temporary directory and parsed XLSX successfully. The worker uses JSZip's self-contained build, avoiding a missing transitive dependency in the server artifact.

### Genuine fixture reconciliation

Read-only replay covered **all 79 recovered workbooks**, including two salary workbooks, and three additional Excel files in Downloads: **82 files**. Original file SHA-256 values were verified unchanged after replay. The old parser/engine ran only against these known local fixtures, outside the application/runtime dependency tree.

| Kind | Files | Parsed rows |
| --- | ---: | ---: |
| Sales | 75 | 23,209 |
| Stock | 2 | 38,129 |
| Salary/payroll candidates | 5 | 283 |

**81 files match exactly.** One stock workbook has seven CRLF-to-LF text normalizations (five raw cells and two item-name fields). Canonical line-ending comparison matches completely. Dates, quantities, sales totals, returns, brands, categories and staff names are unchanged. **Zero unexplained differences.** Full parsed structures were compared, not only totals. `p1-spreadsheet-reconciliation.json` records filenames, original hashes, row counts and category/date/staff digests without publishing payroll values.

The user confirmed that additional historical payslip source sheets are unavailable. The five available salary candidates do **not** prove reconciliation of the original sources for all 221 historical generated payslips.

## Payroll behavior

| Workflow | Before | After |
| --- | --- | --- |
| PDF identity | Staff-name paths could collide/overwrite | Database row/job UUID paths, upload without upsert |
| Regeneration | Existing PDF/delivery state replaced | New immutable PDF record linked to previous version; old files/events retained |
| Failed regeneration | Could lose the prior valid artifact | Prior current PDF remains active; failed upload/finalization cannot switch it |
| Delivery | Opening WhatsApp could mark sent | Append-only share-opened event; separate explicit sent confirmation |
| Exact payroll upload | New batches/rows/debts could be duplicated | Workbook SHA-256, unique month/fingerprint/store scope and transactional locking |
| Revised payroll | History could be silently replaced | Comparison plus explicit confirmation, logical store/firm/month/source run and linked versions |
| Receivables | Repeated sync/import could duplicate or overwrite payment state | Atomic row-unique sync, current version relationship, preserved historical balances/payments |
| ZIP | Missing PDFs silently omitted | Four concurrent downloads, explicit failed PDF IDs; no misleading partial archive |

Legacy same-month completed/review batches are checked by reading original source bytes and comparing their hashes before preparing a new import. Identical bytes return the existing batch, even if the upload was renamed. Unavailable legacy evidence blocks the import for verification; it is never guessed from a filename. No historical batch is modified/backfilled or assumed to be a duplicate. The three July batches remain separate.

For new imports, preparation stores a private pending import and immutable source path. Finalization uses database locks and one transaction for batch, logical versions, rows, contacts, receivables, audit and processed status. Failure rolls back all business rows and permits retry. Concurrent identical requests finalize once. A stale comparison requires review again. Browser-supplied row IDs, month/store labels and run IDs do not control persisted identity; trusted store metadata supplies firm/name and the server supplies hashes.

Revised negative payroll carries payment state only for an unambiguous employee-name match within the same logical run. Removed or ambiguous paid/waived/disputed identities stop for accounting review. Original payment rows remain historical; current dashboards exclude superseded receivables. Existing employee contacts are reused without overwriting saved phone numbers. C01's authorized phone flow remains intact.

The owner can view prior PDF versions and their delivery events and follow a payroll version to its previous batch. Payroll RPCs require an active owner and store access; client table mutations of payroll identity/financial/version fields are revoked. Storage UPDATE/DELETE in the payslips bucket is prohibited for application roles. No physical Storage deletion was introduced.

ZIP limits additionally include 1,000 entries, 5 MiB per PDF, 100 MiB total and 15 seconds per download. Exceeding limits reports failure rather than silently reducing the archive.

## Validation

- **194 passing tests**: all previous 150, plus 17 new database tests and 27 new application/parser tests. Breakdown: 70 database safety, 7 real local PostgREST, 17 payroll database, 100 application tests.
- Failure injection covers row/contact/receivable/audit rollback and retries; real concurrent SQL requests cover duplicate upload finalization; malformed structures, prototype keys, resource limits and a hung worker are exercised.
- A separate disposable migration rehearsal preserves all preexisting column values in synthetic **221 generated records / 226 Storage objects / three July batches**. These are fixtures, not a claim of new production verification.
- TypeScript `tsc --noEmit`, ESLint and the Next 16.3.3 production build pass.
- Genuine read-only replay: 82 files, zero unexplained differences.
- Actual 15 MiB upload HTTP boundary and isolated production-worker packaging checks pass.
- Existing build safety scan passes across 57 browser assets; no configured service-role credential and no public internal C01 propagation helper.
- npm audit: zero remaining findings. Full diff reviewed for authorization, direct table bypass, source overwrite/deletion and unrelated changes.

Reproduction: `node scripts/test-safety-local.mjs` requires local PostgreSQL tools and PostgREST on PATH. It creates/destroys its own loopback cluster on 55439 and refuses an occupied port. It never loads `.env.local`. Run `node scripts/check-worker-artifact.mjs` and `node scripts/check-safety-build.mjs` after the production build. `node scripts/check-upload-limit.mjs` creates a disposable Next app with no Supabase credentials. Replay requires the private fixtures and an isolated old engine outside this repository; see `scripts/replay-spreadsheets.mjs` arguments.

## Migrations, rollout and rollback

New forward-only migrations, in order:

1. `20260909110000_immutable_payslip_versions.sql`
2. `20260909111000_atomic_payroll_imports.sql`

They depend on all earlier committed migrations, including the previous safety batch. **Neither was applied to production.** They add tables/columns, tighten grants/Storage policies and introduce owner-only RPCs. There is no historical payroll rewrite, recovery workbook rewrite or Storage deletion. The type generation script introspects the isolated local schema for tables/relationships and declares the RPC signatures; it does not connect to production.

Before any later rollout, rehearse the full migration chain and authenticated upload/PDF/version/payment workflows against isolated staging Auth and Storage. Confirm hosted child-process execution, memory and request duration under representative load. Coordinate schema/application rollout: the old payroll writer cannot function with the new grants and immutability policies, so do not expose old payroll mutations during a schema-first rollout.

Rollback should be a reviewed forward fix. Do not delete version tables or restore broad mutation grants merely to run the old writer. In an incident, suspend payroll mutations while preserving read/download access and evidence. Switching a logical run to an older version requires transactional review of both version flags and receivable/payment history; a blind application revert or current-flag edit is unsafe. No rollback SQL is automatically executed.

## Remaining limitations

- Missing original historical payslip sources limit end-to-end historical reconciliation.
- Legacy-source hashing needs accessible originals and may be slower for months with many old batches; missing evidence deliberately blocks import.
- Ambiguous paid employee identities need explicit accounting reconciliation. Existing name-based contacts are preserved; this batch does not invent employee IDs or merge people.
- Process limits do not replace staging load/capacity validation or an OS sandbox. Serverless execution was not deployed/tested on Vercel.
- Failed PDF attempts can retain an unactivated immutable uploaded file/private job. Retention is intentional; no cleanup deletes evidence.
- SheetJS CDN releases require deliberate provenance/security review; a zero npm audit cannot certify vendored code.

The exact changed-file manifest follows. Private fixtures, source credentials and preexisting untracked audit artifacts are not committed.

## Exact files changed

- `app/app/payslips/[batchId]/page.tsx`
- `app/app/payslips/[batchId]/rows/[rowId]/download/route.ts`
- `app/app/payslips/[batchId]/rows/[rowId]/page.tsx`
- `app/app/payslips/[batchId]/zip/route.ts`
- `app/app/reports/business/page.tsx`
- `components/payslips/sent-status-actions.tsx`
- `components/payslips/upload-form.tsx`
- `components/payslips/whatsapp-actions.tsx`
- `docs/p1-payroll-spreadsheet-safety.md`
- `docs/p1-spreadsheet-reconciliation.json`
- `lib/payslips/actions.ts`
- `lib/payslips/import.ts`
- `lib/payslips/parser.ts`
- `lib/payslips/queries.ts`
- `lib/payslips/receivables-queries.ts`
- `lib/payslips/receivables.ts`
- `lib/payslips/zip.ts`
- `lib/reports/salary-actions.ts`
- `lib/reports/sales-parser.ts`
- `lib/reports/stock-parser.ts`
- `lib/spreadsheets/csv.ts`
- `lib/spreadsheets/read.ts`
- `lib/spreadsheets/worker.cjs`
- `lib/supabase/database.types.ts`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `scripts/check-payroll-migration.mjs`
- `scripts/check-upload-limit.mjs`
- `scripts/check-worker-artifact.mjs`
- `scripts/generate-payroll-types.mjs`
- `scripts/replay-spreadsheets.mjs`
- `scripts/test-safety-local.mjs`
- `supabase/migrations/20260909110000_immutable_payslip_versions.sql`
- `supabase/migrations/20260909111000_atomic_payroll_imports.sql`
- `tests/helpers/app-fixture.mjs`
- `tests/payroll-database.test.mjs`
- `tests/payroll-workflows.test.mjs`
- `tests/spreadsheet-security.test.mjs`
- `vendor/README.md`
- `vendor/xlsx-0.20.3.tgz`

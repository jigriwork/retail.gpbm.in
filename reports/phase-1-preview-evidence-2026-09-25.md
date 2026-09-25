# Phase 1 preview candidate evidence

Evidence date: 25 September 2026 (Asia/Kolkata)
Branch: `codex/phase-1-performance-foundation`
Baseline: `1d7bee3a1754243b9c6766f637f6be99e1cd8613`
Production changes: **none**

## Outcome

The candidate is implemented and passes isolated database, authorization, reconciliation, application, header, build, and local full-volume performance tests. It is not a production release.

A cloud preview was intentionally not deployed because the existing Vercel Preview environment currently contains the same Supabase variable names and 116-day-old values as Production, while the Supabase CLI has no authenticated account on this machine. Deploying in that condition could point preview code at production, which the approved plan expressly prohibits. The `iad1` versus `bom1` comparison therefore remains a required preview-gate item, not fabricated evidence.

## Preview architecture

```text
Current verified isolated preview
  Next.js 16.3.3 production server (localhost)
      └── ANALYTICS_QUERY_PATH=legacy | shadow | v2
      └── localhost-only Supabase stack
            └── verified full-volume restore
            └── Phase 1 migration
            └── synthetic owner only

Required cloud preview gate
  protected Vercel preview (iad1, then identical bom1 build)
      └── preview-only environment variables
      └── separate non-production Supabase project in ap-south-1
            └── synthetic/sanitized volume-equivalent data
            └── no production keys, files, Auth users, or project reference
```

## Exact database result

- Migration time: 28 ms on disposable PostgreSQL 17.
- Tables/columns/indexes/policies/data changed: none.
- Protected-table fingerprints before/after: identical.
- Baseline: exactly 23,209 sales rows and 38,129 stock rows.
- Sales: 23,209 rows, ₹30,229,498.68 net sale, 23,219 quantity — exact legacy/v2 match.
- Named staff: 23,149 source rows, ₹29,784,016.68 net sale, 22,850 quantity — exact match.
- BM stock: 19,623 quantity, 12,860 items; all four candidate counts and ordered top keys exact.
- GP stock: 58,020 quantity, 24,602 items; all four candidate counts and ordered top keys exact.
- No supporting index was added because isolated plans and targets did not prove one necessary.

Full machine-readable results and redacted plans: `reports/phase-1-db-evidence-2026-09-25.json`.

## RPC payload and timing evidence

All figures are 20 sequential local database samples. Local execution excludes Vercel/database network latency.

| Operation | Legacy p95 | v2 p95 | Legacy payload | v2 payload |
| --- | ---: | ---: | ---: | ---: |
| Sales, all history/all stores | 187 ms | 446 ms | 6,841,017 B | 15,752 B |
| Staff v2, all history/all stores | n/a | 508 ms | legacy shares the 6.8 MB source response | 27,421 B |
| BM stock | 89 ms | 382 ms | 3,355,759 B | 18,844 B |
| GP stock | 168 ms | 712 ms | 7,186,538 B | 19,002 B |
| Weekly audit, both stores | multi-call application baseline | 1,044 ms | multiple responses | 44,687 B |

The aggregate SQL spends more local database CPU than the broad legacy fetch, but reduces RPC transfer by roughly 99.6–99.8% and eliminates Node processing of multi-megabyte source responses.

## Page before/after evidence

Twenty authenticated sequential requests per route, production build, identical localhost Supabase/database and synthetic owner. These loopback results validate application/query behavior; the pending regional preview must measure real Vercel network effects.

| Journey | Legacy p95 | v2 p95 | v2 payload | Target | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Today | 166 ms | 163 ms | 85,642 B | <2.0 s / 500 KB | pass |
| Checklist | 101 ms | 105 ms | 31,564 B | <1.5 s / 500 KB | pass |
| Sales analytics | 302 ms | 194 ms | 137,550 B | <2.5 s / 500 KB | pass |
| Staff sales | 255 ms | 232 ms | 124,570 B | <2.5 s / 500 KB | pass |
| Stock analytics | 3,932 ms | 1,104 ms | 165,383 B | <3.0 s / 500 KB | pass |
| Weekly audit | 4,005 ms | 1,560 ms | 43,774 B | <3.0 s / 500 KB | pass |

Machine-readable results: `reports/phase-1-page-performance-2026-09-25.json`.

## Authorization and grant review

- Owner: all four RPCs allowed.
- Assigned single-store manager: all four allowed for the assigned store.
- Cross-store manager: all four denied for an unassigned store.
- Anonymous: denied.
- Inactive profile: denied immediately.
- Service role without an authenticated user: denied.
- `public`/`anon`: execute revoked on all four signatures.
- `authenticated`/`service_role`: execute granted, with active-user/store checks inside each fixed-search-path security-definer function.
- `analytics_data` and every existing function/path remain unchanged and callable.

## Application and security evidence

- Server-only flag: `legacy` (default), `shadow`, or `v2`.
- Shadow renders legacy and logs only a boolean reconciliation result.
- Performance telemetry fields: event, operation, request ID, role class, status, duration, payload bytes, and aggregate row count. No raw parameters, person names, phones, salaries, report contents, employee IDs, or file paths.
- Freshness UI explicitly labels current, stale, and missing inputs and states that upload absence is not a technical failure.
- Headers observed on the production build: CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, strict referrer policy, restrictive Permissions-Policy, and HSTS. `X-Powered-By` is absent.
- TypeScript: pass.
- ESLint: pass.
- Next.js production build: pass.
- Final authenticated v2 smoke: HTTP 200 for Today, Checklist, Sales Analytics, Staff Sales, Stock Analytics, Weekly Audit list, and Weekly Audit detail.
- Final telemetry smoke: repeated operations in one request shared the same request ID and reported `roleClass`, duration, payload bytes, aggregate row count, and status only.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities.
- Candidate secret scan: no credential/token found.

## Preview gate still required

1. Provision or provide access to a separate non-production Supabase project.
2. Replace the Vercel Preview-scoped Supabase URL/anon/service values; do not alter Production-scoped values.
3. Seed only synthetic or irreversibly sanitized volume-equivalent data and a synthetic owner/manager matrix.
4. Deploy the same commit once with `--regions iad1` and once with `--regions bom1` as supported by current Vercel configuration.
5. Repeat 20–30 samples, role isolation, headers, reconciliation, telemetry inspection, and payload checks against the same preview database.
6. Select no production region until the owner reviews the A/B evidence.

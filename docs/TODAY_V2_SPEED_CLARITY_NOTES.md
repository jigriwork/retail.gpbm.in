# Today v2 Speed Clarity Notes

Date: 2026-06-21

Version: v7.6.0

Scope: Phase 4 speed and Today v2 clarity. This release improves `/app/today`, makes the first screen role-aware, moves heavy dashboard sections behind explicit load actions, and reduces login perceived slowness. No sales parser, stock parser, payslip/salary logic, uploaded data, reports/data rows, RLS policy, storage policy, or environment secret was changed.

## What Changed

- Rebuilt `/app/today` into a lighter role-aware dashboard.
- Owner now sees an exception-first command center.
- Manager now sees an assigned-store command center.
- Removed the duplicate Yesterday Sales Reports section from the first load.
- Removed generic bottom status cards from the first load.
- Moved stock pulse, weekly audit, review details, salary attendance detail, receivables, and store list behind explicit load/show-more controls.
- Kept Daily Sales Upload Status visible because it is the main operational trust block.
- Added a `Sync now` button on Today so owner or manager can manually refresh the latest dashboard data.
- Added `/app/today/loading.tsx` skeleton UI so navigation to Today shows immediate feedback.
- Bumped visible app version labels to v7.6.0.

## Owner Today Layout

Owner first viewport now focuses on:

- Missing or suspicious sales reports
- Historical import status
- Buying/stock action
- Staff issues from report summaries
- Today tasks
- Urgent manager updates
- Fix Wrong Upload
- AI Secretary

Owner shortcuts kept:

- Upload Daily Sales
- Daily Sales Status
- Buying & Restock
- Staff Sales
- Fix Staff Names
- Fix Wrong Upload
- Historical Sales Import
- AI Secretary
- Tasks
- Checklist
- Upload Stock

## Manager Today Layout

Manager first viewport now focuses on assigned-store duties:

- My assigned store/stores
- Sales upload warnings
- Upload Stock
- Fix Staff Names
- Checklist
- Tasks
- Send Update
- Staff Sales
- Open urgent updates

If a manager has no assigned active store, Today now shows:

`No store assigned. Please contact owner to assign a store.`

Manager owner-only protections remain:

- No AI Secretary shortcut
- No Fix Wrong Upload shortcut
- No Historical Sales Import shortcut
- No payslip/receivable shortcut
- No Users/Admin shortcut

## Sections Moved Or Lazy-Loaded

These sections no longer load on first render:

- Stock pulse / stock analytics summary
- Weekly audit summaries
- Checklist detail cards
- Review status cards
- Salary attendance detail
- Owner receivables detail
- Accessible store list

Today now shows clear controls:

- `Sync now`
- `Load Stock Pulse`
- `Load Weekly Audit`
- `Show More Details`

This keeps heavy or lower-priority sections available without making every Today visit wait for them.

`Sync now` refreshes the current server-rendered Today data from Supabase. It does not create a background sync job, mutate reports, or bypass existing permissions.

## Performance Approach

First render now favors lightweight sources:

- `reports.summary`
- sales upload statuses
- stock upload overview
- task summary
- manager update summary
- recent historical import batch status

First render avoids:

- raw sales analytics scans
- staff sales raw-row aggregation
- stock row movement analytics
- weekly audit recomputation
- review/checklist detail fan-out
- salary/receivable detail loading

Login perceived speed was also improved:

- `proxy.ts` now skips Supabase `auth.getUser()` for public auth routes (`/login`, `/forgot-password`, `/reset-password`), avoiding a duplicate auth round trip on the login page.
- Login success now navigates to `/app/today` without an extra `router.refresh()`, avoiding a redundant post-login refresh after route replacement.
- `proxy.ts` also excludes `/sw.js`, preventing the browser's missing service-worker request from paying auth middleware cost before returning 404.
- The remaining login wait is mainly the Supabase password verification plus the first authenticated Today request.

## What Was Not Changed

- Sales parser
- Stock parser
- Payslip/salary calculations
- Uploaded files
- Existing reports/data
- RLS policies
- Storage policies
- Environment secrets
- Owner-only Correction Center protections
- Manager assigned-store filtering
- AI Secretary owner-only route guard

## Known Limitations

- Daily Sales Upload Status still reads report status data for assigned stores.
- Full Data Health Center is still future work.
- Historical completion is a lightweight recent-batch status, not a full FY missing-date dashboard yet.
- Stock pulse still performs heavy stock analytics when explicitly loaded.
- Weekly audit still recomputes when explicitly loaded.
- Login can still feel slow if Supabase auth latency is high or the first authenticated Today render is cold.

## Verification Checklist

Required commands for this release:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `git status`
- `git check-ignore .env.local`
- `git log --oneline -25`

Manual checks:

- Owner Today first screen is cleaner.
- Manager Today first screen is assigned-store focused.
- Manager cannot see owner-only actions.
- Manager with no assigned store sees a clear no-store state.
- Daily Sales Upload Status still works.
- Fix Staff Names still works.
- Fix Wrong Upload remains owner-only.
- AI Secretary remains owner-only.
- Payslip/salary modules build and were not changed.
- Today first load has fewer heavy sections.
- Version shows 7.6.0.

Results from this release run:

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Next.js 16.2.6 compiled successfully and generated 38 static pages.
- `git check-ignore .env.local`: `.env.local` is ignored.
- `git status --short` before commit: only expected Phase 4 files were changed or added.
- `git log --oneline -25` before commit started with `60a2f17 add real use performance confusion and roadmap audit`.

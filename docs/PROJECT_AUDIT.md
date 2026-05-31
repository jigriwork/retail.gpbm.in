# GPBM Retail Project Audit

Date: 2026-05-31  
Repository: `retail.gpbm.in`  
Audit scope: app code, routes, Supabase schema artifacts, active store handling, build readiness

## 1. Project Overview

- App name: GPBM Retail
- Purpose: Private internal retail operating app for store visibility, task/reminder management, owner/manager access, reports, reviews, and future AI secretary workflows.
- Tech stack: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase Auth/Postgres/Storage/RLS, Supabase SSR helpers, lucide-react icons.
- Current active stores: Go Planet, Brand Mark.
- Current inactive stores: MITTY is retained for future expansion but should not appear in active app flows.
- Roles: `owner`, `manager`.
- Owner account: `adib@gpbm.in` is expected to be promoted in Supabase.

## 2. Build Status By Module

| Module | Status | Notes |
| --- | --- | --- |
| Landing/login page | Working | Root redirects to `/login`; private premium login UI exists. |
| Auth login | Working | Email/password login via Supabase. |
| Public signup removal | Working | No `/signup` route and no signup link. |
| Protected app shell | Working | `/app` layout redirects unauthenticated users and blocks inactive profiles. |
| Owner role | Working | Owner-only routes/actions are guarded in app code and RLS. |
| Manager role | Partial | Manager access is implemented; needs real account testing. |
| Owner user management | Working | Owner can view profiles, assignments, activate/deactivate users. |
| Manager creation | Working | Requires `SUPABASE_SERVICE_ROLE_KEY` in server environment. |
| Store assignment | Working | Owner can assign managers to active stores. |
| Today dashboard | Partial | Shows accessible stores and task summary; many operational metrics are placeholders. |
| Stores page | Working | Shows active accessible stores only. |
| Store detail page | Placeholder | Connected to store data but feature cards are shells. |
| Tasks list | Working | Tabs and task cards implemented. |
| Add task | Working | Owner/manager rules implemented. |
| Edit task | Working | Detail edit screen and guarded server action implemented. |
| Task status actions | Working | Done, tomorrow, waiting, in progress, cancel, reopen. |
| Private owner tasks | Working | Owner-only private tasks are hidden from managers by RLS/app checks. |
| Manager task restrictions | Partial | App checks implemented; needs real manager testing with assignments. |
| Auto reminders | Working | Manual owner-triggered generation, no cron. |
| Salary day reminder | Working | Generated on day 3. |
| Salary attendance due reminder | Working | Generated on day 1. |
| Stock report due reminder | Working | Generated on day 1 per active store. |
| Monday weekly audit reminder | Working | Generated on Mondays per active store. |
| Rack review placeholder/status | Placeholder | Auto placeholder tasks and store detail card exist; no review form yet. |
| Cleaning review placeholder/status | Placeholder | Auto placeholder tasks and store detail card exist; no review form yet. |
| Reports page | Placeholder | Protected shell only. |
| Sales report upload | Not built yet | Schema/storage exist; UI/parser not implemented. |
| Stock report upload | Not built yet | Schema/storage exist; UI/parser not implemented. |
| Salary attendance report upload | Not built yet | Schema supports report type; upload workflow not implemented. |
| Staff wise sales | Not built yet | Sales rows schema exists; analytics not built. |
| Stock movement/dead stock | Not built yet | Stock rows and thresholds exist; analytics not built. |
| AI Secretary page | Placeholder | Protected shell only. |
| Gemini integration | Not built yet | `GEMINI_API_KEY` expected but not used in current app. |
| AI memory | Not built yet | Tables exist; UI/actions not implemented. |
| Life Flow | Placeholder | Owner-only Today card; life log UI not built. |
| PWA setup | Partial | Metadata exists; manifest asset not audited as complete. |
| Supabase schema | Working | Initial schema and RLS migrations exist. |
| Supabase storage buckets | Working | `reports` and `review-photos` buckets are created by migration. |
| RLS policies | Needs testing | Policies exist; must be tested with real owner/manager users. |
| Vercel readiness | Partial | Build passes; environment variables and Supabase migration application must be configured. |
| GitHub readiness | Working | Repository can be pushed after remote setup. |

## 3. Route Audit

| Route | Purpose | Access | Status |
| --- | --- | --- | --- |
| `/` | Redirect to login | Public | Working |
| `/login` | Private email/password login | Public | Working |
| `/app/today` | Daily dashboard | Protected owner/manager | Partial |
| `/app/stores` | Accessible active stores | Protected owner/manager | Working |
| `/app/stores/[storeId]` | Store detail shell | Protected owner/manager with store access | Placeholder |
| `/app/tasks` | Task dashboard and tabs | Protected owner/manager | Working |
| `/app/tasks/new` | Add task form | Protected owner/manager | Working |
| `/app/tasks/[taskId]` | Edit task form | Protected owner/manager with task access | Working |
| `/app/users` | Owner user management | Owner only | Working |
| `/app/settings` | Read-only app settings | Protected owner/manager | Working |
| `/app/reports` | Reports shell | Protected owner/manager | Placeholder |
| `/app/secretary` | AI secretary shell | Protected owner/manager | Placeholder |

## 4. Database Audit

### Tables Created

- `profiles`
- `stores`
- `store_users`
- `reports`
- `sales_rows`
- `stock_rows`
- `tasks`
- `manager_updates`
- `rack_reviews`
- `cleaning_reviews`
- `life_logs`
- `ai_memories`
- `ai_chats`
- `weekly_audits`
- `app_settings`

### Storage Buckets Created

- `reports`
- `review-photos`

### Seed Data

- Stores seeded by initial migration: Go Planet, Brand Mark, MITTY.
- App settings seeded: salary day, salary attendance due day, stock report due day, weekly audit day, timezone.
- New correction migration sets Go Planet and Brand Mark active and MITTY inactive.

### Active Stores

- Go Planet (`GP`)
- Brand Mark (`BM`)

### Inactive Stores

- MITTY (`MITTY`)

### RLS Enabled Status

RLS is enabled in the initial migration for all app tables and relevant storage object policies are created. Owner helper functions and user store helper functions exist.

### Known Database Risks / TODOs

- RLS needs real owner/manager account testing.
- Hosted Supabase data must receive the latest migration if it was not applied manually.
- Supabase CLI was not available in this local environment during audit.
- The local `.env.local` did not expose `SUPABASE_SERVICE_ROLE_KEY` to the verification script, so the hosted store rows were not updated directly from this environment.
- Current app relies on active-store filtering in app queries plus the new migration for store visibility.

## 5. Environment Audit

Required environment variable names:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

No environment values or secrets should be committed. `.env.local` is ignored by `.gitignore`.

## 6. Known Placeholders

- Store detail feature cards.
- Reports page.
- Sales report upload and parsing.
- Stock report upload and parsing.
- Salary attendance upload.
- Rack review form and photo workflow.
- Cleaning review form and photo workflow.
- Manager update workflow.
- Staff-wise sales analytics.
- Stock movement, slow stock, and dead stock analytics.
- AI Secretary chat/workflow.
- Gemini integration.
- AI memory UI/actions.
- Life Flow UI/actions.
- Full PWA manifest/icon verification.

## 7. Known Working Features

- Private login with no public signup.
- Protected `/app` shell with bottom navigation.
- Owner and manager profile loading.
- Inactive profile block screen.
- Owner-only user management.
- Manager creation through server-side service role key when configured.
- Store assignment to active stores.
- Active store listing for Go Planet and Brand Mark.
- Task dashboard with tabs.
- Task creation and editing.
- Task quick status actions.
- Carry-forward Today logic.
- Owner private task handling.
- Manager task/store restrictions in app actions.
- Owner-triggered Today reminder generation.
- Today task summary and active store task counts.

## 8. Next Recommended Build Steps

1. Reports upload system for sales, stock, and salary attendance.
2. Rack and cleaning review forms with photo upload.
3. Manager update system.
4. Sales and stock analytics, including staff-wise sales and dead stock.
5. AI Secretary with Gemini integration.
6. Life Flow owner-only logging and dashboard.
7. PWA icons/manifest polish and install testing.

## 9. Risk Checklist

- RLS needs real user testing with owner and manager accounts.
- Manager creation requires `SUPABASE_SERVICE_ROLE_KEY` on the server.
- Report parsing is not built yet.
- AI/Gemini is not wired yet.
- MITTY is inactive for now and should remain hidden from active app flows.
- Hosted Supabase data may still need the new migration applied if not run from a deployment pipeline.
- Task duplicate prevention for auto reminders is app-side, not database-enforced.
- Manager task restrictions should be tested with multiple store assignments.

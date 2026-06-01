# GPBM Retail — Functional Gap Audit

Date: 2026-06-01
Status: **All must-fix items resolved**

---

## 1. Store Target Setting

| Check | Status |
|---|---|
| Can owner set monthly target for Go Planet? | ✅ Yes — Settings page |
| Can owner set monthly target for Brand Mark? | ✅ Yes — Settings page |
| UI to enable/disable monthly target? | ✅ Yes — checkbox per store |
| UI to enter target amount? | ✅ Yes — text input with ₹ formatting |
| Target progress in Sales Analytics? | ✅ Yes — already reads `monthly_target_enabled` and `monthly_target` |
| Target progress in Today page? | ✅ Yes — shown in sales pulse when enabled |
| Target shown in Store detail? | ✅ Yes — shows formatted amount or "Not set" |
| Managers can view but not edit? | ✅ Yes — read-only target display for managers |

### What was fixed
- **Created** `lib/stores/target-actions.ts` — server action for owner-only target update
- **Created** `components/stores/store-target-form.tsx` — client form with enable/disable + amount
- **Updated** `app/app/settings/page.tsx` — owner sees editable target forms, managers see read-only
- **Updated** `app/app/stores/[storeId]/page.tsx` — shows formatted target amount instead of "Enabled/Disabled"

### Target flow
1. Owner goes to **Settings** (`/app/settings`)
2. Scrolls to **Store monthly targets** section
3. Toggles **Enable** checkbox per store
4. Enters target amount (e.g. 500000)
5. Clicks **Save target**
6. Target progress appears in Sales Analytics, Today page, and Store detail

---

## 2. Manager Task Flow

| Check | Status |
|---|---|
| Can manager add a store task? | ✅ Yes — `/app/tasks/new` |
| Can manager assign task? | ❌ No — assignment is owner-only (by design) |
| Can manager mark task done/waiting/in progress? | ✅ Yes — task detail page |
| Can manager see only assigned store tasks? | ✅ Yes — RLS enforced |
| Private owner task option hidden for manager? | ✅ Yes — `is_private` checkbox hidden |
| Clear quick link to add task? | ✅ Yes — added to Today, Checklist |

### What was fixed
- **Added** "Add task" quick link to Today page manager quick actions grid
- **Added** "Add task" quick link to Checklist page bottom

### Manager task flow
1. Manager opens **Today** (`/app/today`)
2. Clicks **Add task** in quick actions grid
3. Fills in title, store (pre-limited to assigned store), priority, due date
4. `is_private` and `assignedTo` fields are hidden for managers
5. Click **Create task**
6. Task appears in **Assigned tasks** list

---

## 3. Manager Issue/Update Flow

| Check | Status |
|---|---|
| Can manager add issue/update? | ✅ Yes — `/app/updates/new` |
| Category selection? | ✅ Yes — 13 categories including customer issue, repair, stock arrived, pending work, cash/account note |
| Can manager create task from update? | ✅ Yes — "Create follow-up task" checkbox with assign/due options |
| Owner sees urgent/open updates on Today? | ✅ Yes — count badges + latest open updates |
| Store page shows updates? | ✅ Yes — store detail has updates section |
| "No issues today" shortcut? | ✅ Yes — added to Checklist quick actions |

### What was fixed
- **Added** "Add store issue" quick link to Checklist page
- **Added** "No issues today" quick link to Checklist page (pre-selects category)

### Available update categories
1. New stock arrived
2. Customer issue
3. Alteration / exchange
4. Repair / maintenance
5. Display / rack issue
6. Cleaning issue
7. Staff availability note
8. Cash / account note
9. Owner attention needed
10. Pending work
11. Opening status
12. No issues today
13. Other

### Manager update flow
1. Manager opens **Today** → clicks **Add update** or **Add store issue**
2. Selects store, category, urgency
3. Enters title and details
4. Optionally checks "Create follow-up task" with assignment and due date
5. Optionally attaches a photo
6. Clicks **Add store update**

---

## 4. Page-by-Page Audit

| Page | Route | Status |
|---|---|---|
| Today | `/app/today` | ✅ Working |
| Stores | `/app/stores` | ✅ Working |
| Store detail | `/app/stores/[storeId]` | ✅ Working |
| Reports hub | `/app/reports` | ✅ Working |
| Sales upload | `/app/reports/sales` | ✅ Working |
| Stock upload | `/app/reports/stock` | ✅ Working |
| Salary attendance | `/app/reports/salary-attendance` | ✅ Working |
| Checklist | `/app/checklist` | ✅ Working |
| Checklist store | `/app/checklist/[storeId]` | ✅ Working |
| Reviews hub | `/app/reviews` | ✅ Working |
| Rack review | `/app/reviews/rack` | ✅ Working |
| Cleaning review | `/app/reviews/cleaning` | ✅ Working |
| Updates list | `/app/updates` | ✅ Working |
| Update detail | `/app/updates/[updateId]` | ✅ Working |
| New update | `/app/updates/new` | ✅ Working |
| Tasks list | `/app/tasks` | ✅ Working |
| Task detail | `/app/tasks/[taskId]` | ✅ Working |
| New task | `/app/tasks/new` | ✅ Working |
| Sales analytics | `/app/reports/sales/analytics` | ✅ Working |
| Staff sales | `/app/reports/staff` | ✅ Working |
| Stock analytics | `/app/reports/stock/analytics` | ✅ Working |
| Weekly audit | `/app/audit` | ✅ Working |
| Audit store detail | `/app/audit/[storeId]` | ✅ Working |
| AI Secretary | `/app/secretary` | ✅ Working |
| Life Flow | `/app/life` | ✅ Working (owner-only) |
| Users | `/app/users` | ✅ Working (owner-only) |
| Settings | `/app/settings` | ✅ Working |
| Login | `/login` | ✅ Working |

**Placeholder text found: None.** All pages have real content.

---

## 5. Manager Daily Workflow

A manager can complete their entire daily workflow without calling the owner:

| Step | Action | Route |
|---|---|---|
| 1 | Login | `/login` |
| 2 | See assigned store on Today page | `/app/today` |
| 3 | Open daily checklist | `/app/checklist` |
| 4 | Upload yesterday's sales report | `/app/reports/sales` |
| 5 | Complete rack review | `/app/reviews/rack` |
| 6 | Complete cleaning review | `/app/reviews/cleaning` |
| 7 | Add "No issues today" or report issue | `/app/updates/new` |
| 8 | Add store task if needed | `/app/tasks/new` |
| 9 | View assigned tasks | `/app/tasks` |
| 10 | Upload stock report (1st of month) | `/app/reports/stock` |
| 11 | Upload salary attendance (1st of month) | `/app/reports/salary-attendance` |

Quick action links on Today page: My checklist, Upload sales, Salary attendance, Upload stock, Rack review, Cleaning review, Add update, Add task, Assigned tasks.

---

## 6. Owner Daily Workflow

| Step | Action | Route |
|---|---|---|
| 1 | Login | `/login` |
| 2 | See both stores on Today page | `/app/today` |
| 3 | Check sales missing/uploaded status | `/app/today` (sales pulse) |
| 4 | Check checklist completion | `/app/today` (checklist section) |
| 5 | Review manager updates/issues | `/app/today` (updates section) |
| 6 | Check urgent tasks | `/app/today` (tasks section) |
| 7 | Run weekly audit (Mondays) | `/app/audit` |
| 8 | View sales analytics | `/app/reports/sales/analytics` |
| 9 | View stock analytics | `/app/reports/stock/analytics` |
| 10 | Ask AI Secretary | `/app/secretary` |
| 11 | Set store targets | `/app/settings` |
| 12 | Create/manage users | `/app/users` |
| 13 | Log Life Flow | `/app/life` |

---

## 7. AI Secretary

| Check | Status |
|---|---|
| Gemini health check | ✅ Pass — `npm run check:gemini` exits 0 |
| Default model | `gemini-2.5-flash` (stable, available) |
| Fallback models | `gemini-2.5-flash-lite` → `gemini-flash-latest` → `gemini-2.0-flash` |
| 404 error fixed | ✅ Yes — old `gemini-1.5-flash` was deprecated |
| API key exposure | ✅ None — key is server-only, never printed |
| Secretary hidden from managers | ✅ Yes — bottom nav hides Secretary for non-owner |
| Secretary page owner-gated | ✅ Yes — `requireOwner()` enforced |

---

## 8. Summary

### What was missing and fixed
1. **Store target setting UI** — owner couldn't set targets anywhere → built Settings page target forms
2. **Manager "Add task" quick link** — not obvious how to create tasks → added to Today and Checklist
3. **Manager "Add store issue" quick link** — added to Checklist page
4. **"No issues today" shortcut** — added to Checklist for quick daily confirmation
5. **Store detail target display** — showed "Enabled/Disabled" → now shows formatted ₹ amount

### What is intentionally deferred (post-launch)
- Push notifications / email alerts
- Data export / backup
- Photo upload UI for reviews
- Multi-turn AI conversation context
- Settings edit (salary day, timezone) — currently read-only, changed via Supabase
- Middleware session refresh

### Remaining zero must-fix items before push
None. The app is functionally complete for owner and manager daily use.

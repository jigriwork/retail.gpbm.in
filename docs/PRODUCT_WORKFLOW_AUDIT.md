# GPBM Retail Product + Workflow Audit

Date: 2026-06-01  
Scope: owner daily workflow, store workflow, manager workflow, tasks/reminders, reports readiness, and practical next build order.  
Active stores audited: Go Planet and Brand Mark. MITTY is inactive and should remain hidden from active flows.

## Executive Summary

GPBM Retail has the foundation of an operating system: authentication, protected app shell, owner/manager roles, active stores, tasks, private owner tasks, assignments, app settings display, and automatic reminder generation. It is not yet a real decision system because the most important daily evidence is missing: uploaded sales reports, stock reports, salary attendance, rack/cleaning submissions, manager updates, and analytics.

The strongest current feature is the task system. The weakest business area is reports and structured store updates. Today the owner can see "what tasks exist", but cannot yet see "what happened in each store and what decision should I make".

Fastest useful path: build sales report upload first, then rack/cleaning review forms, then manager updates, then daily checklist templates connected to those workflows.

## 1. Owner Daily Flow: `/app/today`

What the owner sees now:

| Area | Current behavior | Audit |
| --- | --- | --- |
| User/role header | Shows signed-in profile name and role. | Working but not operationally important. |
| Today tasks | Shows total today task count. | Useful if tasks are maintained. |
| Urgent today | Shows urgent task count. | Useful, but depends on good task discipline. |
| Personal/private | Owner-only count for private or non-store tasks. | Useful for owner Life Flow/private work. |
| Store cards | Shows Go Planet and Brand Mark as active stores with today's task count per store. | Useful split between stores. |
| Report cards | Sales, stock, salary attendance, salary day, rack review, cleaning review are static status cards. | Mostly placeholder. They do not show real upload/submission state. |
| Life Flow | Owner-only card. | Placeholder. |

Answers:

- The Today page partly shows what needs attention today through task counts and urgent counts.
- It does show Go Planet and Brand Mark separately through accessible store cards.
- It shows task counts, urgent tasks, and private owner tasks.
- Salary day, salary attendance due, stock report due, Monday audit, daily sales, rack review, and cleaning review can exist as generated reminder tasks, but the visible status cards do not show actual due/completed state. On 2026-06-01, monthly due reminders and Monday audit reminders are relevant if the owner generates today's reminders.
- It is useful as a task landing page, but still too placeholder to be a daily owner command center.
- Missing owner productivity items: real per-store daily status, last sales upload, missing report warnings, rack/cleaning completion state, manager update feed, unresolved customer issues, cash/account check status, salary/stock due logic from settings, and decision alerts.

Important technical note: reminder dates are currently hard-coded in `lib/tasks/reminders.ts` for day 1 and day 3 instead of reading `app_settings`, even though the Settings page displays configurable business rules.

## 2. Store-Wise Flow: `/app/stores` and `/app/stores/[storeId]`

Stores page:

- Shows active stores available to the user.
- For owner, this should show Go Planet and Brand Mark only.
- Store cards show name, code, type, and target enabled/disabled.
- Selecting a store helps reduce confusion because it narrows the owner to one store context.

Store detail page:

| Section | Current state |
| --- | --- |
| Store identity | Working: name, code, type, target flag. |
| Sales | Placeholder card. |
| Stock | Placeholder card. |
| Tasks | Placeholder card, not linked to filtered store tasks. |
| Rack Review | Placeholder card. |
| Cleaning Review | Placeholder card. |
| Staff Sales | Placeholder card. |
| Manager Updates | Placeholder card. |

What works:

- Store access guard exists.
- Store metadata is loaded from Supabase.
- MITTY is hidden if the active-store migration is applied.

What is partial or risky:

- `getAccessibleStores` returns all active stores for non-owner profiles and relies on RLS to filter. The UI name says "assigned stores", but the app query itself does not join `store_users` for managers. RLS may protect the data, but the app code should explicitly fetch assigned stores for clarity and testability.

Store-specific daily checklist that should be added:

- Yesterday sales report uploaded.
- Opening status confirmed.
- Rack/display review submitted.
- Cleaning review submitted.
- Staff attendance/availability noted.
- Manager update added.
- Pending customer issue checked.
- Cash/account check placeholder.
- Stock movement or slow stock check once reports exist.

## 3. Daily Store Task System

| Daily item | Current status | Notes |
| --- | --- | --- |
| Sales report upload | Missing | Only auto reminder and placeholder reports page exist. |
| Rack review | Auto reminder only / placeholder | Database table exists, but no form or completion workflow. |
| Cleaning review | Auto reminder only / placeholder | Database table exists, but no form or completion workflow. |
| Manager updates | Missing UI / schema exists | Table exists, no page/form/feed. |
| Pending issues | Partial through manual tasks | No dedicated issue workflow. |
| Store visit checklist | Missing | Can be approximated with manual tasks only. |
| Account/cash check placeholder | Missing | Should be in checklist before full accounting integration. |
| Staff sales check | Missing | Sales schema supports staff name, analytics not built. |
| Stock movement check | Missing | Stock schema exists, no upload/parser/analytics. |
| Customer issue/follow-up task | Partial | Manual task can cover it, but no customer issue template. |

What is working:

- Manual task creation.
- Store-linked tasks.
- Private owner tasks.
- Assignment to active profiles by owner.
- Status updates, carry-forward, and due-date tabs.
- Owner-triggered auto reminders.

What should be built next:

1. Sales report upload and simple "missing yesterday sales" status.
2. Rack and cleaning review forms that complete the generated reminders.
3. Manager update form/feed.
4. Store daily checklist template that creates or tracks expected daily items.

## 4. Manager Flow

Current manager capability:

| Question | Answer |
| --- | --- |
| Can manager login? | Yes, if the owner creates the manager account and the profile is active. |
| Can manager see only assigned store? | Intended by RLS and `canAccessStore`; app-level `getAccessibleStores` should be tightened to query assignments directly. |
| Can manager see assigned tasks? | Yes by task RLS and task list query. Managers see non-private tasks for assigned stores or assigned to them. |
| Can manager create/update store tasks? | Yes, for assigned stores; managers cannot create private owner tasks. |
| Can manager upload reports? | Not yet. Schema/storage policies exist; UI and parser are missing. |
| Can manager complete rack/cleaning review? | Not yet. Schema allows insert, but no form exists. |
| Can manager add store update? | Not yet. Schema allows insert, but no form exists. |

What is needed to reduce phone calls:

- Manager morning opening status.
- Sales upload by store/date.
- Rack review with photo and checklist.
- Cleaning review with photo and checklist.
- Manager update form that can create an owner task when urgent.
- Customer issue/follow-up form.
- Clear "Done today / missing today" status on store detail and Today page.

## 5. Reports and Decision-Making Readiness

Current data available:

- Database tables exist for `reports`, `sales_rows`, and `stock_rows`.
- Storage bucket migration exists for report files.
- Report type model includes sales, stock, and salary attendance.
- Sales rows can hold item, SKU/barcode, brand, category, quantity, net sale, staff, and customer info.
- Stock rows can hold item, SKU/barcode, brand, category, quantity, MRP, cost, supplier, purchase date, and ageing.

Missing before blind decisions reduce:

- Upload UI for sales, stock, and salary attendance.
- File storage and parser implementation.
- Report validation and duplicate protection by store/date/type.
- Daily sales totals by store.
- Staff-wise sales summary.
- Stock movement comparison between periods.
- Slow/dead stock dashboard.
- Missing report alerts.
- Simple owner questions answered from data: "Which store is weak today?", "Which staff sold?", "Which stock is stuck?", "Which category needs attention?"

Exact report features to build next:

1. Daily sales upload for each store with file saved to `reports` bucket and rows inserted into `sales_rows`.
2. Sales upload status card on Today and store detail: uploaded/missing, date, row count, total net sale.
3. Monthly stock upload with rows inserted into `stock_rows`.
4. Salary attendance upload as stored report with status and file history.
5. Staff-wise sales summary from sales rows.
6. Slow/dead stock report from stock rows and store thresholds.
7. Stock movement comparison after at least two stock periods exist.

## 6. Task and Reminder Quality

What works well:

- Personal tasks are possible by leaving store empty.
- Store tasks are possible through `store_id`.
- Assigned tasks are possible for owner-created tasks.
- Owner private tasks exist and are hidden from managers.
- Carry-forward logic brings overdue carry-forward tasks into Today.
- Tabs for Today, Tomorrow, Upcoming, Pending, and Completed are useful.
- Quick task actions make day-to-day maintenance easier.
- Auto reminders cover daily sales review, rack review, cleaning review, salary attendance due, salary day, stock report due, and Monday weekly audit.

What needs improvement:

- Auto reminders are generic tasks, not connected to real forms or upload status.
- Duplicate prevention is app-side only.
- Reminder schedule does not read `app_settings`.
- There are no checklist templates per store.
- Store detail does not show filtered tasks.
- Manager-created tasks have source `manual`, not `manager`, so source does not reveal manager-originated updates.
- Auto tasks are generated only when owner clicks the button; there is no cron/scheduled generation.

Recommendation:

Add store daily checklist templates, but build the first version as simple generated tasks connected to real routes. Checklist items should become complete when the report/review/update is submitted, not only when someone manually marks a generic task done.

## 7. Recommended Daily Checklist Templates

### Go Planet Daily Checklist

| Item | Build now? | Depends on later reports/analytics? |
| --- | --- | --- |
| Upload yesterday sales report | Yes | Parser needed for totals. |
| Check today opening status | Yes | No dependency. |
| Rack/display check | Yes | Needs rack review form. |
| Cleaning check | Yes | Needs cleaning review form. |
| Staff attendance/availability note | Yes | Can start as manager update/checklist note. |
| Pending customer issue | Yes | Can start as task/update template. |
| Slow/old stock section | Later | Needs stock upload and ageing analytics. |
| Cash/account check placeholder | Yes | Can start as checklist note. |
| Manager update added or not | Yes | Needs manager update form/feed. |

### Brand Mark Daily Checklist

| Item | Build now? | Depends on later reports/analytics? |
| --- | --- | --- |
| Upload yesterday sales report | Yes | Parser needed for totals. |
| Rack/display premium check | Yes | Needs rack review form with Brand Mark fields. |
| Cleaning/trial room check | Yes | Needs cleaning review form. |
| Staff grooming check | Yes | Cleaning review table already has grooming field. |
| Customer follow-up issue | Yes | Can start as task/update template. |
| Alteration/exchange issue placeholder | Yes | Can start as task/update template. |
| Premium category focus | Later | Needs category sales/stock analytics. |
| Perfume/footwear add-on focus | Later | Needs category/staff sales analytics. |
| Content suggestion through AI | Later | Needs AI Secretary and sales/context data. |
| Manager update added or not | Yes | Needs manager update form/feed. |

## 8. Current System Strength Ratings

| Dimension | Rating | Explanation |
| --- | ---: | --- |
| Current usefulness for owner | 4/10 | Owner gets login, stores, tasks, reminders, and private tasks, but not the business evidence needed for decisions. |
| Current usefulness for manager | 3/10 | Manager can use tasks, but cannot yet submit the daily reports/reviews/updates that would replace calls. |
| Current ability to reduce blind decisions | 2/10 | Report tables exist, but no real upload, parsing, summaries, or analytics are available. |
| Current ability to improve store discipline | 4/10 | Task reminders can create discipline, but they are generic until tied to required submissions and checklists. |
| Current readiness for daily use | 4/10 | Usable as a task tracker today; not yet usable as the primary retail operating system. |

Overall current usefulness rating: 4/10.

## 9. Built vs Placeholder

| Feature | Status | Owner value | Next action |
| --- | --- | --- | --- |
| Auth login | Working | Secure access. | Test owner and manager accounts. |
| Protected app shell | Working | Keeps app private. | Keep. |
| Owner profile/role | Working | Owner-only controls. | Keep. |
| Manager creation | Working | Owner can onboard managers. | Ensure service role key is configured only server-side. |
| Store assignment | Working | Links managers to stores. | Tighten non-owner store query to assignments. |
| Active stores | Working | Go Planet and Brand Mark active; MITTY hidden. | Keep migration applied. |
| Today task counts | Working | Shows workload. | Add real operational statuses. |
| Today report status cards | Placeholder | Signals future workflow. | Connect to report/review data. |
| Store list | Working | Store split is clear. | Add status badges per store. |
| Store detail | Partial | Store context exists. | Replace cards with real workflows. |
| Manual tasks | Working | Useful for owner follow-up. | Add templates. |
| Assigned tasks | Working | Owner can delegate. | Add assignment filters. |
| Private owner tasks | Working | Owner personal work stays private. | Keep. |
| Carry-forward tasks | Working | Prevents missed work disappearing. | Keep. |
| Auto reminders | Partial | Useful prompt system. | Read settings and link reminders to workflows. |
| Salary day reminder | Partial | Prompts owner. | Connect to salary attendance/report workflow. |
| Salary attendance due | Partial | Prompts owner. | Build upload/status. |
| Stock report due | Partial | Prompts owner. | Build stock upload/status. |
| Monday audit | Partial | Prompts owner. | Build weekly audit checklist/report. |
| Daily sales reminder | Partial | Prompts review. | Build actual sales upload. |
| Rack review | Placeholder | Important for store discipline. | Build review form/photo upload. |
| Cleaning review | Placeholder | Important for store discipline. | Build review form/photo upload. |
| Manager updates | Placeholder | Would reduce calls. | Build update form/feed. |
| Reports page | Placeholder | Low current value. | Build upload dashboard. |
| Sales report upload | Not built | Biggest decision value. | Build first. |
| Monthly stock report upload | Not built | Enables stock decisions. | Build after sales upload. |
| Salary attendance upload | Not built | Reduces salary-day confusion. | Build with reports. |
| Staff-wise sales | Not built | Helps staff performance review. | Build after sales rows exist. |
| Stock movement | Not built | Helps buying/transfer decisions. | Build after stock rows exist. |
| Slow/dead stock | Not built | High owner value. | Build after stock upload. |
| Store targets | Partial | Schema flag exists. | Add target setup and progress after sales upload. |
| AI Secretary | Placeholder | Future assistant value. | Build after real business data exists. |
| Life Flow | Placeholder | Owner personal value. | Lower priority than store operations. |

## 10. Recommended Next Build Order

1. Sales report upload system for Go Planet and Brand Mark.
2. Sales upload status on Today and store detail, including missing report warning.
3. Rack review and cleaning review forms with photo upload and completion status.
4. Manager updates feed with urgency and optional task creation.
5. Store daily checklist templates that combine sales upload, opening status, rack, cleaning, staff note, customer issue, and manager update.
6. Salary attendance upload and salary-day workflow.
7. Monthly stock report upload.
8. Basic sales analytics: daily total, store comparison, staff-wise sales, category summary.
9. Stock analytics: ageing, slow stock, dead stock, stock movement.
10. Weekly audit summary generated from actual checklist/report data.
11. AI Secretary using real app data and owner commands.
12. Life Flow owner-only module.

Rationale: reports and daily submissions create the facts. Analytics and AI should come after facts exist.

## 11. Technical Checks

Requested commands:

- `npm run lint`
- `npm run build`
- `git status`

Results are recorded in the final response for this audit run.

Technical risks found during audit:

- Non-owner accessible-store query should explicitly fetch assigned stores instead of relying mainly on RLS.
- Reminder schedule should read `app_settings` instead of hard-coded day checks.
- Generic auto reminders should be connected to real workflow completion.
- Report/review tables and storage exist, but no UI/actions/parsers currently use them.
- Real owner/manager RLS testing is still needed.

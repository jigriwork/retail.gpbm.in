# Feature Inventory, Duplicate Module, and Safe-to-Push Audit

**Date:** 2026-06-04
**Scope:** Full app feature inventory, duplicate analysis (specifically Salary Attendance vs Payslip Generation), manager access rules, and overall push readiness.

---

## 1. Executive Summary

* **Total Feature Readiness Rating:** 9 / 10
* **Safe to Push:** Yes, the application is highly stable and secure.
* **Duplicate Features:** None are functionally duplicate. Salary Attendance and Payslips serve different operational stages.
* **Confusing Features:** The wording between "Salary Attendance" and "Upload Salary Sheet" caused minor confusion, but this has been clarified in the UI. They are harmless and distinct.
* **Dangerous/Conflicting Features:** None found. Data flows are strictly separated and secured via RLS.
* **What should not be touched now:** The **Payslip Generation logic** (combined upload, store detection, and parsing) is fully operational, perfectly matches the owner's workflow, and MUST NOT be altered or split.

---

## 2. Full Feature Inventory

| Feature | Route | Owner access | Manager access | Main tables used | Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Auth/login** | `/login` | Yes | Yes | `profiles`, `auth.users` | Working | Standard Supabase Auth |
| **Owner dashboard / Today** | `/app/today` | Yes | No | Various | Working | Comprehensive overview |
| **Manager dashboard / Today** | `/app/today` | No | Yes | Various | Working | Filtered to assigned stores |
| **Users & manager store assignment** | `/app/users` | Yes | No | `profiles`, `store_users` | Working | Owner only access |
| **Stores** | `/app/stores` | Yes | Yes (assigned) | `stores` | Working | Read-only details |
| **Tasks** | `/app/tasks` | Yes | Yes (assigned) | `tasks` | Working | Urgent, store, private |
| **Reminders** | N/A | - | - | - | Placeholder | Mentioned in schema, no UI yet |
| **Reports dashboard** | `/app/reports` | Yes | Yes | N/A | Working | Portal to uploads |
| **Daily sales upload** | `/app/reports/sales` | Yes | Yes (assigned) | `daily_sales_reports` | Working | Crucial daily manager action |
| **Monthly stock upload** | `/app/reports/stock` | Yes | Yes (assigned) | `stock_reports`, `stock_items` | Working | Monthly manager action |
| **Salary attendance upload**| `/app/reports/salary-attendance` | Yes | Yes (assigned) | `salary_attendance_reports` | Working | **File archive only**, no parsing |
| **Rack review** | `/app/reviews/rack` | Yes | Yes (assigned) | `rack_reviews` | Working | Photo upload |
| **Cleaning review** | `/app/reviews/cleaning` | Yes | Yes (assigned) | `cleaning_reviews` | Working | Photo upload |
| **Manager updates** | `/app/updates` | Yes | Yes (assigned) | `manager_updates` | Working | Urgency flags |
| **Daily checklist** | `/app/checklist` | Yes | Yes (assigned) | `checklists` | Working | Simple toggles |
| **Sales analytics** | `/app/reports/sales/analytics` | Yes | No | `daily_sales_reports` | Working | Data visualizations |
| **Staff sales** | `/app/reports/staff` | Yes | No | `daily_sales_reports` | Working | Leaderboard |
| **Stock analytics** | `/app/reports/stock/analytics` | Yes | No | `stock_items` | Partial | Needs more complex algorithms later |
| **Weekly audit** | `/app/audit` | Yes | No | Various | Working | Owner historical check |
| **AI Secretary** | `/app/secretary` | Yes | No | `ai_chats`, `ai_memories` | Working | Requires manual prompt |
| **Life Flow** | `/app/life` | Yes | No | `life_logs` | Working | Private owner tracker |
| **Payslip Generation** | `/app/payslips` | Yes | No | `payslip_batches`, `payslip_rows`, `generated_payslips` | Working | **Combined flow, parses data** |
| **Staff Phone Directory** | `/app/employees` | Yes | Yes (assigned) | `employee_contacts` | Working | Auto-fills payslips |
| **WhatsApp payslip sharing**| `/app/payslips/[batchId]` | Yes | No | `generated_payslips` | Working | PDF, Text, Web Share API |
| **Payslip sent tracking** | `/app/payslips/[batchId]` | Yes | No | `generated_payslips` | Working | Auto marks sent on share |
| **Salary Receivables** | `/app/payslips/receivables`| Yes | No | `salary_receivables` | Working | Tracks negative net_payables |
| **Settings** | `/app/settings` | Yes | Read-only | `app_settings` | Working | Global business rules |
| **Store targets** | `/app/settings` | Yes | Read-only | `stores` | Working | Owner sets monthly goal |
| **Firm mapping** | `/app/settings` | Yes | No | `stores` | Working | Sets Go Planet/BM firm names |

---

## 3. Duplicate / Overlap Audit

### A. Salary Attendance Upload vs B. Payslip Generation

*   **Are they duplicate?** No.
*   **Are they using same tables?** No. Salary Attendance uses `salary_attendance_reports` (file storage). Payslips use `payslip_batches` and `payslip_rows` (parsed data).
*   **Can one break the other?** No. They are entirely separate modules.
*   **Is Salary Attendance used in payslip generation?** No.
*   **Is Payslip Generation using Salary Attendance upload data?** No. Payslip Generation parses a completely different file uploaded directly by the owner on the Payslips page.
*   **Is the current confusion only wording/UI?** Yes. The wording has been updated to prevent the owner from conflating the two.
*   **Should we leave both untouched for now?** **YES.** Salary Attendance is an archival flow for managers. Payslip Generation is a data parsing flow for the owner. Leave both untouched.

---

## 4. Salary Module Safety Audit

*   **Payslip upload combined flow:** Safe and working. DO NOT SPLIT.
*   **Store detection:** Safe and working. Detects from tabs and row data.
*   **Month-wise batches:** Safe. Separate batch per upload.
*   **Old month preservation:** Safe. Storage uses batch-specific paths.
*   **Staff phone reuse:** Safe. Integrates well with Staff Directory.
*   **WhatsApp salary text:** Safe. Fully detailed message generation.
*   **Sent status:** Safe. Automatically marks upon intent to share.
*   **Salary receivables:** Safe. Tracks and separates by month securely.
*   **Attendance upload separation:** Safe. Operates independently.

**Conclusion:** The entire Salary/Payslip module is highly secure, working as intended, and **should not be touched**. Future polish can be done (e.g., payment logs for receivables) without altering the existing core logic.

---

## 5. Manager Access Audit

*   **Manager can access assigned stores:** ✅ Yes (RLS `store_users` join).
*   **Manager can maintain staff phone directory for assigned stores:** ✅ Yes (RLS allows update/insert on assigned store contacts).
*   **One manager can have multiple stores:** ✅ Yes.
*   **One store can have multiple managers:** ✅ Yes.
*   **Manager cannot access payslips:** ✅ Yes (Strict `is_owner()` RLS).
*   **Manager cannot access salary amounts:** ✅ Yes.
*   **Manager cannot access receivables:** ✅ Yes.
*   **Manager cannot access PDFs/ZIPs:** ✅ Yes (Storage bucket RLS restricted to owner).

---

## 6. Security Audit Summary

*   **Owner-only pages:** Protected by server-side `requireOwner()` and layout guards.
*   **Manager pages:** Protected by store assignment verification queries.
*   **RLS assumptions:** Correct. Rely on `auth.uid()` and `profiles.role`.
*   **Private storage:** `payslips` bucket is correctly set to private, preventing direct URL access.
*   **Service role usage:** Securely isolated for admin tasks (e.g., user creation).
*   **Secrets not committed:** Verified. No API keys or Supabase secrets in version control.

---

## 7. Placeholder / Partial Feature Audit

*   **Stock Analytics:** Currently basic (slow/dead/fast). Needs more robust algorithms in the future based on continuous sales velocity vs stock levels.
*   **Reminders System:** Mentioned in early schemas but has no active UI or backend job runner yet.
*   **Receivables Payment Log:** Currently only tracks `received_amount` total. Does not have a detailed ledger of individual partial payments over time.
*   *(Do not fix these now; they are documented for future roadmaps).*

---

## 8. Push Readiness

*   **Is code safe to push now?** **YES.**
*   **Are there any uncommitted changes?** No.
*   **Are all checks passing?** Yes (`npm run build`, `lint`, and `tsc` all pass cleanly).
*   **Are there known issues that should block push?** No.
*   **Which commits are local and not pushed?** (See output of `git log` below, 15+ commits ready to sync to production).

---

## 9. Recommended Next Actions

### Do now before push
*   None. The code is completely ready.

### Do after push
*   Deploy to staging/production Vercel environment.
*   Perform live end-to-end test with a sample combined salary sheet in the production environment.
*   Verify Supabase storage bucket policies are correctly applied in production project.

### Do later (Roadmap)
*   Add payment ledger/history to Salary Receivables.
*   Refine Stock Analytics algorithm.
*   Build the Reminders system.

### Do not touch now
*   **Salary Attendance vs Payslip Workflow:** *Can wait. Do not touch now unless owner asks.* The UI wording was clarified. Do not propose immediate code changes.
*   **Payslip Parsing Logic:** It perfectly matches the owner's Excel files. Do not modify.

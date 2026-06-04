# Monthly Salary and Payslip Workflow Audit

**Date:** 2026-06-04
**Auditor:** Automated code review
**Scope:** Full monthly salary and payslip workflow — combined upload, month-wise batches, phone reuse, WhatsApp sharing, receivables, security, and UI clarity.

---

## 1. Combined Salary Sheet Upload Audit

**Result: ✅ Working**

### How it works

The upload flow at `/app/payslips/upload` accepts **one combined salary sheet** (`.xlsx`, `.xls`, `.csv`).

**Store detection is three-layer:**

1. **Row-level `store` column** — If the sheet has a "store" / "store name" / "branch" column, each row is matched to Go Planet or Brand Mark using `detectStoreFromText()`.
2. **Sheet tab name** — If the workbook has tabs named "Go Planet" / "Brand Mark" / "GP" / "BM", rows in that tab inherit the tab's store.
3. **Fallback store selector** — The upload form has a "Store selection" dropdown defaulting to "Auto detect". Only used when both row-level and tab-level detection fail.

### Files involved

| File | Role |
|---|---|
| [upload/page.tsx](file:///g:/retail.gpbm.in/app/app/payslips/upload/page.tsx) | Upload page, owner-only check, filters stores to GP/BM |
| [upload-form.tsx](file:///g:/retail.gpbm.in/components/payslips/upload-form.tsx) | Form with month picker, fallback store selector, file input |
| [parser.ts](file:///g:/retail.gpbm.in/lib/payslips/parser.ts) | `parsePayslipWorkbook()` — iterates all sheets, detects store per tab and per row |
| [actions.ts](file:///g:/retail.gpbm.in/lib/payslips/actions.ts#L348-L524) | `uploadPayslipSalarySheet()` — validates, stores source file, creates batch, inserts rows |

### Specific checks

| Check | Status | Detail |
|---|---|---|
| One combined file upload? | ✅ | Single file input, no per-store split |
| Detects GP and BM from tabs? | ✅ | `detectStoreFromText(sheetName, stores)` at L140 |
| Detects GP and BM from row column? | ✅ | `detectStoreFromText(getValue(rawRow, columnAliases.store), stores)` at L146 |
| Fallback only when detection fails? | ✅ | `rowStore = rowDetected ?? sheetStore ?? fallbackStore` at L145-148 |
| MITTY hidden/invalid? | ✅ | Upload page filters stores to `["GP", "BM"]` at L20. Migration sets MITTY `is_active = false`. Parser only receives valid active stores. |
| Format/sample sheets skipped? | ✅ | `isFormatReferenceSheet()` at L71-74 skips tabs with "format" or "sample" |

### Risk: None

---

## 2. Month-Wise Payslip Batch Audit

**Result: ✅ Working**

### How it works

The upload form has a `<input type="month">` defaulting to the current India month. The selected value is converted to `YYYY-MM-01` format via `monthInputToDate()` and stored as `salary_month` in:

- `payslip_batches.salary_month`
- `payslip_rows.salary_month` (propagated from the parser)
- `generated_payslips.salary_month` (copied from the row during generation)
- `salary_receivables.salary_month` (copied from the row during sync)

Each upload creates a **new batch**. May and June are completely separate batches.

### Specific checks

| Check | Status | Detail |
|---|---|---|
| salary_month selected before upload? | ✅ | Required `<input type="month">` in form, validated in server action |
| May and June create separate batches? | ✅ | Each `uploadPayslipSalarySheet()` call inserts a new `payslip_batches` row |
| payslip_rows store salary_month? | ✅ | Parser sets `salary_month: salaryMonth` on every row (L203) |
| generated_payslips store salary_month? | ✅ | `generateOne()` copies `salary_month: row.salary_month` at L305 |
| Old months downloadable? | ✅ | Dashboard shows "Recent payslip batches" (up to 12), each links to its batch page |
| Dashboard shows month clearly? | ✅ | Each batch card shows `formatMonth(batch.salary_month)` |

### Risk: None

---

## 3. Old Month Preservation Audit

**Result: ✅ Working**

### How it works

PDF files are stored in Supabase Storage under batch-specific paths:
```
generated/{batchId}/{storeName}_{staffName}_Payslip_{Month_Year}.pdf
```

Source sheets are stored under month-scoped paths:
```
source-sheets/{YYYY-MM}/{timestamp}-{filename}
```

### Specific checks

| Check | Status | Detail |
|---|---|---|
| Generating June does not overwrite May? | ✅ | Different `batch_id` → different storage path. `upsert: true` only within the same batch path |
| Files stored under batch-specific paths? | ✅ | `generated/${row.batch_id}/${fileName}` at L281 |
| PDF download uses batchId/rowId safely? | ✅ | Route at `[batchId]/rows/[rowId]/download/route.ts` queries by both `batch_id` AND `payslip_row_id` |
| ZIP download is batch-specific? | ✅ | Route at `[batchId]/zip/route.ts` queries `generated_payslips` filtered by `batch_id` |
| Sent status is batch-specific? | ✅ | `generated_payslips.sent_status` is per-generated-payslip, tied to a specific batch+row |
| Previous rows kept when re-generating? | ✅ | Old `generated_payslips` for the same `payslip_row_id` are deleted then re-inserted, but only within the same row. Other rows/batches unaffected |

### Risk: None

---

## 4. Staff Phone Reuse Audit

**Result: ✅ Working**

### How it works

On salary sheet upload, the system:

1. **Loads all `employee_contacts`** for active stores (GP/BM).
2. **Matches by `store_id + normalized_staff_name`** (case-insensitive, trimmed).
3. **Auto-fills phone** from saved contact into `payslip_rows.employee_phone` and `whatsapp_phone` (L474-477).
4. **Auto-creates missing contacts** — new staff names that don't exist in `employee_contacts` are bulk-inserted (L480-497), even when the phone field is blank.
5. **Updates saved contact phone** if the uploaded sheet has a phone and the contact doesn't yet (L447-456).
6. **Warns on phone mismatch** if the uploaded phone differs from saved contact phone (L460-468).

Phone propagation (`propagateEmployeePhone`) updates ALL `payslip_rows` and `generated_payslips` for that store+staff combination across ALL batches.

### Specific checks

| Check | Status | Detail |
|---|---|---|
| Matched by store_id + normalized_staff_name? | ✅ | `contactKey = ${row.store_id}:${normalizedStaffName}` at L428 |
| Existing phone auto-fills next month? | ✅ | Lines 474-477 in `uploadPayslipSalarySheet()` |
| New staff auto-created even without phone? | ✅ | `contactsToCreate` map populated at L433-444, inserted at L480-497 |
| Owner/manager can add phone once? | ✅ | Both can access `/app/employees` and update contacts |
| Future uploads reuse saved phone? | ✅ | Upload action reads `employee_contacts` first and auto-fills |
| Managers limited to assigned stores? | ✅ | `canWriteEmployeeStore()` checks `getAccessibleStores()` filtered to GP/BM. RLS policies enforce at DB level |

### Risk: None

---

## 5. WhatsApp Sharing Audit

**Result: ✅ Working**

### How it works

Each generated payslip row shows multiple sharing options:

1. **Send WhatsApp Text** (primary) — Opens `wa.me` link with full professional salary details. Auto-marks as sent via `markPayslipWhatsAppTextSent()`.
2. **Share PDF** — Uses Web Share API for mobile native share sheet. Records share attempt.
3. **Download PDF** — Direct download link.
4. **Copy Message** — Copies full salary text to clipboard. Records share attempt.
5. **Open WhatsApp** — Simple `wa.me` link with short message.
6. **Mark Not Sent** — Undoes automatic sent marking.

### Specific checks

| Check | Status | Detail |
|---|---|---|
| Send WhatsApp Text uses full salary details? | ✅ | `professionalSalaryWhatsAppMessage()` includes all fields |
| Send WhatsApp Text auto-marks sent? | ✅ | `recordTextAttempt()` calls `markPayslipWhatsAppTextSent()` |
| Mark Not Sent can undo? | ✅ | `markPayslipNotSent()` resets to `not_sent`, clears sent_at/sent_by |
| Share PDF exists? | ✅ | Share2 button with Web Share API |
| Download PDF exists? | ✅ | Direct download link |
| Copy Message exists? | ✅ | `copyMessage()` copies `salaryMessage` to clipboard |
| Brand Mark shows Firm: Go Planet? | ✅ | Both GP and BM have `firm_name = 'Go Planet'` (migration L7-9). Message shows `Firm: ${firmName}`, `Store Name: ${storeName}` |
| Go Planet shows Firm: Go Planet? | ✅ | Same firm_name value for both stores |

### Files involved

| File | Role |
|---|---|
| [whatsapp.ts](file:///g:/retail.gpbm.in/lib/payslips/whatsapp.ts) | Message generation functions |
| [whatsapp-actions.tsx](file:///g:/retail.gpbm.in/components/payslips/whatsapp-actions.tsx) | Client component with all sharing buttons |
| [sent-status-actions.tsx](file:///g:/retail.gpbm.in/components/payslips/sent-status-actions.tsx) | Sent status display and update buttons |

### Risk: None

---

## 6. Receivables Month-Wise Audit

**Result: ✅ Working**

### How it works

1. **Auto-sync** — After each payslip generation (`generateOne` and `generateAllPayslips`), `autoSyncReceivablesForBatch()` is called for negative net_payable rows.
2. **Manual sync** — "Sync Negative Payslips" button on `/app/payslips/receivables` scans ALL `payslip_rows` with `net_payable < 0` for historical coverage.
3. **Month-wise separation** — `salary_receivables.salary_month` is copied from the payslip row. Dashboard defaults to the latest available month.
4. **Deduplication** — `unique(payslip_row_id)` constraint prevents duplicate receivables per row.

### Specific checks

| Check | Status | Detail |
|---|---|---|
| net_payable < 0 creates receivable? | ✅ | Auto-sync checks `.lt("net_payable", 0)`. DB constraint `net_payable < 0` |
| receivable uses salary_month? | ✅ | Copied from payslip row during sync |
| May and June separate? | ✅ | Different `payslip_row_id` per batch, different `salary_month` values |
| Defaults to latest month? | ✅ | `getAvailableReceivableMonths()` returns sorted DESC, page uses `[0]` |
| Month selector works? | ✅ | Filter links per month on receivables page |
| Manual sync handles old rows? | ✅ | `syncNegativePayslips()` queries ALL negative rows, not just a specific batch |
| Auto-sync handles new payslips? | ✅ | Called in `generateOne()` (for individual) and `generateAllPayslips()` (for batch) |
| Positive net_payable doesn't create receivable? | ✅ | Filter `.lt("net_payable", 0)` in both sync functions. DB constraint prevents it |

### Files involved

| File | Role |
|---|---|
| [receivables.ts](file:///g:/retail.gpbm.in/lib/payslips/receivables.ts) | Sync + status server actions |
| [receivables-queries.ts](file:///g:/retail.gpbm.in/lib/payslips/receivables-queries.ts) | Query functions |
| [receivables-actions.tsx](file:///g:/retail.gpbm.in/components/payslips/receivables-actions.tsx) | Client action buttons |
| [receivables/page.tsx](file:///g:/retail.gpbm.in/app/app/payslips/receivables/page.tsx) | Dashboard page |

### Risk: None

---

## 7. Salary Attendance Report vs Payslip Generation Audit

**Result: ⚠️ Partial — Wording risk**

### What's different

| Feature | Salary Attendance Report | Payslip Generation |
|---|---|---|
| **Path** | `/app/reports/salary-attendance` | `/app/payslips` |
| **Purpose** | Store managers upload monthly attendance file (file archive, no parsing) | Owner uploads combined salary Excel, parses data, generates PDFs |
| **Access** | Owner + managers | Owner only |
| **Store scope** | Per-store upload (one file per store) | Combined file for all stores (auto-detect) |
| **Due date** | Day 1 of the month | After salary attendance is collected (owner workflow) |
| **Data flow** | Stored as file only, no row parsing | Parsed into rows → PDF generation → WhatsApp sharing |

### Specific checks

| Check | Status | Detail |
|---|---|---|
| Salary Attendance is clearly different? | ⚠️ Partial | They are different data flows, but the labels can confuse the owner |
| Salary Attendance should not confuse owner? | ⚠️ Risk | Reports page labels it "Salary Attendance" — owner might go here to generate payslips |
| Payslip upload labelled as combined sheet? | ⚠️ Risk | Upload page says "Upload Salary Sheet" but doesn't mention "combined Go Planet + Brand Mark" |
| Reports page explains the difference? | ⚠️ Risk | Reports page description says "Owner-only salary sheet upload, review, PDF generation and ZIP download" for payslips. Salary Attendance says "Due day 1. Salary day 3." but doesn't emphasize the difference |

### Wording issues found

1. **Upload page heading** says "Upload Salary Sheet" — Should clarify it's a combined Go Planet + Brand Mark salary sheet for payslip generation.
2. **Upload page helper text** says "Values come from this salary sheet only. Sample PDFs are format references." — Doesn't help distinguish from salary attendance.
3. **Reports page "Salary Attendance"** title could confuse owner into thinking this is where salary sheets go.
4. **Salary Attendance page heading** says "Salary attendance upload" — This is correct but could benefit from a subtitle distinguishing from payslip generation.

> [!IMPORTANT]
> **Recommended small label fix** — Update the upload page heading and helper text to clearly mention it is for payslip generation from a combined Go Planet + Brand Mark salary sheet. See Section 10.

---

## 8. Security Audit

**Result: ✅ Working**

### Database-level (RLS)

| Table | RLS | Policy |
|---|---|---|
| `payslip_batches` | ✅ Enabled | `is_owner()` for all operations |
| `payslip_rows` | ✅ Enabled | `is_owner()` for all operations |
| `generated_payslips` | ✅ Enabled | `is_owner()` for all operations |
| `salary_receivables` | ✅ Enabled | `is_owner()` for all operations |
| `storage.objects` (payslips bucket) | ✅ Enabled | `bucket_id = 'payslips' AND is_owner()` |
| `employee_contacts` | ✅ Enabled | Owner: all. Manager: select/insert/update on assigned stores only |

### Application-level

| Page | Check | Status |
|---|---|---|
| `/app/payslips` | `profile?.role !== "owner"` → AccessDenied | ✅ |
| `/app/payslips/upload` | `profile?.role !== "owner"` → AccessDenied | ✅ |
| `/app/payslips/[batchId]` | `profile?.role !== "owner"` → AccessDenied | ✅ |
| `/app/payslips/[batchId]/rows/[rowId]` | `profile?.role !== "owner"` → AccessDenied | ✅ |
| `/app/payslips/[batchId]/rows/[rowId]/download` | `isOwner()` check → 403 | ✅ |
| `/app/payslips/[batchId]/zip` | `isOwner()` check → 403 | ✅ |
| `/app/payslips/receivables` | `profile?.role !== "owner"` → AccessDenied | ✅ |
| `/app/employees` | Owner + manager allowed. Manager limited to assigned stores | ✅ |
| Today page receivables card | `profile?.role === "owner"` guard | ✅ |
| Today page payslips card | `profile?.role === "owner"` guard | ✅ |
| Reports page payslip link | `profile?.role === "owner"` guard | ✅ |

### Server action security

| Action | Owner check | Detail |
|---|---|---|
| `uploadPayslipSalarySheet` | `requireOwner()` | ✅ |
| `generatePayslipForRow` | `requireOwner()` via `generateOne()` | ✅ |
| `generateAllPayslips` | `requireOwner()` | ✅ |
| `markPayslipSent/NotSent/Failed/Skipped` | `getGeneratedPayslipForOwner()` | ✅ |
| `syncNegativePayslips` | `requireOwner()` | ✅ |
| `markReceivableReceived/Partial/Waived/Disputed/Pending` | `requireOwner()` | ✅ |
| `autoSyncReceivablesForBatch` | Called from owner-only generation flow | ✅ |
| `syncStaffFromPayslips` | `requireOwner()` | ✅ |
| `createEmployeeContact` | `requireContactUserOrRedirect()` + `canWriteEmployeeStore()` | ✅ |
| `updateEmployeeContact` | Same + checks both old and new store | ✅ |
| `bulkUpdateEmployeePhones` | Same + per-contact store check | ✅ |

### Specific checks

| Check | Status |
|---|---|
| Managers cannot see payslip rows? | ✅ RLS + page-level check |
| Managers cannot see generated PDFs? | ✅ Storage RLS + route check |
| Managers cannot see salary amounts? | ✅ No access to any salary data |
| Managers cannot see receivables? | ✅ RLS + page-level check |
| Managers can only maintain contacts for assigned stores? | ✅ Server action + RLS |
| Owner can assign manager to multiple stores? | ✅ `store_users` table allows it |
| Multiple managers per store? | ✅ No unique constraint on store_users(store_id) |

### Risk: None

---

## 9. UI/UX Risk Audit for Salary Module

> [!NOTE]
> This is NOT a redesign. These are observations for future reference.

### /app/payslips

| Item | Type | Detail |
|---|---|---|
| Page title "Payslips" | OK | Clear |
| "Upload Salary Sheet" button | OK | Clear primary CTA |
| Receivables card | OK | Shows pending count and total |
| Batch list | OK | Shows month, row counts, generated count |

### /app/payslips/upload

| Item | Type | Detail |
|---|---|---|
| "Upload Salary Sheet" heading | ⚠️ Risky wording | Doesn't mention "combined Go Planet + Brand Mark" or "for payslip generation" |
| Helper text | ⚠️ Confusing | "Values come from this salary sheet only. Sample PDFs are format references." — Not helpful for first-time use |
| "Store selection" label | ⚠️ Confusing label | Label should say "Fallback store (if auto-detect fails)" instead of "Store selection" |
| "Auto detect" default | OK | Good default |
| File input | OK | Clear |

### /app/payslips/[batchId]

| Item | Type | Detail |
|---|---|---|
| Header | OK | Shows month clearly |
| Summary cards | OK | 9 cards cover key stats |
| Receivable warning banner | OK | Yellow warning with link |
| Per-row "Receivable" badge | OK | Subtle yellow badge |
| Row card layout | OK | 5-column grid on desktop |
| Too many buttons per row? | ⚠️ Risk | Preview, Generate, Phone, WhatsApp Text, Share PDF, Download PDF, Copy Message, Open WhatsApp, Open WhatsApp Web, Mark as Sent (x2) — up to 10 actions per row. Can overwhelm on mobile |
| Sent status section | OK | Clear with method and timestamp |

### /app/payslips/receivables

| Item | Type | Detail |
|---|---|---|
| Month selector | OK | Shows available months |
| Store filter | OK | All Stores / GP / BM |
| Status filter | OK | 6 options |
| Search | OK | Staff name search |
| Summary cards | OK | Good overview |
| Staff cards | OK | Shows amounts clearly |
| Action buttons | OK | Clear status actions |

### /app/employees

| Item | Type | Detail |
|---|---|---|
| "Staff Phone Directory" heading | OK | Clear |
| Helper text differs by role | OK | Good manager vs owner messaging |
| "Sync Staff from Payslips" button | OK | Owner-only |
| Filter row | OK | Search, store, status, missing phones |
| Bulk edit mode | OK | Useful for rapid phone entry |
| "Manual Add Employee" | ⚠️ Minor | Could say "Add Staff Contact" for consistency |

### /app/reports/salary-attendance

| Item | Type | Detail |
|---|---|---|
| "Salary attendance upload" heading | ⚠️ Risk | Owner might confuse with payslip salary sheet upload |
| Missing helper text | ⚠️ Risk | No text explaining "This is for attendance files only, not salary sheets for payslip generation" |
| Per-store upload | OK | Correct behavior for attendance |

### /app/reports

| Item | Type | Detail |
|---|---|---|
| "Salary Attendance" card | ⚠️ Risk | Could confuse owner. Description says "Due day 1. Salary day 3." but doesn't mention "attendance files" |
| "Payslip Generation" card (owner-only) | OK | Description says "Owner-only salary sheet upload, review, PDF generation" |

---

## 10. Recommended Fixes

### Must fix before push

**No bugs found.** All data flows, security, and logic are working correctly.

### Should fix before push (small safe label changes)

1. **Upload page heading** — Change "Upload Salary Sheet" to "Upload Combined Salary Sheet" and improve the helper text to mention "Go Planet + Brand Mark payslip generation".

2. **Upload form "Store selection" label** — Change to "Fallback store (if auto-detect fails)" to avoid confusion.

3. **Salary attendance page** — Add a one-line note clarifying this is for attendance files, not salary generation.

### Can wait (before UI redesign)

4. Too many action buttons per payslip row — Consider collapsing secondary actions into a dropdown on mobile.
5. "Manual Add Employee" → "Add Staff Contact" for terminology consistency.
6. Salary Attendance card on Reports page could have a more distinguishing description.

### Later

7. Add payment history log to receivables (individual entries instead of just total).
8. Add Excel/PDF export for receivables.
9. Add notification when new receivables are created.
10. Consider grouping payslip rows by store on the batch page for easier scanning.

---

## Summary

| Audit Area | Status | Issues |
|---|---|---|
| Combined salary sheet upload | ✅ Working | None |
| Month-wise payslip batches | ✅ Working | None |
| Old month preservation | ✅ Working | None |
| Staff phone reuse | ✅ Working | None |
| WhatsApp sharing | ✅ Working | None |
| Receivables month-wise | ✅ Working | None |
| Salary Attendance vs Payslip confusion | ⚠️ Partial | Wording risk — 3 small label fixes recommended |
| Security | ✅ Working | None |
| UI/UX risks | ⚠️ Notes | Mobile button count, terminology, attendance confusion |
| Must-fix bugs | ✅ None | No data or logic bugs found |

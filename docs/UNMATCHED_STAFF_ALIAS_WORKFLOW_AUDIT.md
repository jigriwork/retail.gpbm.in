# Unmatched Staff Alias Workflow Audit

Date: 2026-06-14

Version: v7.2.0

Scope: audit-only review of unmatched staff, staff alias mapping, and owner/manager shortcuts. No code, schema, parser, RLS/security, reports, rows, aliases, or uploaded data were changed.

## 1. Executive Summary

Current unmatched staff workflow readiness rating: 7/10.

Staff alias mapping exists and is functional. Owner can fix aliases across all accessible stores. Managers can also fix aliases for assigned active stores. The mapping is store-wise, persisted in `staff_name_aliases`, and applied dynamically in Sales Analytics, Staff Sales, Business Reporting, Today top staff, Store Detail, and AI Secretary outputs because those views use analytics functions that read active aliases at query time.

The workflow is better than it first looks: manager access is already allowed by app checks and RLS. The biggest gap is visibility and guidance. Upload success shows unmatched staff and links to alias mapping, but Today does not provide a direct `Fix Staff Names` action, Staff Sales does not warn about unmatched names, and alias changes do not write audit logs.

Recommended next fix: add a clear `Fix Staff Names` shortcut wherever unmatched staff is shown, especially Today Daily Sales Upload Status and Staff Sales, and add audit logging for alias create/update/inactivate actions.

## 2. What Is Unmatched Staff?

Simple explanation:

Unmatched staff means the staff name found in an uploaded sales file is not yet mapped to a known staff name/contact for that store.

Technical explanation:

- The sales parser reads the staff column into `sales_rows.staff_name`.
- Supported staff header aliases include names like `AGENT NAME`, `STAFF`, `STAFF NAME`, `SALESMAN`, `SALES PERSON`, `SOLD BY`, and `USER NAME`.
- During upload, unique parsed staff names are normalized with `staffNameKey`.
- The app checks `staff_name_aliases` for the same store, source type `sales_report`, active alias, and normalized source name.
- Any parsed staff name without an active alias becomes unmatched.

How aliases work:

- Source staff name: the exact or normalized name from uploaded sales rows, such as `RITA S`.
- Canonical staff name: the real staff/contact name owner or manager wants reports to use, such as `Rita`.
- Example: `RITA S` from uploaded file mapped to `Rita`.
- The alias is store-wise, not global.
- Alias rows are stored in `staff_name_aliases`.
- They can optionally link to `employee_contacts` through `employee_contact_id`.

Impact:

- Total sales: not affected. Total sales still sum `sales_rows.net_sale`.
- Brand/category sales: not affected for totals, because brand/category reports do not need staff alias mapping.
- Staff-wise sales: affected. Without aliases, the same person can appear split under `RITA`, `RITA S`, `RITA1`, etc.
- Missing staff names: aliases cannot fix rows where `staff_name` is null; the source file must contain a staff column.
- Incentives if added later: affected. Unmatched or wrongly mapped names could split incentives, underpay, overpay, or credit the wrong person.

## 3. Upload Flow Audit

Daily upload flow:

- `lib/reports/sales-actions.ts` parses the file with `parseSalesFileDetailed`.
- Parsed staff names come from `ParsedSalesRow.staffName`.
- `uniqueStaffNames(reportRows)` collects unique staff names.
- `getUnmatchedSalesStaffNames(storeId, staffNames)` checks `staff_name_aliases`.
- `unmatchedStaffCount` and `unmatchedStaffNames` are saved in `reports.summary`.
- The same metadata is returned in the upload success state.

Upload success screen:

- `components/reports/sales-upload-form.tsx` shows unmatched staff count.
- If unmatched names exist, it shows the names.
- It also shows an `Open alias mapping` link to `/app/reports/staff-aliases`.
- Managers see this link after upload because the sales upload form is shared by owner and managers.

Important behavior:

- Unmatched staff does not block upload.
- Unmatched staff is a data quality warning.
- Alias creation after upload updates analytics dynamically; it does not rewrite old `sales_rows`.

## 4. Staff Alias Page Audit

Route exists: `/app/reports/staff-aliases`.

Access:

- The page calls `requireProfile`, not `requireOwner`.
- Owner and managers can access it when authenticated and active.
- Store options come from `getAccessibleStores(profile)`.
- Managers see only assigned stores through app queries and RLS.

Manager capabilities:

- Manager can create aliases for assigned active stores.
- Manager can edit existing aliases for assigned active stores.
- Manager can inactivate/reactivate aliases through the `Active` checkbox.
- There is no separate hard delete action in the UI.
- Manager can also create an employee contact from the alias form by choosing `Create staff contact`.

Owner capabilities:

- Owner can manage all stores and all aliases.

Alias fields:

- `store_id`
- `employee_contact_id`
- `canonical_staff_name`
- `normalized_canonical_staff_name`
- `source_name`
- `normalized_source_name`
- `source_type`
- `is_active`
- `created_by`
- `created_at`
- `updated_at`

Canonical staff selection:

- User can select an existing employee contact from the selected store.
- User can choose `Use source name`.
- User can choose `Create staff contact`.
- There is no free separate canonical text field; canonical name is derived from the selected contact or source name.

Old reports:

- Alias mapping does not update old `sales_rows`.
- Staff Sales and analytics apply aliases dynamically when reading rows.
- This means old reports are corrected immediately in views after alias creation, as long as the old rows have `staff_name` values.

Where aliases are applied:

- Staff Sales: yes, `getStaffSalesSummary`.
- Sales Analytics top staff/staff count: yes, `getSalesSummary`.
- Business Reporting staff section: yes, `getBusinessReport`.
- Today top staff: yes, because Today calls `getStaffSalesSummary`.
- Store Detail staff leader/week sales: yes, through analytics functions.
- AI Secretary top staff and latest sales context: yes for staff analytics portions.

## 5. Owner Visibility Audit

Daily sales upload success summary:

- Shows unmatched staff count: yes.
- Shows unmatched staff names: yes.
- Links to Staff Alias Mapping: yes.
- Explains what to do: partially, link text says `Open alias mapping`.
- Visible enough: yes immediately after upload, but only to the uploader in that moment.

Today Daily Sales Upload Status card:

- Shows unmatched staff count: yes.
- Shows unmatched staff names: yes, up to first three.
- Links to Staff Alias Mapping: no.
- Explains what to do: partially, status can say `Needs Staff Alias Review`.
- Visible enough: medium. The warning is present but action is missing.

Reports page:

- Has a shortcut card for `Staff Name Aliases`.
- Does not show unmatched staff count/names in the sales status cards.
- Good general navigation, not a contextual warning.

Sales Upload page:

- Recent reports do not show unmatched staff count/names.
- Upload success summary does show them.
- Link exists only after upload success with unmatched names.

Staff Sales page:

- Does not show unmatched staff count/names.
- It says staff sales are combined through active aliases.
- No direct `Fix Staff Names` warning or shortcut.

Business Reporting page:

- Applies aliases in staff sections.
- Does not show unmatched staff count/names.
- No direct alias mapping shortcut.

Correction Center:

- Shows unmatched staff count from report summary.
- Does not show unmatched names.
- Does not link to Staff Alias Mapping.

AI Secretary context:

- Includes sales status, latest uploads, month sales, and top staff yesterday.
- Does not include unmatched staff count/names or alias action guidance.

Store Detail:

- Sales status and recent sales reports do not show unmatched staff count/names.
- No alias mapping shortcut in the sales section.

## 6. Manager Visibility Audit

Manager flow:

- Manager uploads a daily sales file.
- If unmatched staff exists, upload success summary shows count, names, and `Open alias mapping`.
- Manager can click `/app/reports/staff-aliases`.
- Manager can save aliases for assigned active stores.
- Manager is not blocked by the page if they are authenticated and active.
- RLS also restricts manager alias select/insert/update to assigned active stores.

Potential confusion:

- If manager misses the upload success summary, there is no strong follow-up warning on Today or Staff Sales.
- The Reports page has a Staff Name Aliases shortcut, but it is not tied to the specific unmatched warning.
- Manager can update existing aliases for assigned stores, including aliases originally created by owner. This is useful but needs audit logs.

Security risk if managers can create aliases:

- Low to medium when restricted to assigned stores.
- Business risk is incorrect mapping, not data leakage.
- A bad alias can wrongly merge two staff members and distort staff ranking, targets, and future incentives.
- There is currently no owner approval workflow and no audit log for alias changes.

## 7. Shortcut / Navigation Audit

Existing shortcuts:

- Today Owner Command Center: has Upload Daily Sales and Staff Sales, but no Staff Alias Mapping or Fix Staff Names.
- Today Daily Sales Upload Status card: shows unmatched staff count/names and `Needs Staff Alias Review`, but no `Fix Staff Names` button.
- Reports page: has Staff Name Aliases shortcut.
- Sales Upload page: upload success warning links to alias mapping.
- Staff Sales page: no alias shortcut.
- Settings: no alias shortcut found.
- Bottom nav/sidebar: bottom nav has Today, Stores, Reports, Tasks, and owner-only Secretary. No direct Staff Alias Mapping.
- Correction Center shortcut: yes, owner sees Data Correction Center in Reports; Today owner command center also has Fix Wrong Upload.

Recommended shortcut placement:

- Add `Fix Staff Names` near Upload Daily Sales and Staff Sales in Today.
- Add `Fix Staff Names` button inside the Today Daily Sales Upload Status card when unmatched staff count is greater than 0.
- Add Staff Alias Mapping shortcut on Staff Sales page.
- Add a small action link in Correction Center when unmatched staff count is greater than 0.
- Keep the Reports page Staff Name Aliases card.

## 8. Data and Security Audit

RLS:

- `staff_name_aliases_owner_all`: owner full access.
- `staff_name_aliases_manager_select_assigned`: manager select assigned active stores only.
- `staff_name_aliases_manager_insert_assigned`: manager insert assigned active stores only, with `created_by = auth.uid()`.
- `staff_name_aliases_manager_update_assigned`: manager update assigned active stores only.

Employee contacts:

- Managers can also select, insert, and update employee contacts for assigned active stores.
- This supports `Create staff contact` from the alias form.

Store boundaries:

- App code checks `canAccessStore` before saving manager aliases.
- App code validates selected contact belongs to selected store.
- RLS also enforces assigned active store restrictions.
- Manager should not be able to map staff from another store through this UI/RLS path.

Audit logs:

- `audit_logs` exists for correction workflows.
- Staff alias changes do not currently write audit logs.

Reversibility:

- Aliases are reversible in practice by changing mapping or unchecking Active.
- There is no history view for previous alias values.
- There is no separate delete action in the UI.

Main security/business concern:

- A manager can change an alias for assigned store and thereby alter staff reporting for old and future analytics views. This should be logged and ideally surfaced to owner.

## 9. Current Issue Risk

If unmatched staff is not fixed:

- Total sales remain correct if `net_sale` parsed correctly.
- Brand/category sales remain correct.
- Staff sales can be split across multiple spellings.
- Top staff can be wrong.
- Store staff leader on Today or Store Detail can be wrong.
- Staff target tracking can be wrong if added or expanded later.
- Future incentives can be wrong.
- Business Reporting staff filter/section can be misleading.
- Owner may blame, reward, or coach the wrong staff member.

If the source file has no staff column:

- Alias mapping cannot help.
- The correct fix is uploading a sales file that includes staff/agent names.

## 10. Recommended Fix Plan

Recommended next build:

1. Add `Fix Staff Names` action links.
2. Add clearer unmatched staff warning copy.
3. Add audit logs for alias changes.

Specific UI changes:

- Today Daily Sales Upload Status card: show unmatched staff count and names more prominently when count > 0.
- Today Daily Sales Upload Status card: add button `Fix Staff Names` linking to `/app/reports/staff-aliases?storeId={storeId}`.
- Sales Upload success summary: keep existing alias link, but change copy to `Map uploaded staff names to real staff names so staff sales becomes accurate.`
- Staff Sales page: if unmatched names exist for the selected stores/period, show warning and link to Staff Alias Mapping.
- Reports page: keep Staff Name Aliases card near Staff Sales.
- Store Detail sales section: add `Fix Staff Names` link if latest/recent report has unmatched staff.
- Correction Center: when unmatched staff count > 0, link to alias mapping for the report store.

Security/data changes:

- Add `audit_logs` writes for alias create/update/inactivate.
- Include old value, new value, store id, source name, canonical staff name, actor id, and actor role.
- Consider owner-visible recent alias changes list.

Copy recommendation:

`Map uploaded staff names to real staff names so staff sales becomes accurate.`

## 11. Should Manager Be Allowed?

Recommendation: yes, managers should be allowed to create and update staff aliases for assigned stores, but with stronger guardrails.

Recommended restrictions:

- Assigned active store only.
- Manager can map only to staff contacts from the same store.
- Manager can create a contact only in assigned stores.
- Manager changes must write audit logs.
- Owner should see recent manager alias changes.
- Consider preventing manager from inactivating aliases created by owner unless there is an audit trail or owner review.
- Long-term, prefer mapping source names to existing employee contacts rather than free-form names.

Why yes:

- Managers know local staff name spellings and report quirks.
- Owner should not have to fix every daily upload.
- Fast alias repair makes staff sales useful immediately.

Main risk:

- Wrong mapping can merge two staff members. Audit logs and owner review reduce this risk.

## 12. Implementation Options

Option A: Owner-only staff alias mapping.

- Pros: strongest control; lowest risk of manager mis-mapping.
- Cons: owner becomes bottleneck; daily staff sales stays wrong until owner fixes names.
- Business risk: slow corrections and repeated owner workload.
- Recommendation: not ideal for this workflow.

Option B: Manager can suggest aliases, owner approves.

- Pros: strong control with manager input; good for incentives/payroll-sensitive environments.
- Cons: requires new suggestion/approval schema and UI; slower than direct mapping.
- Business risk: unresolved suggestions can pile up.
- Recommendation: good later if incentives become high stakes.

Option C: Manager can directly create aliases for assigned store with audit log.

- Pros: fastest operational workflow; matches current app direction; keeps owner out of small spelling fixes.
- Cons: incorrect mappings can affect staff reports immediately.
- Business risk: wrong staff credit if no review.
- Recommendation: best next option, because managers already can create/update aliases. Add audit logs and owner visibility rather than removing access.

## 13. Verification

Requested commands:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `git status`
- `git log --oneline -20`

These were run after creating this audit doc.

## 14. Git

Commit message:

`add unmatched staff alias workflow audit`

Push status: do not push.

## Final Snapshot

- Unmatched staff meaning: uploaded staff names without an active store-wise sales-report alias.
- Owner shortcut status: Reports page has Staff Name Aliases; Today warning lacks a direct Fix Staff Names button.
- Manager shortcut status: upload success can link to alias mapping; Reports page has Staff Name Aliases; Today lacks direct Fix Staff Names.
- Owner can fix status: yes.
- Manager can fix status: yes, assigned active stores only.
- Where unmatched currently appears: upload success summary, Today Daily Sales Upload Status, Correction Center count, Staff Alias page unmatched list.
- Whether aliases affect old reports: yes in analytics views, dynamically, without rewriting rows.
- Security/RLS status: store-scoped manager select/insert/update exists; no alias audit logs.
- Recommended fix: add contextual Fix Staff Names shortcuts and audit logs for alias changes.
- Should manager be allowed: yes, with assigned-store restriction, same-store contact validation, audit log, and owner visibility.

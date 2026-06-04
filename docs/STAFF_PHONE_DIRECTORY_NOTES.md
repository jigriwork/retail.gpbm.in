# Staff Phone Directory Notes

## Access Model

- Owners can see and maintain contacts for all active Go Planet and Brand Mark stores.
- Managers can see and maintain contacts only for their assigned active stores.
- No super manager role is needed. Use the existing `manager` role plus `store_users` assignments.
- One manager can be assigned to Go Planet, Brand Mark, or both.
- One store can have multiple managers.

## Staff Creation And Sync

- Owners can use `Sync staff from payslips` to create directory contacts from existing `payslip_rows`.
- Staff names are matched by `store_id` plus normalized staff name.
- Future salary uploads create staff contacts even when phone is blank.
- MITTY remains inactive and is not assigned through the active store UI.

## One-Time Phone Entry

- Phone entry is intended to be a one-time setup.
- Once a phone is saved in `employee_contacts`, future salary uploads auto-fill the payslip row phone by store and normalized staff name.
- Owners and assigned managers can update phone numbers when they change.
- Existing matching payslip rows and generated payslip phone snapshots are updated server-side after a phone is saved.

## Manager Contact Maintenance

- Managers can add, edit, activate, and deactivate contacts for assigned stores only.
- Managers do not hard-delete contact records.
- Deactivate by setting `is_active=false`.
- A manager assigned to no store sees no contacts and should contact the owner.

## Payslip Security

- Payslip pages, salary rows, generated PDFs, ZIP files, and salary amounts remain owner-only.
- Managers can maintain phone numbers but cannot open `/app/payslips` or download generated payslip files.
- Phone propagation updates only phone fields server-side; salary data is not shown to managers.

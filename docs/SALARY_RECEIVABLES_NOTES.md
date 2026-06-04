# Salary Receivables — Notes

## What is a salary receivable?

When a payslip row has a **negative net_payable**, it means the staff member owes us money instead of receiving salary. The absolute value of that negative amount is the **receivable amount**.

Example:
- `net_payable = -2500` → `receivable_amount = 2500`
- `net_payable = 500` → no receivable (positive means we pay them)

## Month-wise flow

Receivables are strictly month-wise. Each receivable belongs to one salary month.

### Example

1. Owner uploads **May 2026** salary sheet and generates payslips.
2. If any staff has negative net_payable in May, a receivable is created for **May 2026**.
3. Later, owner uploads **June 2026** salary sheet.
4. Negative June amounts create **June 2026** receivables separately.
5. May and June receivables **never mix**.
6. The dashboard defaults to the latest available month and supports switching.

## Sync from payslip rows

### Auto-sync

After payslip generation (single or batch), if any row has `net_payable < 0`, receivables are automatically created/updated for that batch. No manual action needed for new payslips.

### Manual sync

A **"Sync Negative Payslips"** button on `/app/payslips/receivables` scans all payslip_rows with `net_payable < 0` and creates/updates salary_receivables. This is useful for:
- Historical payslips generated before the receivables feature existed
- Re-syncing after manual payslip row edits

### Sync rules

- Uses `unique(payslip_row_id)` to prevent duplicates.
- If `net_payable` changes after re-generation, `receivable_amount` is updated but `received_amount` is preserved.
- If status is already `waived` or `disputed`, the status is not overwritten automatically.
- If `received_amount = 0` → status `pending`
- If `received_amount > 0` and balance > 0 → status `partial`
- If balance = 0 → status `received`

## Total receivable calculation

For a selected salary month:
- **Total Receivable** = sum of `receivable_amount` for all rows in that month
- **Pending Receivable** = sum of `balance_amount` for rows with status `pending` or `partial`
- **Received Amount** = sum of `received_amount`
- **Balance Amount** = sum of `balance_amount`
- **Store-wise** = grouped by store

## Status meanings

| Status | Meaning |
|---|---|
| **pending** | Staff has not paid anything yet. Full amount is outstanding. |
| **partial** | Staff has paid some amount. Remaining balance exists. |
| **received** | Full amount has been received. Balance is zero. |
| **waived** | Owner has waived the amount. Balance is set to zero. Reason stored in note. |
| **disputed** | Amount is disputed. Balance remains unchanged until resolved. |

## Status action flows

### Mark Received
- Sets `received_amount = receivable_amount`, `balance_amount = 0`
- Records `received_at` and `received_by`

### Add Partial Payment
- Increases `received_amount` by the payment amount
- Recalculates `balance_amount = receivable_amount - received_amount`
- If balance becomes 0, status changes to `received`; otherwise `partial`
- Records payment timestamp and who received it

### Mark Waived
- Sets `status = waived`, `balance_amount = 0`
- Optional note stores the reason
- Sync will not overwrite waived status

### Mark Disputed
- Sets `status = disputed`
- Balance remains unchanged
- Optional note stores the reason
- Sync will not overwrite disputed status

### Reset to Pending
- Sets `status = pending`, `received_amount = 0`
- Recalculates `balance_amount = receivable_amount`
- Clears `received_at` and `received_by`

## Payslip amount changes

If a receivable exists but the payslip `net_payable` later becomes non-negative (e.g., after re-generation):
- The receivable is **not deleted automatically**
- A warning is shown: "Payslip amount is no longer negative. Please review."
- The owner must manually resolve (waive, delete, or keep)

## Owner-only restriction

- Only users with `role = 'owner'` can access receivables
- Managers see `AccessDenied` on `/app/payslips/receivables`
- Managers cannot see receivable totals on the Today page
- Managers cannot see salary amounts anywhere
- RLS enforces owner-only access at the database level

## Known limitations

1. **No automatic deletion**: If net_payable becomes positive, the receivable persists with a warning. Owner must resolve manually.
2. **No payment history**: Only the latest `received_amount` total is tracked, not individual payment entries. A dedicated payments log could be added later.
3. **No notifications**: Owner is not notified when a new receivable is created. They must check the dashboard.
4. **No export**: Receivables cannot be exported to Excel/PDF yet.
5. **No staff linking**: Receivables use `staff_name` text matching, not a staff/employee ID foreign key. Same staff across different months is tracked by `unique(payslip_row_id)` per row.

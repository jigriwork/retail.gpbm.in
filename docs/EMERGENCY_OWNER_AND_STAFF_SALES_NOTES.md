# Emergency Owner and Staff Sales Notes

## Staff sales report

- Route: `/app/reports/staff`
- Shows staff-wise sales for Today, Yesterday, This week, and This month.
- Owners can view all active stores or a selected active store.
- Managers can view only their assigned active stores.
- Rows are sorted by Total Sales descending so lower performers naturally appear at the bottom.

## What it shows

The report uses existing `sales_rows` data and shows:

- Staff Name
- Total Sales
- Quantity
- Distinct Bills
- Average Bill Value
- Return Amount, calculated from negative `net_sale` rows when present
- Top Brand
- Top Category
- Original source-name breakdown when multiple uploaded staff names map to one staff member

No salary, payslip, receivable, or incentive data is included.

## Alias mapping

Active `staff_name_aliases` rows with `source_type = sales_report` are applied before grouping.
For example, if `RITA` and `RITA S` are both mapped to `Rita`, the staff sales report combines both source names under `Rita` and keeps the source-name breakdown visible.

## Owner creation

- Route: `/app/users`
- Owners can create Manager or Owner users.
- The default create-user role remains Manager.
- Selecting Owner shows the warning: "Owners can access salary, payslips, receivables, users and settings."
- Owner users do not require store assignment because owners access all active stores by role.
- Manager creation and multiple store assignment remain unchanged.

## Security notes

- User creation still uses the server-side Supabase admin/service-role client.
- The service role key is read only on the server and is not exposed to client components.
- The create-user server action validates that the current user is an active owner.
- Managers cannot access `/app/users` and cannot create or promote users through the server action.
- Store assignment is still restricted to owner-only server actions.
- `.env.local` must remain ignored and untracked.

## Known limitations

- Return Amount is inferred from negative `net_sale` values because `sales_rows` does not have a dedicated return column.
- Staff without a populated `staff_name` in uploaded sales rows cannot appear in the staff sales report.
- The report depends on uploaded sales rows and active alias mappings already present in the database.

# Sales Analytics Notes

Date: 2026-06-01

## What Analytics Are Built

Sales analytics now uses uploaded `sales_rows` to show practical business visibility:

- total net sale
- total quantity
- bill count
- average bill value
- staff count
- brand count
- category count
- store-wise sales
- staff-wise ranking
- brand-wise ranking
- category-wise ranking
- item-wise ranking
- daily sales trend
- missing sales report dates

Routes added:

- `/app/reports/sales/analytics`
- `/app/reports/staff`

Pages updated:

- `/app/reports`
- `/app/today`
- `/app/stores/[storeId]`

## Date Periods

Supported periods:

- Today
- Yesterday
- This week
- This month
- Custom range on the sales analytics page

Dates are calculated using India business dates. This week starts on Monday and ends today. This month starts on the first day of the current month and ends today.

## Staff Sales Limitations

Staff-wise sales depends on uploaded sales files containing `staff_name`.

If no staff names exist in the selected period, the staff page shows:

`Staff names were not found in uploaded reports.`

Average bill value uses unique bill numbers where available. If bill numbers are missing, average bill value is shown as zero instead of guessing.

## Missing Report Logic

Missing sales reports are checked from the `reports` table where:

- `report_type = sales`
- selected store
- selected date range

Future dates are never shown as missing.

If today is included and no report exists, the UI uses careful wording:

`Today not uploaded yet`

Yesterday and older dates are shown as missing.

## Optional Target Behavior

If a store has monthly targets enabled and a monthly target value exists, the store analytics shows:

- month sale
- target
- percentage achieved
- balance
- days left in month
- required daily sale

If targets are disabled, target pressure is hidden.

## Access And Store Rules

Owner can view all active stores.

Managers can view assigned active stores only.

MITTY remains hidden because inactive stores are not returned by accessible store queries.

## Known Limitations

- Analytics depends on uploaded sales rows; missing or malformed source columns reduce visibility.
- Average bill value requires bill numbers.
- Staff ranking requires staff names.
- No exported PDF/Excel analytics report yet.
- No comparison against previous month yet.

## Next Recommended Step

Build stock analytics for slow stock, dead stock, fast moving items and stock availability. After that, add richer staff-wise sales coaching views.

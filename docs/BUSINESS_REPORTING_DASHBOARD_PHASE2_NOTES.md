# Business Reporting Dashboard Phase 2 Notes

Date: 2026-06-11

Scope: Business Reporting Dashboard Phase 2 for share/download actions, restock suggestions, low-stock-by-size, slow/no-sale signals, missing data warnings, and performance safety. No payslip/salary modules, sales parser, stock parser, uploaded data, RLS/security, incentive logic, correction behavior, or existing reports/data were changed.

## Route

Route: `/app/reports/business`

The Phase 1 route remains the main business reporting route. Phase 2 adds decision and sharing sections to the same page.

## Readability Improvements

The main item/product table is now business-readable:

- Brand
- Item/Product Name
- Category
- Size
- Stock Qty
- Sold Qty
- Net Sales
- Return Qty
- Current MRP Value
- Staff who sold
- Restock Signal
- Match Confidence

Barcode and SKU are shown as secondary detail under the item/product name, not as the main label.

## Restock Suggestions Logic

Threshold constants live in `lib/analytics/business.ts` as `businessSignalThresholds`.

Signals:

- `Restock Urgent`: sold quantity >= 5 and current stock quantity <= 2.
- `Restock Soon`: sold quantity >= 3 and current stock quantity <= 5.
- `Watch`: sold quantity > 0 and current stock quantity > 5.
- `Do Not Reorder / Push Offer`: sold quantity <= 1 and current stock quantity >= 10.
- `No Sale Stock`: sold quantity = 0 and current stock quantity > 0.

The Restock Suggestions section uses current selected filters and is size-specific when explicit size data exists.

## Slow / No-sale Logic

Section: `Overstock / Slow Movement`

Rows appear when:

- Current stock quantity >= 10 and sold quantity <= 1 in selected period.
- Stock exists but no sale in selected period.

Suggested actions:

- `Check display`
- `Put in offer`
- `Avoid reorder`
- `Push staff`

The page uses the wording `Slow / No-sale signal`. It does not call this final dead stock because purchase date and ageing are not used.

## Low Stock by Size Logic

Section: `Low Stock by Size`

Rules:

- Stock quantity = 0: `Out of Stock`.
- Stock quantity <= 2: `Very Low`.
- Stock quantity <= 5 and sold quantity >= 3: `Low and Moving`.

Only explicit `size` columns from `stock_rows` and `sales_rows` are used. Unsafe item-name size inference is not used.

## Share, Copy, Print, Download

Actions added at top of `/app/reports/business`:

- `Copy Summary`: copies the current filtered report summary to clipboard.
- `Share on WhatsApp`: opens `https://wa.me/?text=...` with the encoded summary, without requiring a phone number.
- `Print`: calls browser print.
- `Download CSV`: downloads one Excel-friendly CSV containing sections for brand, category, item/product, size, restock suggestions, and slow/no-sale signals.

Summary includes:

- Store
- Period
- Brand/category filters
- Net sales
- Sold quantity
- Current stock
- Return amount
- Top staff
- Top product
- Restock urgent count
- Slow/no-sale count

## Missing Data Warnings

Warnings shown:

- No latest stock uploaded for selected store.
- Sales report missing for selected store/date combinations.
- Size data missing in uploaded sales rows.
- Weak or missing item match confidence.
- Stock is latest monthly upload, not live inventory ledger.

## Performance Safeguards

Kept from Phase 1:

- Default period is this month.
- Store/date filters are applied server-side.
- Brand/category/size filters are applied server-side where possible.
- Tables remain capped.
- Latest stock month only.
- No full dead/slow historical stock calculation on initial load.

Added in Phase 2:

- Restock/slow/low-stock signals reuse the same filtered sales and stock rows loaded for the dashboard.
- Signal tables are capped to 50 rows.
- CSV uses the already-rendered report data.

## Indexes Added

Migration:

`supabase/migrations/20260611203000_add_business_reporting_indexes.sql`

Indexes:

- `sales_rows(store_id, sale_date, brand)`
- `sales_rows(store_id, sale_date, category)`
- `sales_rows(store_id, sale_date, barcode)`
- `sales_rows(store_id, sale_date, sku)`
- `sales_rows(store_id, sale_date, staff_name)`
- `stock_rows(store_id, stock_month, brand)`
- `stock_rows(store_id, stock_month, category)`
- `stock_rows(store_id, stock_month, barcode)`
- `stock_rows(store_id, stock_month, sku)`

All indexes use `create index if not exists`. No existing indexes are dropped.

## Life Flow Visibility Change

Done in this phase:

- Removed Life Flow card/summary from `/app/today`.
- Removed Life Flow from default AI Secretary business context.
- Kept `/app/life` route accessible owner-only.
- Added an owner personal area link to Life Flow under `/app/settings`.
- Did not delete Life Flow data or route.

## Known Limitations

- Restock and slow/no-sale are simple Phase 2 signals, not a demand forecast.
- Dead stock is not final because ageing and purchase date are not used.
- Size-specific signals depend on explicit uploaded size data.
- CSV is one multi-section file, not separate workbook tabs.
- Copy Summary depends on browser clipboard support and may be unavailable in restricted browser contexts.
- No PDF generation was added.

## What Was Not Changed

- Payslip/salary modules were not changed.
- Sales parser was not changed.
- Stock parser was not changed.
- Uploaded data was not changed.
- RLS/security was not weakened.
- Secrets were not exposed.
- `.env.local` was not touched.
- Incentive logic was not added.
- Reports/data were not deleted.
- Sales Correction Center behavior was not changed.


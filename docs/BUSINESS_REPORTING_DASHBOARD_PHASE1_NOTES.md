# Business Reporting Dashboard Phase 1 Notes

Date: 2026-06-11

Scope: Proper Business Reporting Dashboard Phase 1 for brand, category, item/product, size, stock, sales, returns, and staff drilldowns. This is read-only reporting. No payslip/salary modules, sales parser, stock parser, uploaded data, RLS policies, incentive logic, or existing reports were changed.

## Route

Route: `/app/reports/business`

Reports page entry:

- Title: `Business Reporting`
- Description: `Search brand, category, item, size, stock and sales performance.`

Access:

- Owner can view all accessible GP/BM active stores.
- Manager can view only assigned GP/BM active stores.
- MITTY is not included in this reporting workflow.
- Salary, payslip, receivable, and incentive data are not queried or displayed.

## Filters

Filters at top:

- Store: all accessible stores or a selected assigned/accessible store.
- Period: today, yesterday, this week, this month, this year, or custom range.
- Brand: searchable/selectable via datalist from current sales and stock result options.
- Category: searchable/selectable via datalist from current sales and stock result options.
- Item/Product: searches item name, barcode, SKU, and brand text in the selected result set.
- Size: searchable/selectable via datalist from current result options.

All selected filters are applied together. Default period is this month.

## Sales Metrics

Summary cards include:

- Net Sales
- Sold Quantity
- Distinct Bills
- Average Bill Value
- Return Amount
- Return Quantity
- Return Rows

Net sales includes negative return rows. Return amount and return quantity are shown separately as absolute values from negative rows.

## Stock Metrics

Summary cards include:

- Current Stock Quantity
- Current MRP Value, when MRP is available
- Unique Items
- Unique Sizes
- Latest Stock Month Used
- Stock warning if a selected store has no latest stock report

Stock uses the latest uploaded stock month per selected store. Go Planet and Brand Mark are kept separate by `store_id`.

## Brand Reporting

Brand Performance table includes:

- Brand
- Net Sales
- Sold Quantity
- Return Amount
- Distinct Bills
- Current Stock Quantity
- Current MRP Value
- Unique Items
- Unique Sizes
- Top Category
- Top Staff
- Movement Status

Brand rows are clickable. Clicking a brand applies the brand filter and updates the dashboard.

When a brand filter is selected, the page also shows selected-filter detail cards for sales, stock, returns, and trend days.

## Category Reporting

Category Performance table includes:

- Category
- Net Sales
- Sold Quantity
- Return Amount
- Distinct Bills
- Current Stock Quantity
- Current MRP Value
- Unique Items
- Unique Brands
- Top Brand
- Top Staff

Category rows are clickable. Clicking a category applies the category filter and updates all metrics.

## Item/Product Reporting

Item/Product Performance table includes:

- Item Name
- Brand
- Category
- Barcode
- SKU
- Net Sales
- Sold Quantity
- Return Quantity
- Return Amount
- Current Stock Quantity
- Current MRP Value
- Sizes Available
- Sizes Sold
- Staff who sold
- Match Confidence

The table is limited to top 50 matching rows for performance safety.

## Size-wise Quantity

Size-wise table includes:

- Size
- Stock Quantity
- Sold Quantity in selected period
- Return Quantity
- Net Sold Quantity
- Net Sales
- Brands Count
- Items Count

Rules:

- Explicit `size` columns from `stock_rows` and `sales_rows` are used.
- Unsafe item-name size inference is not used.
- If uploaded sales rows do not have size, the page shows a warning count.

## Staff Reporting

Staff table is based on the current selected filters and includes:

- Staff Name
- Net Sales
- Sold Quantity
- Distinct Bills
- Return Amount
- Top Brand
- Top Category
- Source Name Breakdown

Existing `staff_name_aliases` are applied. For example, mapped names such as `RITA` and `RITA S` combine under the canonical staff name when aliases exist. No salary, payslip, receivable, or incentive data is included.

## Match Confidence

Stock and sales item matching uses `store_id` and the following priority:

1. `store_id + barcode`
2. `store_id + sku`
3. `store_id + item_name + brand + size + color`
4. `store_id + item_name + brand`
5. `store_id + item_name` as weak match

Displayed confidence values:

- `barcode`
- `sku`
- `strong item match`
- `brand-item`
- `weak item`
- `none`

Weak item matching is labeled clearly. Go Planet and Brand Mark data do not share item match keys.

## Performance Notes

Safeguards:

- Default period is this month, not all time.
- Date range and store filters are applied server-side.
- Brand/category/size filters are applied server-side where possible.
- Item table is limited to top 50 rows.
- Brand/category tables are limited to top 50 rows.
- Size table is limited to top 80 rows.
- Stock data is limited to the latest stock month per selected store.
- Heavy old stock dead/slow logic is not run on initial page load.

Recommended future indexes, not added in this phase:

- `sales_rows(store_id, sale_date, brand)`
- `sales_rows(store_id, sale_date, category)`
- `sales_rows(store_id, sale_date, barcode)`
- `sales_rows(store_id, sale_date, sku)`
- `stock_rows(store_id, stock_month, brand)`
- `stock_rows(store_id, stock_month, category)`
- `stock_rows(store_id, stock_month, barcode)`
- `stock_rows(store_id, stock_month, sku)`

## Limitations

- Brand/category option lists are built from the current filtered result set and capped.
- Item search is filtered after the selected period/store/brand/category/size result set is loaded.
- Size inference from item names is intentionally not implemented.
- Stock uses latest monthly upload, not a live inventory transaction ledger.
- Movement status is a simple Phase 1 indicator, not a full demand forecast.
- No dedicated automated fixture suite was added for this dashboard.

## What Was Not Changed

- Payslip/salary modules were not changed.
- Sales parser was not changed.
- Stock parser was not changed.
- Uploaded data was not changed.
- RLS/security was not weakened.
- Secrets were not exposed.
- `.env.local` was not touched.
- Incentive logic was not added.
- Existing sales, stock, staff, correction, Today, and manager upload pages were not intentionally changed beyond adding the Reports page entry link.


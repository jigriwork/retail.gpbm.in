# Stock Report Workflow Notes

Date: 2026-06-01

## What The Workflow Does

Monthly stock upload turns each store stock file into a report record and parsed `stock_rows`.

Active stores only:

- Go Planet
- Brand Mark

MITTY remains inactive and hidden because the app only uses active accessible stores.

## Schedule

- Stock report due day: 1st of every month
- Stock report period is monthly
- `period_month` is stored as the first date of the selected month

## Upload Behavior

Route:

- `/app/reports/stock`

Managers can upload only for their assigned active store. Owners can upload for any active store.

Allowed file types:

- `.xlsx`
- `.xls`
- `.csv`

Files are stored in the existing Supabase Storage bucket:

- `reports`

Report rows are inserted into the existing `reports` table:

- `report_type`: `stock`
- `store_id`
- `uploaded_by`
- `period_month`
- `report_date`
- `file_name`
- `file_path`
- `status`: `processed`
- `row_count`
- `summary.uploadedForMonth`
- `summary.uploadedAt`
- `summary.originalFileName`
- `summary.fileType`
- `summary.totalQuantity`
- `summary.totalStockValueMrp`
- `summary.brandsFound`
- `summary.categoriesFound`
- `summary.brandSummary`
- `summary.categorySummary`
- `summary.topBrands`
- `summary.topCategories`
- `summary.itemCount`
- `summary.rowCount`

## Parsed Fields

Rows are parsed into `stock_rows` using flexible, case-insensitive header matching with spaces and punctuation ignored.

Parsed fields:

- store / store name / branch / location
- item / item name / product / product name / description
- sku / item code / product code / style code
- barcode
- brand / brand name
- category / department / section / group
- size
- color / colour
- quantity / qty / stock / closing stock / balance qty / pcs / pieces
- mrp / rate / price / selling price
- cost / cost price / purchase price / wsp
- supplier / vendor
- purchase date / inward date / grn date
- ageing / aging / age / days
- raw row data

Fully empty rows are skipped. Rows without a basic stock identity are ignored.

## Store Detection

If the file has a store column, rows must match the selected active store by store name or store code.

If the file has no store column, the selected store is used. Managers only see assigned stores. Owners can select any active store.

Rows for inactive or different stores are rejected.

## Duplicate Rule

Duplicate uploads are blocked for the same:

- store
- `report_type = stock`
- `period_month`

The UI shows:

`Stock report for this store and month already exists.`

There is no replacement or delete flow yet.

## Checklist Behavior

Monthly stock report appears as a required checklist item only when it is operationally due:

- on the 1st of the month
- after the 1st only if the current month report is still missing

Once uploaded after the 1st, it is hidden from the daily required checklist and does not affect normal daily completion percentage.

## Dashboard Behavior

Reports dashboard shows current month stock status per accessible store:

- Uploaded
- Missing
- due day 1
- link to upload

Today page shows:

- stock report due today on the 1st
- stock report pending after the 1st if missing
- uploaded and missing counts for the current month

Store detail pages show:

- current month uploaded/missing status
- uploaded date
- uploaded by
- file name
- row count
- total quantity
- brands/categories found
- recent stock report history

## Task Auto-Completion

When a stock report is uploaded, related open tasks are conservatively marked done when they match:

- same store
- due date around the current month day 1
- status is pending, in progress, or waiting
- title/category contains `stock report` or `monthly_stock`

Auto reminder generation already creates store-level stock report due reminders on the 1st.

## Known Limitations

- No stock replacement/delete flow yet.
- No advanced analytics yet.
- Quantity, MRP, cost, purchase date, and ageing depend on source file quality.
- PDF stock reports are not supported because row parsing is required now.

## Next Recommended Step

Build sales and stock analytics, then staff-wise sales views. Stock rows now make slow stock, dead stock, fast moving stock, and stock availability analysis possible.

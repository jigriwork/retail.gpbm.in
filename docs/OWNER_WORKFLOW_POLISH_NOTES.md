# Owner Workflow Polish Notes

Date: 2026-06-12

Version: v7.0.0

Scope: owner buying workflow clarity, Today shortcuts, Buying & Restock report polish, safer stock wording, and release label update. No payslip/salary modules, sales parser, stock parser, uploaded data, RLS/security, incentives, reports/data deletion, or large new module were changed.

## Owner Command Center Shortcuts

Added a lightweight top section on `/app/today`:

- Title: `Owner Command Center`
- Subtitle: `Quick actions for sales, stock, staff, restock and store control.`

Shortcut cards:

- Buying & Restock -> `/app/reports/business`
- Business Reports / Downloads -> `/app/reports/business`
- Upload Daily Sales -> `/app/reports/sales`
- Upload Stock -> `/app/reports/stock`
- Staff Sales -> `/app/reports/staff`
- Fix Wrong Upload -> `/app/reports/correction` owner-only
- AI Secretary -> `/app/secretary` owner-only
- Store Tasks -> `/app/tasks`
- Daily Checklist -> `/app/checklist`

The shortcuts are static links and do not load Business Reporting data on Today. Manager users do not see owner-only shortcuts.

## Buying & Restock Report Label

The `/app/reports/business` route is kept unchanged, but the owner-facing title now reads:

`Buying & Restock Report`

Subtitle:

`Search brand, category, product and size to see stock, sold quantity, staff performance and reorder signals.`

The old Business Reporting wording remains only as a small secondary label.

## Reports Page Clarity

The Reports page labels were lightly clarified:

- `Buying & Restock Report` for purchasing decisions.
- `Daily Sales Upload` for uploading store sales.
- `Staff Sales Report` for staff performance.
- `Stock Upload` and `Stock Analytics` are clearer as upload versus movement views.
- `Data Correction Center` copy now clearly says it fixes wrong uploads.
- `Sales Analytics` is described as sales trends and targets.

No full Reports page rebuild was done.

## Selected Filter Summary

`/app/reports/business` now shows a selected filter summary near the top:

- Store
- Period/date range
- Brand
- Category
- Product search
- Size
- Latest stock month used
- Missing data warning count

This helps the owner understand exactly what report is being viewed before reading the tables.

## Data Confidence Box

Added `Data Confidence` using already-loaded report data:

- Sales data: Complete / Missing days / No sales data
- Stock data: Latest stock uploaded / Missing stock
- Size data: Available / Missing in some sales rows / No size data
- Match confidence: Strong / Mixed / Weak matches present
- Stock note: latest monthly stock, not live inventory

No new heavy queries were added.

## Quick Decision Cards

Added top decision cards on Buying & Restock Report:

- Top Selling
- Restock Urgent
- Avoid Buying / Push Offer
- Low Stock by Size

These use the existing computed `report` data and show up to three rows per card.

## Empty States

Improved empty states for:

- No brand match
- No category match
- No product/item match
- No restock signal
- No slow/no-sale signal
- No low stock by size
- No size data
- No staff sales

The messages tell the owner what to try next, such as widening the period, checking uploaded stock, or clearing brand/category filters.

## Item Search Limitation Note

Added helper text near item/product search:

`Searches within the selected store, period, brand and category. For best results, first select brand or category, then search item.`

If no item result is found, the empty state suggests widening the period or clearing brand/category filters.

## Business-readable Item Rows

The item table remains business-readable:

- Brand first
- Item/Product name second
- Category
- Size
- Stock Qty
- Sold Qty
- Net Sales
- Restock Signal
- Match Confidence

Barcode/SKU remain secondary detail under the product name.

## Dead Stock Wording

Owner-facing stock wording was softened where safe:

- `Dead stock candidates` became `No-sale / possible dead stock` on Stock Analytics.
- Added note: `Dead stock is not final until purchase date/ageing is considered.`
- Today stock pulse uses `Possible dead`.

No stock analytics logic changed.

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
- No large new module was added.
- Today was not made slower with Business Reporting data.

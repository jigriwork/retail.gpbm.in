# Stock Analytics Notes

Date: 2026-06-01

## What Analytics Are Built

Stock analytics uses uploaded `stock_rows` and recent `sales_rows` to show practical store stock visibility:

- total stock quantity
- total stock MRP value where MRP is available
- item count
- brand count
- category count
- top brands by stock quantity
- top categories by stock quantity
- top items by stock quantity
- slow stock candidates
- dead stock candidates
- fast moving low-stock candidates
- high-stock low-sale candidates

Route added:

- `/app/reports/stock/analytics`

Pages updated:

- `/app/reports`
- `/app/reports/stock`
- `/app/today`
- `/app/stores/[storeId]`

## Matching Logic

Stock rows are matched to sales rows using safe priority order:

1. barcode exact match
2. SKU exact match
3. normalized item name + brand + size + color
4. normalized item name + brand
5. normalized item name only

Item-name-only matching is marked as weak because product names can repeat across variants.

The dashboard shows a data quality note when stock rows do not have SKU or barcode.

## Slow And Dead Stock Rules

The dashboard uses store thresholds:

- `stores.slow_stock_days`
- `stores.dead_stock_days`

Fallbacks:

- Go Planet: slow 30 days, dead 60 days
- Brand Mark: slow 45 days, dead 90 days

Slow stock candidate:

- stock quantity is greater than zero
- sales quantity in the slow threshold window is zero or very low

Dead stock candidate:

- stock quantity is greater than zero
- no matched sales in the dead threshold window

Fast moving low stock:

- recent sales quantity is meaningful
- current stock quantity is low compared to recent sales

High stock low sale:

- stock quantity is high
- recent sales quantity is low or zero

The formulas are intentionally simple and transparent.

## How This Helps Owner Decisions

The owner can now see:

- which store has stock uploaded
- which brands/categories hold the most stock
- which items may need pushing in store or content
- which items have not moved recently
- which selling items may need reorder attention
- where stock is high but sales are low

Managers see only their assigned active store.

MITTY remains hidden because inactive stores are not returned by access queries.

## Limitations

- Matching quality depends on SKU/barcode availability.
- Weak item-name matching can combine similar variants.
- Candidate lists are signals, not final accounting decisions.
- No stock ageing from purchase date is used yet.
- No reorder quantity automation yet.

## Next Recommended Step

Build a weekly audit summary from real data: missing reports, review failures, slow/dead stock signals, top sales, staff leaders and urgent manager updates.

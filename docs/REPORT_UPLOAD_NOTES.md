# Report Upload Notes

Date: 2026-06-01

## Daily Sales Upload

Daily sales upload is now implemented for active stores: Go Planet and Brand Mark.

Supported upload formats:

- `.xlsx`
- `.xls`
- `.csv`

What the upload flow does:

- Requires an active store and report date.
- Lets owner upload for any active store.
- Lets managers upload only for assigned active stores, with app-level checks and Supabase RLS.
- Saves the original file in the existing Supabase Storage bucket: `reports`.
- Inserts one `reports` row with `report_type = sales`, file metadata, row count, and summary JSON.
- Parses file rows into `sales_rows`.
- Preserves every parsed row's original raw data in `raw_data`.
- Blocks duplicate upload for the same store, report type, and report date.

Flexible headers currently detected case-insensitively with spaces and punctuation ignored:

- Store: store, store name, branch, location
- Date: date, sale date, bill date, invoice date
- Bill: bill no, bill number, invoice, invoice no, receipt no
- Item: item, item name, product, product name, description
- SKU/barcode: sku, item code, barcode, product code
- Brand: brand, brand name
- Category: category, department, section, group
- Size, color/colour
- Quantity: quantity, qty, pcs, pieces
- MRP: mrp, rate, price
- Discount: discount, disc, discount amount
- Net sale: net sale, sale amount, amount, net amount, total, final amount, taxable value
- Staff: staff, staff name, salesman, sales person, salesperson, sold by
- Customer and phone fields

Calculated summary:

- total net sale
- row count
- unique bill count
- staff names found
- brand summary and top brands
- category summary and top categories
- top staff by sale

Pages updated:

- `/app/reports`: real reports dashboard with Daily Sales Report status, missing warning, and recent uploads.
- `/app/reports/sales`: upload page with summary after processing.
- `/app/today`: per-store yesterday sales uploaded/missing status and upload link.
- `/app/stores/[storeId]`: store-specific latest sales status, yesterday status, latest sale total, row count, and recent reports.

## Known Limitations

- Upload is processed on submit; there is no separate pre-save preview/staging screen yet.
- Replacement is not implemented. Duplicate store/date sales reports are blocked.
- Files containing rows for a different or inactive store are rejected for this version.
- MITTY remains inactive and is not valid for active report uploads.
- The parser is flexible, but highly unusual Excel structures may need additional aliases or custom parsing.
- Successful upload does not yet auto-complete the daily sales reminder task. A TODO is left in the upload action for a safe task connection.
- Report totals depend on the uploaded file having a recognizable net sale column.

## Next Steps

1. Add upload preview before final save.
2. Add safe owner-only replace/delete flow for duplicate reports.
3. Connect successful sales upload to sales reminder completion.
4. Build monthly stock upload using the existing `reports` and `stock_rows` tables.
5. Build salary attendance upload.
6. Add analytics: daily store comparison, staff-wise sales, category sales, slow/dead stock after stock uploads exist.

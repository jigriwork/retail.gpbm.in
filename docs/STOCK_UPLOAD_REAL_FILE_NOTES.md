# Stock Upload Real File Notes

Date: 2026-06-08

## Supported Real Format

Monthly stock upload now supports the real Go Planet stock report export:

- Workbook sheet such as `Report`
- A title row before the table, for example `STOCK REPORT BARCODE WISE From 08/06/2026 to 08/06/2026`
- Headers on a later row, commonly row 2
- Data rows after the detected header
- A final `GRAND TOTALS` row

The same layout should work for future similar Brand Mark stock exports when the store or godown column matches the selected active store.

## Header Detection

The parser no longer assumes the first non-empty row is the header. It scans the first 20 rows and selects the strongest header row when at least 4 known stock columns are detected.

Recognized columns include:

- Store/godown: `GODOWN NAME`, `STORE`, `STORE NAME`, `BRANCH`
- SKU/item code: `ITEM CODE`, `ITEMCODE`, `SKU`, `PRODUCT CODE`
- Barcode/additional code: `ADDL ITEM CODE`, `ADDITIONAL ITEM CODE`, `ALT ITEM CODE`, `BARCODE`
- Brand/company: `COMPANY NAME`, `COMPANY`, `BRAND`, `BRAND NAME`
- Item: `ITEM NAME`, `PRODUCT NAME`, `DESCRIPTION`
- Category/group: `GROUP1.GRP1`, `GROUP`, `CATEGORY`, `DEPARTMENT`
- Quantity: `CLOSING STOCK`, `CLOSING QTY`, `STOCK`, `QTY`, `QUANTITY`
- MRP: `M.R.P`, `MRP`, `PRICE`
- Purchase date: `PURCHASE DATE`, `PUR DATE`, `GRN DATE`

## Title And Total Rows

Rows before the detected header are ignored as report title or metadata rows.

Rows that clearly contain `GRAND TOTALS`, `GRAND TOTAL`, or `TOTAL` in stock identity fields are skipped so totals are not counted as stock items.

## Upload Size

Next Server Actions are configured with a `15mb` body size limit. This is enough for the tested Go Planet file, which was about 2.75 MB, while still keeping a reasonable cap on upload request size.

## Store Validation

If the file includes a store/godown column, uploaded rows must match the selected active store by store name or store code. For the tested file, `GODOWN NAME = GO PLANET` is accepted when the selected store is Go Planet.

Rows for another, unknown, or inactive store are rejected. MITTY remains inactive/hidden through the existing active-store logic.

## Large File Handling

The parser processes the workbook in memory and does not perform per-row network calls. Parsed `stock_rows` are inserted in batches of 1,000 rows to avoid one very large insert request.

## Known Limitations

- The upload still processes immediately; there is no preview/staging screen.
- Duplicate stock uploads for the same store and month are still blocked.
- PDF stock reports are not supported.
- Files with headers deeper than the first 20 rows may need another parser adjustment.
- Totals are skipped only when the row is clearly a total row.

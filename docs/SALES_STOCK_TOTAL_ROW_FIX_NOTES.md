# Sales and Stock Total Row Fix Notes

Date: 2026-06-08

## Issue Found

A real Go Planet daily sales report for `2026-06-07` was uploaded with a wrong total.

The app showed about `₹423,878`, but the correct item-row sale total is `₹211,939`.

Root cause:

- The Excel file contains footer rows: `GODOWN WISE TOTALS` and `GRAND TOTALS`.
- The old sales parser skipped `GRAND TOTALS`.
- It did not skip `GODOWN WISE TOTALS`.
- That footer row was imported as a normal sales row with quantity `168` and net sale `₹211,939`, which doubled the report total.

## Parser Fix

Sales and stock parsers now treat these clear footer/total rows as skipped rows:

- `GODOWN WISE TOTALS`
- `GODOWN TOTALS`
- `GRAND TOTALS`
- `GRAND TOTAL`
- `TOTALS`
- clear subtotal/footer rows

The footer detection stays conservative: it requires the row identity fields to be blank or footer wording, so normal item rows are not skipped just because an item name contains a similar word. Negative return rows are still preserved.

## Existing Report Repair

An owner-only `Repair totals` action was added for sales report cards.

Use this only when a footer/total row was imported by mistake. The action:

- verifies the current user is owner;
- verifies the selected report is a sales report;
- detects footer rows linked to that report;
- deletes only detected footer rows;
- recalculates `reports.row_count` and `reports.summary`;
- revalidates Today, Reports, Sales analytics, Staff sales, and Store detail pages.

For the existing Go Planet `2026-06-07` report, one row was removed:

- Bill no: `GODOWN WISE TOTALS`
- Quantity: `168`
- Net sale: `₹211,939`

Corrected result:

- Row count: `164`
- Total net sale: `₹211,939`
- Total quantity: `168`
- Distinct bill numbers in the file/database: `74`
- Return/negative rows: `2`
- Footer rows remaining: `0`

Note: the original repair request expected `75` distinct bills, but the real Excel file and repaired database both contain `74` distinct non-empty bill numbers after footer rows are removed.

## Stock Double-Check

The Go Planet stock upload was not doubled.

Verified current stock report:

- File: `june 2026 stock go planet.xlsx`
- Report month: `2026-06-01`
- Row count: `24,954`
- Closing stock quantity: `58,020`
- Footer rows imported: `0`

## Stock Analytics Store Scoping

Stock analytics movement matching is now store-scoped.

Before this fix, when multiple stores were viewed together, a sales movement key could match by barcode/SKU/item without including store id. Now movement keys include store id, so Go Planet sales cannot inflate Brand Mark stock movement and Brand Mark sales cannot inflate Go Planet stock movement.

## Future Upload Validation

Manual validation for `agent sale report.xlsx`:

- Detected date: `2026-06-07`
- Detected store: `GO PLANET`
- Parsed item rows: `164`
- Skipped footer rows: `2`
- Skipped rows: `GODOWN WISE TOTALS`, `GRAND TOTALS`
- Total net amount: `₹211,939`
- Return rows: `2`
- Distinct bill numbers: `74`

Future uploads with these footer rows should not import footer totals as item rows.

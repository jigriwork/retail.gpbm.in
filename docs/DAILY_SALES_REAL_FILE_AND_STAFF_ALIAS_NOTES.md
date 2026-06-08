# Daily Sales Real File And Staff Alias Notes

Date: 2026-06-08

## Real Sales File Format

Daily sales upload now supports the real agent sales report export:

- Sheet such as `Report`
- Blank row before the report body
- Title row such as `DATE+BILL WISE SALE CUSTOMISED From 07/06/2026 to 07/06/2026`
- Actual headers on a later row
- Data rows after the detected header
- Optional clear total rows

The parser scans the first 20 rows and detects the header row from known sales columns instead of assuming the first non-empty row is the header.

## Recognized Real Columns

- Bill date: `BILL DATE`, `DATE`, `SALE DATE`, `INVOICE DATE`
- Bill number: `BILL NO.`, `BILL NO`, `BILL NUMBER`, `INVOICE NO`, `INVOICE NUMBER`
- Brand/company: `COMPANY NAME`, `COMPANY`, `BRAND`, `BRAND NAME`
- Category/group: `GROUP1.GRP1`, `GROUP`, `CATEGORY`, `DEPARTMENT`
- Item: `ITEM NAME`, `PRODUCT NAME`, `DESCRIPTION`
- Agent/staff: `AGENT NAME`, `SALESMAN`, `SALES PERSON`, `STAFF NAME`, `STAFF`, `USER NAME`
- Quantity: `SALE QTY`, `SALE QUANTITY`, `QTY`, `QUANTITY`
- MRP: `M.R.P.`, `M.R.P`, `MRP`, `PRICE`
- Net amount: `NET AMOUNT`, `NET AMT`, `AMOUNT`, `SALES AMOUNT`, `TOTAL AMOUNT`
- Store/godown: `GODOWN NAME`, `STORE`, `STORE NAME`, `BRANCH`

## Date Detection

Upload reads `BILL DATE` from parsed rows.

- If all usable rows have one bill date, that date is used as `reports.report_date`.
- If multiple bill dates are found, upload is blocked with a one-day-at-a-time error.
- If no bill date is found, the manually selected UI report date is used.

Daily sales reports remain date-wise. Duplicate protection still blocks the same store/date sales upload.

## Returns And Totals

Negative `SALE QTY` and `NET AMOUNT` rows are preserved because returns must reduce sales totals.

Clear total rows containing `GRAND TOTALS`, `GRAND TOTAL`, or `TOTAL` in sales identity fields are skipped so totals are not inserted as item rows.

## Bill Count

Bill count uses distinct bill numbers, not row count. Staff-wise analytics counts distinct bills per grouped staff bucket and sums:

- `NET AMOUNT` for sales amount
- `SALE QTY` for quantity

Negative rows reduce both totals.

## Staff Alias Mapping

Raw `AGENT NAME` is stored unchanged in `sales_rows.staff_name`.

Mapped reporting uses `staff_name_aliases` with:

- `store_id`
- `source_type = sales_report`
- `normalized_source_name`
- `canonical_staff_name`
- optional `employee_contact_id`

Multiple sales report names can map to one staff contact. Example:

- `RITA` to `Rita`
- `RITA S` to `Rita`

Both names then group under `Rita` in staff-wise sales analytics, while original source names remain saved in sales rows.

## Alias Management

Route:

- `/app/reports/staff-aliases`

The page supports:

- store filter
- search
- unmatched sales report names from recent uploaded rows
- existing aliases
- add/edit alias mapping
- mapping to existing Staff Phone Directory contacts
- creating a new staff contact from a source name when needed

Owner can map aliases for all active stores. Managers can map aliases only for assigned active stores.

## Permissions

Owner can upload sales reports for all active stores.

Managers can upload sales reports only for assigned active stores:

- Go Planet manager: Go Planet only
- Brand Mark manager: Brand Mark only
- Both-store manager: both stores
- No-store manager: no upload form store option

Server actions re-check store assignment to block tampered `storeId` submissions. MITTY remains inactive/hidden.

## No Incentive Logic

This work only normalizes staff names for reporting. No incentive rules, categories, slabs, or payout logic were added.

## Known Limitations

- Upload still processes immediately; there is no preview/staging screen.
- Multi-date sales files are blocked instead of offering an in-flow confirmation screen.
- Unmatched staff names are found from recent queried sales rows on the alias page.
- Staff alias source breakdown is shown on staff-wise sales only when multiple source names roll into one mapped staff name.
- Sales rows still store only the original source staff name; mapped names are applied during reporting.

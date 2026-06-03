# Payslip Generation Notes

## Upload flow

Owner opens `/app/payslips`, uploads a salary Excel/CSV sheet from `/app/payslips/upload`, selects the salary month, and optionally chooses a fallback store. The source sheet is saved in the private `payslips` bucket under `source-sheets/`. A `payslip_batches` row is created, salary rows are parsed into `payslip_rows`, and the owner reviews the batch before generating PDFs.

## Firm/store mapping

Payslip headers use `Store Name - Salary Slip`. The Firm row uses `stores.firm_name`; the Store Name row uses `stores.name`.

Current defaults:
- Go Planet: Firm `Go Planet`, Store Name `Go Planet`
- Brand Mark: Firm `Go Planet`, Store Name `Brand Mark`

MITTY is inactive and is not treated as a valid payslip store.

## Editing firm name

Owner can edit firm names in `/app/settings` under `Store Master / Firm Mapping`. Managers cannot see this section. New salary-sheet uploads snapshot the current `firm_name` and `store_name` into `payslip_rows`; generated PDFs also snapshot those values into `generated_payslips`. Old payslips do not change when a store firm name is edited later.

## Data source rule

Sample payslip PDFs are only format references. Calculation, totals, validation and testing must use the uploaded salary Excel/CSV sheet.

## Calculation rules

- `divided_by_days` = uploaded value, or `salary_amount / 30`
- blank absent days = `0`
- `abs_amount` = uploaded value, or `divided_by_days * abs_days`
- blank Sunday pay = `0`
- blank Sunday present = `0`
- `sunday_pay_amount` = `sunday_pay * sunday_present`
- blank advance = `0`
- blank commission = `0`
- `calculated_total_amount` = `salary_amount - abs_amount - advance + sunday_pay_amount + commission`
- `net_payable` = uploaded total amount when present, otherwise calculated total amount

## Warnings

If uploaded total exists and differs from calculated total by more than Rs 1, the row gets a mismatch warning. PDF generation is still allowed.

## Sunday row rule

Sunday Pay Rate, Sunday Present and Sunday Pay Amount are hidden when Sunday Present is `0` and Sunday Pay Amount is `0`. They are shown when Sunday Present is greater than `0` or Sunday Pay Amount is greater than `0`.

## File naming

Generated PDFs are saved in the private `payslips` bucket under `generated/{batchId}/filename.pdf`.

Filename format:
- `StoreName_StaffName_Payslip_Month_Year.pdf`
- spaces become underscores
- unsafe characters and slashes are removed

All PDFs can be downloaded as a streamed ZIP named `Payslips_Month_Year.zip`.

## Testing Go Planet vs Brand Mark

Upload rows for both active stores. Confirm:
- Go Planet row: header `GO PLANET - Salary Slip`, Firm `Go Planet`, Store `Go Planet`
- Brand Mark row: header `BRAND MARK - Salary Slip`, Firm `Go Planet`, Store `Brand Mark`
- After changing Brand Mark firm name in settings, a new uploaded row uses the new firm snapshot
- Existing payslip rows and generated records retain their previous firm snapshot

## Known limitations

- Managers have no payslip access in v1.
- ZIP files are streamed on demand rather than persisted under `zips/`.
- Parser expects a recognizable header row in each worksheet.

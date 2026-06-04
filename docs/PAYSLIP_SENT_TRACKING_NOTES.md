# Payslip Sent Tracking Notes

Payslip sent status is owner-confirmed. Personal WhatsApp links and browser share sheets do not confirm that the owner pressed Send, and they do not confirm delivery to the employee.

## Owner Flow

- `Send WhatsApp Text` opens WhatsApp with the salary message and records a share attempt only.
- `Share PDF` records a share attempt when the browser can start the native PDF share flow.
- `Copy Message` records a copy-message share attempt.
- The owner clicks `Mark Sent` after sending in WhatsApp.
- If a mistake is made, use `Mark Not Sent` to revert the payslip to pending.
- `Mark Failed` and `Mark Skipped` are available when the owner decides the payslip should not remain pending.

## Dashboard Counts

- The payslip dashboard shows generated, sent and pending counts for recent batches.
- The batch review page shows total generated, sent, not sent, failed and skipped counts.
- Batch filters can show only sent, not sent, failed or skipped generated payslips.

## WhatsApp Salary Text

- The WhatsApp salary text now includes full payslip details similar to the PDF.
- Included fields are firm, store name, salary month, name, salary amount, divided by days, absent days, absent amount, advance deduction, commission and net payable.
- Sunday pay rate, Sunday present and Sunday pay amount are included only when Sunday present or Sunday pay amount is greater than zero.
- Brand Mark payslips keep `Firm: Go Planet`, `Store Name: Brand Mark` and `Regards, Brand Mark`.
- Go Planet payslips keep `Firm: Go Planet`, `Store Name: Go Planet` and `Regards, Go Planet`.

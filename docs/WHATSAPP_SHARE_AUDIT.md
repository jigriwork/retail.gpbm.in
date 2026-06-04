# WhatsApp Share Audit

Date: 2026-06-04

## Scope

Audited payslip sharing in:

- `/app/payslips/[batchId]`
- `/app/payslips/[batchId]/rows/[rowId]`
- `components/payslips/whatsapp-actions.tsx`
- `app/app/payslips/[batchId]/rows/[rowId]/download/route.ts`
- `lib/payslips/actions.ts`
- `lib/payslips/queries.ts`
- `lib/payslips/whatsapp.ts`
- Supabase payslip schema/storage migrations

## Current Buttons And Behavior

All generated payslip sharing actions are rendered by `PayslipWhatsAppActions`.

### `/app/payslips/[batchId]`

- Each generated row passes `/app/payslips/${batch.id}/rows/${row.id}/download` as `downloadUrl`.
- `fileName` comes from `generated.pdf_file_name`, falling back to `payslipFileName(...)`.
- `staffName`, `storeName`, `salaryMonth`, and `whatsappPhone` are passed from the row.

| Button | Function/target | Downloads PDF | Fetches PDF blob | Creates File | Calls `navigator.share` with files | Opens text-only WhatsApp link | Can attach PDF |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Download PDF | Anchor to secure download route | Yes | No | No | No | No | Yes, as a browser download only |
| Share PDF | `sharePdf()` | No direct download | Yes, via `fetch(downloadUrl)` | Yes, `new File([blob], fileName, { type: "application/pdf" })` | Yes, after `navigator.canShare({ files: [file] })` | No | Yes, only on supported mobile browsers/share targets |
| Open WhatsApp | `whatsAppLink(whatsappPhone, message)` | No | No | No | No | Yes, `wa.me` | No |
| Copy Message | `copyMessage()` | No | No | No | No | No | No |
| Open WhatsApp Web | Anchor to `https://web.whatsapp.com/` | No | No | No | No | Opens WhatsApp Web only | No |

### `/app/payslips/[batchId]/rows/[rowId]`

- The preview page uses the same `PayslipWhatsAppActions` component and the same secure download route.
- Behavior is the same as the batch page.

## PDF Source Audit

- PDF bytes are generated in `renderPayslipPdf(row)` using `pdf-lib`.
- `generateOne(rowId)` stores the PDF in the private Supabase Storage bucket `payslips`.
- The generated storage path is `generated/${row.batch_id}/${fileName}`.
- `generated_payslips.pdf_file_path` stores the private storage path.
- `generated_payslips.pdf_file_name` stores the browser/share filename.
- The client does not receive a raw signed URL. It receives an app route: `/app/payslips/[batchId]/rows/[rowId]/download`.
- The download route checks the current Supabase user and allows only active owners.
- The route reads the latest generated record for the batch and row, downloads the private storage object server-side, and returns:
  - `Content-Type: application/pdf`
  - `Content-Disposition: attachment; filename="..."`
- Because the client fetches a same-origin app route, browser CORS should not block the blob fetch.
- Supabase storage remains private. The migration creates the `payslips` bucket with `public = false` and owner-only storage policies.
- Signed URL expiry is not part of the current client flow because the app uses a secure download route instead of signed URLs. If a future signed URL flow is added, expiry should surface as a refresh-and-try-again fallback.

## Web Share API Audit

- `navigator.share` is used only in `components/payslips/whatsapp-actions.tsx`, a client component.
- `navigator.canShare` is checked with `{ files: [pdfFile] }` before calling share.
- A `File` object is created from the fetched blob:
  - `new File([blob], fileName, { type: "application/pdf" })`
- The file MIME type is forced to `application/pdf`, so a missing blob type does not weaken the share payload.
- The code handles unsupported browsers with a fallback message.
- The code now separates common failure states:
  - PDF could not be fetched.
  - Browser does not support file sharing.
  - Share was cancelled.
  - User should refresh if access/fetch fails.
- No raw stack traces or secret URLs are shown to the user.

## WhatsApp Limitation Audit

- `wa.me` links can prefill message text only.
- `wa.me` links cannot attach PDFs.
- `Open WhatsApp` therefore opens chat/message text only.
- `Share PDF` is the only browser path that can hand a PDF file to WhatsApp, and only through the native mobile share sheet on supported browsers/devices.
- Desktop WhatsApp/Web cannot be reliably auto-opened with a PDF attachment from a website.
- Desktop fallback remains:
  1. Download PDF.
  2. Copy message.
  3. Open WhatsApp or WhatsApp Web.
  4. Attach PDF manually.
  5. Send.

## UI Wording Audit

- `Share PDF` attempts native file sharing with the generated PDF.
- `Open WhatsApp` is labelled as chat/message only through its accessible label.
- Helper text now states: `PDF attachment works only through mobile share sheet on supported browsers. WhatsApp chat link sends message text only.`
- The old wording that implied the WhatsApp link might already attach the downloaded PDF was removed.
- The WhatsApp message no longer claims the PDF is attached when sent through a text-only chat link.

## Security Notes

- Payslip pages remain owner-only at page level.
- The PDF download route remains owner-only and active-user gated.
- Managers can maintain employee contact phone numbers for assigned stores, but managers still cannot access payslip rows, generated payslip records, PDF routes, or the private payslip storage bucket.
- No storage private path is exposed as the download target; the client receives only the app route.
- No WhatsApp Business API secrets or Meta tokens are used.

## Result

Before this audit, `Open WhatsApp` was working as text-only, which is expected for `wa.me`. `Share PDF` already attempted a Web Share API file flow, but the UI wording and failure states were not explicit enough. The flow now keeps the secure app download route, fetches the PDF blob, creates an `application/pdf` `File`, checks file-share support, calls `navigator.share({ files, title, text })` when supported, and gives clear manual fallback guidance otherwise.

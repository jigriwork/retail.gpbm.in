# Payslip WhatsApp Share Notes

## Employee Phone Directory

- `/app/employees` is owner-only and lists employee contacts by active store.
- Owners can add and edit staff name, store, phone number, notes and active status.
- Deleting is intentionally not part of the default flow. Mark employees inactive instead.

## Phone Normalization

- Spaces, hyphens and brackets are removed.
- `+91` becomes `91`.
- Valid 10-digit Indian mobile numbers are converted to `91XXXXXXXXXX`.
- Only digits are kept.
- Invalid or missing phone values are left blank for WhatsApp sharing.

## Salary Upload Auto-Fill

- Salary sheets can include phone columns using headers such as `phone`, `mobile`, `mobile no`, `contact number`, `staff phone`, `whatsapp` or `whatsapp number`.
- Upload phone has first priority.
- If a row has no uploaded phone, the app matches `employee_contacts` by `store_id` and normalized staff name.
- If an uploaded phone is valid and no employee contact exists, the owner upload creates the contact automatically.
- If uploaded phone differs from the saved contact, the payslip row keeps the uploaded phone and shows a warning.

## Mobile Share PDF

- `Share PDF` fetches the generated PDF, creates a PDF `File`, and uses the browser Web Share API when file sharing is supported.
- On supported phones, the native share sheet opens and the owner can choose WhatsApp.
- Unsupported browsers show a fallback message to download and share manually.

## Open WhatsApp Chat

- `Open WhatsApp` uses `https://wa.me/[whatsappPhone]?text=[encodedMessage]`.
- The message is prefilled, but the owner still sends manually.
- `wa.me` cannot attach the PDF automatically.

## Desktop Fallback

- Desktop flow is: Download PDF, copy message, open WhatsApp, attach PDF manually and send.
- `Open WhatsApp Web` opens `https://web.whatsapp.com/`.

## Why Automatic Sending Is Not Included

- This version does not use WhatsApp Business API, Meta access tokens, webhooks or automatic sending.
- Normal WhatsApp links and mobile share sheets keep the workflow simple and avoid storing messaging secrets.

## Future V2

- WhatsApp Business Cloud API can send PDFs automatically after proper Meta setup, templates, token storage, webhook handling and operational approval.

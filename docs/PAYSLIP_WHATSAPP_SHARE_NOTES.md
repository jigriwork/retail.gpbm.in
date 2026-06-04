# Payslip WhatsApp Share Notes

## Employee Phone Directory

- `/app/employees` is the Staff Phone Directory and lists employee contacts by active assigned store.
- Owners can manage all active Go Planet and Brand Mark contacts.
- Managers can manage contacts only for their assigned stores.
- Staff names are auto-created from existing payslip rows after the owner clicks `Sync staff from payslips`.
- Staff names are also auto-created from future salary uploads even when phone is blank.
- Owners can add and edit staff name, store, phone number, notes and active status.
- Normal flow is to sync or upload payslips first, then add phone numbers beside auto-detected staff names.
- Manual add employee is optional and is not the main flow.
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
- Matching is always by `store_id` plus normalized staff name.
- If a row has no uploaded phone, the app matches `employee_contacts` by store and normalized staff name.
- If no employee contact exists, the owner upload creates one even when phone is blank.
- If an uploaded phone is valid and the employee contact phone is blank, the contact is updated.
- If uploaded phone differs from the saved contact, the payslip row keeps the uploaded phone and shows a warning.

## One-Time Phone Setup

- Owners add the phone number once in the Staff Phone Directory, payslip review row or payslip preview page.
- Saving phone permanently updates `employee_contacts`.
- Matching current `payslip_rows` and generated payslip records are updated by store and normalized staff name.
- Future uploads auto-fill phone using the saved employee contact.
- Owner only edits the phone again when the staff phone number changes.

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

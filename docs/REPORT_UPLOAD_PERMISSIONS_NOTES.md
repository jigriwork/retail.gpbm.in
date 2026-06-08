# Report Upload Permissions Notes

Date: 2026-06-08

## Scope

This audit covers active-store permissions for:

- Monthly stock upload
- Daily sales upload

It does not change payslip, salary, salary attendance, or manager role behavior.

## Active Stores

Active report upload stores are loaded dynamically from `stores.is_active = true`.

- Go Planet: active
- Brand Mark: active
- MITTY: inactive/hidden

## Owner Access

Owners use `getAccessibleStores`, which returns all active stores. Owners can upload stock and sales reports for Go Planet and Brand Mark.

Owner uploads are still blocked if a submitted `storeId` is not an active store in the accessible store list.

## Manager Access

Managers use `getAccessibleStores`, which returns only active stores assigned through `store_users`.

- Manager assigned to Go Planet only sees and can upload for Go Planet only.
- Manager assigned to Brand Mark only sees and can upload for Brand Mark only.
- Manager assigned to both stores sees and can upload for both stores.
- Manager assigned to no active store sees no upload form store option and cannot upload.

Both stock and sales server actions re-check assignment with `canAccessStore`, so tampering with the submitted `storeId` is blocked server-side.

## Stock Upload Permissions

Stock upload uses the selected active store for:

- duplicate report checks
- storage path
- report row insert
- parsed `stock_rows.store_id`
- task auto-completion

If the uploaded stock file includes a store/godown column, each row must match the selected active store by store name, store code, or a godown value containing the full store name.

Managers can insert `stock_rows` only when `store_id` is in their assigned `store_users` list. Unassigned store rows are blocked by RLS.

## Sales Upload Permissions

Sales upload uses the selected active store for:

- duplicate report checks
- storage path
- report row insert
- parsed `sales_rows.store_id`
- task auto-completion

Sales parser behavior was not changed in this audit. The server action still blocks uploads for unassigned stores before parsing or inserting.

Managers can insert `sales_rows` only when `store_id` is in their assigned `store_users` list. Unassigned store rows are blocked by RLS.

## Storage

Report files are uploaded into the private `reports` bucket through server actions after app-level active-store and assignment checks pass.

## Known Limitations

- There is no upload preview/staging screen.
- Duplicate report replacement is not implemented.
- Storage object policies are bucket-level; store assignment is enforced by the server actions and row/report RLS.

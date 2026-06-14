# Password Account Recovery Notes

Date: 2026-06-14

Version: v7.3.0

Scope: password and account recovery release. No sales parser, stock parser, payslip/salary module, uploaded data, report rows, RLS policy, or environment secret was changed.

## Change My Password

Logged-in owners and managers can open `/app/settings/account` from Settings and change their own password.

The form requires:

- current password
- new password
- confirm new password

Passwords are sent to Supabase Auth only. They are not stored in app tables and are not written to audit log metadata.

Success message:

`Password changed successfully. Please login again if asked.`

## Forgot Password

The login page now shows `Forgot password?`.

The forgot password page is `/forgot-password`. It asks for an email and sends a Supabase password reset email. The response is intentionally generic:

`If an account exists for this email, a password reset link has been sent.`

## Reset Password Email Flow

Reset emails redirect to `/reset-password`.

The reset password page handles Supabase recovery sessions, accepts a new password and confirmation, updates the password through Supabase Auth, signs the user out, and redirects to login.

Production reset URL defaults to `https://retail.gpbm.in/reset-password`. Local reset requests use the current local origin when sent from the local app.

## Owner Send Reset Link

Owner can open `/app/users` and send a password reset link for a user. This does not reveal or store any password.

Managers cannot access `/app/users` and cannot send reset links for other users.

## Temporary Password Reset

Owner can set a temporary password for manager accounts when the server service role key is configured.

Warning shown in the UI:

`Share this temporary password securely. Ask the user to change it after login.`

The temporary password is not stored and is not shown after submit.

Temporary reset is intentionally shown only for manager profiles, not owner profiles.

## Audit Log Actions

Best-effort audit logs were added for:

- `send_password_reset_link`
- `change_own_password`
- `owner_reset_user_password`
- `create_user`
- `activate_user`
- `deactivate_user`
- `assign_user_store`
- `update_user_store_assignments`

Audit metadata does not include passwords.

## Security Notes

- Service role key remains server-side only through `createAdminClient`.
- Public forgot-password response avoids confirming whether an email exists.
- Owner-only user reset actions use `requireOwner`.
- Logged-in password change requires the current password before updating to the new password.
- Passwords are not stored in `profiles`, `audit_logs`, or app data tables.
- `.env.local` remains ignored and must not be committed.

## What Was Not Changed

- Sales parser
- Stock parser
- Payslip/salary modules
- Uploaded report files
- Uploaded data rows
- RLS policies
- Storage policies
- Manager store assignment model

## Known Limitations

- Supabase email templates and allowed redirect URLs must include `/reset-password` in the production project settings.
- Temporary password reset does not force first-login password change yet.
- Audit logs are best-effort. If the audit insert fails, password operations still complete.
- There is no rate-limit UI beyond Supabase/platform protections.

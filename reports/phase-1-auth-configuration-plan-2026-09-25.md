# Phase 1 Auth configuration change plan

Prepared: 25 September 2026 (Asia/Kolkata)
Status: **plan only; no production Auth setting changed**

## Observed production baseline

- Site URL: `http://localhost:3000`
- Additional redirect allow-list: empty
- Email/password login: enabled
- Phone authentication: disabled
- Public signup: disabled
- Minimum platform password length: six
- CAPTCHA: disabled

## Proposed production-gate changes

1. Keep public signup disabled and phone authentication disabled in Phase 1.
2. Set the Site URL to `https://retail.gpbm.in`.
3. Allow only the exact redirects required by the current application:
   - `https://retail.gpbm.in/reset-password`
   - the separately approved, protected preview reset URL during preview validation only
4. Raise the Supabase password minimum to at least eight now so it matches the current application validation. A later staff phase may raise both layers to ten after the owner approves that policy.
5. Enable breached-password checks if the confirmed Supabase plan exposes the control.
6. Review login/recovery rate limits using measured normal traffic; retain generic authentication failures.
7. Enable CAPTCHA on externally exposed recovery/signup surfaces only after a non-production provider proof. Signup remains disabled.
8. Record the old values, exact new values, operator, time, and screenshots/export before changing anything.

## Validation and rollback

- Validate owner and manager login, logout, refresh, forgot-password, reset-password, expired link, unlisted redirect rejection, and disabled signup in isolated preview first.
- At production gate, change one setting group at a time and repeat owner/manager smoke tests.
- Roll back by restoring the recorded prior setting values. No database migration is coupled to this setting change.
- Do not create a staff account, enable phone Auth, configure SMS, or change production in this candidate.

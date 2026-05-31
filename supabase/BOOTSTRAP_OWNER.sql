-- GPBM Retail owner bootstrap
-- 1. Replace OWNER_EMAIL_HERE with the owner's authenticated email address.
-- 2. Run this once after the owner user signs up/signs in and the profile is created.
-- 3. Do not make anyone owner automatically in migrations.

update public.profiles
set role = 'owner', updated_at = now()
where email = 'OWNER_EMAIL_HERE';
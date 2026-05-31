-- Current active store set for GPBM Retail.
-- MITTY remains in the database for future expansion, but is hidden from active app flows.

update public.stores
set is_active = true, updated_at = now()
where code in ('GP', 'BM');

update public.stores
set is_active = false, updated_at = now()
where code = 'MITTY';

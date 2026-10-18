-- One-off WhatsApp campaigns (e.g. the Brand Mark festive offer) are recorded
-- like other MSG91 sends, with their own budget outside the store's monthly one.
begin;

alter table public.whatsapp_deliveries drop constraint if exists whatsapp_deliveries_kind_check;
alter table public.whatsapp_deliveries add constraint whatsapp_deliveries_kind_check
  check (kind in ('customer_thank_you', 'customer_follow_up', 'customer_campaign', 'payslip', 'owner_summary', 'owner_night_plan', 'account_ready'));

commit;

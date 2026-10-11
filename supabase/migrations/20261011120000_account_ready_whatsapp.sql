-- "Your account is ready" WhatsApp notices are recorded like other MSG91 sends.
begin;

alter table public.whatsapp_deliveries drop constraint if exists whatsapp_deliveries_kind_check;
alter table public.whatsapp_deliveries add constraint whatsapp_deliveries_kind_check
  check (kind in ('customer_thank_you', 'customer_follow_up', 'payslip', 'owner_summary', 'owner_night_plan', 'account_ready'));

commit;

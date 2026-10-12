-- Delivery status pulled from MSG91's WhatsApp logs, applied in one call.
-- Only moves a message forward (sent → delivered → read) or to failed.
begin;

create or replace function public.apply_whatsapp_status_updates(p_updates jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  changed integer := 0;
  n integer;
begin
  for item in select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
    update public.whatsapp_deliveries d set
      status = item->>'status',
      delivered_at = coalesce(d.delivered_at, (item->>'delivered_at')::timestamptz),
      read_at = coalesce(d.read_at, (item->>'read_at')::timestamptz),
      failed_at = case when item->>'status' = 'failed' then coalesce((item->>'failed_at')::timestamptz, now()) else d.failed_at end,
      error_code = case when item->>'status' = 'failed' then left(item->>'error_code', 120) else d.error_code end
    where d.id = (item->>'id')::uuid
      and item->>'status' in ('delivered', 'read', 'failed')
      and (
        (item->>'status' = 'failed' and d.status in ('processing', 'accepted'))
        or (item->>'status' = 'delivered' and d.status in ('processing', 'accepted', 'failed'))
        or (item->>'status' = 'read' and d.status in ('processing', 'accepted', 'delivered', 'failed'))
      );
    get diagnostics n = row_count;
    changed := changed + n;
  end loop;
  return changed;
end $$;

revoke all on function public.apply_whatsapp_status_updates(jsonb) from public, anon, authenticated;
grant execute on function public.apply_whatsapp_status_updates(jsonb) to service_role;

commit;

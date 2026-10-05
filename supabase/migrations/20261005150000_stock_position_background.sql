-- The stock position (stock on hand per item, used by buying pages and the
-- item scanner) was rebuilt on a person's request. For Go Planet's 50,073-row
-- stock file that takes ~15 s, beyond the 8-second limit on signed-in
-- requests. It is now rebuilt in the background every 30 minutes (only when a
-- store's reports changed, and once after midnight India time); requests still
-- try a quick refresh but fall back to the last saved position.
begin;

-- Same rebuild without the person check, for the scheduler only.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.refresh_stock_position(uuid)'::regprocedure);
  def := replace(def, 'public.refresh_stock_position(', 'public.refresh_stock_position_system(');
  def := regexp_replace(def, 'if not exists \(select 1 from public\.profiles where id = auth\.uid\(\).*?end if;', '');
  if position('auth.uid()' in def) > 0 or position('refresh_stock_position_system' in def) = 0 then
    raise exception 'refresh_stock_position changed; review this migration';
  end if;
  execute def;
end $$;

create function public.refresh_all_stock_positions_system() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_store uuid; v_done integer := 0;
begin
  for v_store in select id from public.stores where is_active order by code loop
    if public.refresh_stock_position_system(v_store) then v_done := v_done + 1; end if;
  end loop;
  return v_done;
end $$;

revoke all on function public.refresh_stock_position_system(uuid), public.refresh_all_stock_positions_system() from public, anon, authenticated;

commit;

do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('stock-position-refresh', '*/30 * * * *', 'select public.refresh_all_stock_positions_system()');
  end if;
end
$outer$;

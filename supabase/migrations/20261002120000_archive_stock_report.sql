-- Owner deletes (archives) a wrong monthly stock report so the store's
-- manager can upload the correct file for that month.
--
-- Mirrors public.archive_sales_report: published report data may only change
-- through transactional RPCs (direct UPDATE on public.reports is revoked), the
-- report and its stock rows are kept, only is_current is cleared, and the
-- action is audited. Uses the same per-store lock as stock uploads so a delete
-- and an upload for the store cannot interleave. Additive: no existing object
-- or row is changed by applying this migration.
begin;

create function public.archive_stock_report(p_report uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.reports;
begin
  if not public.is_owner() then
    raise exception 'Owner required';
  end if;

  select * into r from public.reports where id = p_report and report_type = 'stock';
  if not found or not public.can_access_store(r.store_id) then
    raise exception 'Report unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(r.store_id::text || 'stock', 0));
  select * into r from public.reports where id = p_report for update;
  if not r.is_current then
    return jsonb_build_object('ok', true, 'message', 'Stock report already deleted.');
  end if;

  update public.reports set is_current = false where id = r.id;

  insert into public.audit_logs (actor_id, actor_role, entity_type, entity_id, store_id, action, metadata)
  values (
    auth.uid(), 'owner', 'report', r.id, r.store_id, 'delete_stock_report',
    jsonb_build_object(
      'file_name', r.file_name,
      'file_path', r.file_path,
      'period_month', r.period_month,
      'row_count', r.row_count,
      'summary', r.summary,
      'source_retained', true,
      'version_retained', true
    )
  );

  return jsonb_build_object('ok', true, 'message', 'Stock report deleted. Its rows and source file are kept.');
end $$;

revoke all on function public.archive_stock_report(uuid) from public, anon;
grant execute on function public.archive_stock_report(uuid) to authenticated;

commit;

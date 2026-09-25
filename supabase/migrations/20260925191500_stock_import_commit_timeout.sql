-- Finalize one bounded stock snapshot without rebuilding each staged JSON
-- chunk. This keeps the platform statement timeout unchanged and preserves
-- the existing atomic publication boundary.
begin;

create function public.commit_stock_report_import(p_import uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.report_imports;
  item jsonb;
  new_report_id uuid;
  expected integer;
  inserted integer;
  v_result jsonb;
  failure text;
begin
  select * into run from public.report_imports where id = p_import;
  if not found
    or run.report_type <> 'stock'
    or not public.can_access_store(run.store_id)
    or (run.actor_id <> auth.uid() and not public.is_owner())
  then
    raise exception 'Stock import unavailable';
  end if;

  if run.status = 'processed' then return run.result; end if;
  if run.status <> 'processing' then
    return jsonb_build_object('ok', false, 'message', 'Retry this import before committing.');
  end if;
  if run.mode <> 'stop' or run.is_bulk or jsonb_array_length(run.manifest) <> 1 then
    raise exception 'Stock import mode unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(run.store_id::text || 'stock', 0));
  select * into run from public.report_imports where id = p_import for update;
  if run.status = 'processed' then return run.result; end if;
  if run.status <> 'processing' then
    return jsonb_build_object('ok', false, 'message', 'Retry this import before committing.');
  end if;

  begin
    item := run.manifest->0;
    expected := (item->>'row_count')::integer;

    if not exists (
      select 1 from storage.objects
      where bucket_id = 'reports' and name = run.file_path
    ) then
      raise exception 'Original source upload is missing';
    end if;

    if coalesce((
      select sum(jsonb_array_length(chunks.rows))
      from public.report_import_chunks chunks
      where chunks.import_id = run.id
    ), 0) <> expected then
      raise exception 'Incomplete staged row count';
    end if;

    if exists (
      select 1
      from public.report_import_chunks chunks
      cross join lateral jsonb_array_elements(chunks.rows) staged(value)
      where chunks.import_id = run.id
        and staged.value->>'logical_date' <> item->>'date'
    ) then
      raise exception 'Row outside manifest';
    end if;

    if exists (
      select 1 from public.reports reports
      where reports.store_id = run.store_id
        and reports.report_type = 'stock'
        and reports.period_month = (item->>'date')::date
        and reports.is_current
    ) then
      raise exception 'An active report already exists. Use owner correction.';
    end if;

    insert into public.reports(
      store_id, uploaded_by, report_type, report_date, period_month,
      file_name, file_path, status, row_count, summary, is_current, import_id
    ) values (
      run.store_id, auth.uid(), 'stock',
      (now() at time zone 'Asia/Kolkata')::date, (item->>'date')::date,
      run.file_name, run.file_path, 'processing', 0,
      coalesce(item->'summary', '{}'::jsonb) - 'recovery_sources', false, run.id
    ) returning id into new_report_id;

    insert into public.stock_rows(
      report_id, store_id, stock_month, item_name, sku, barcode, brand,
      category, size, color, quantity, mrp, cost_price, supplier,
      purchase_date, ageing_days, raw_data
    )
    select
      new_report_id, run.store_id, (item->>'date')::date,
      staged.item_name, staged.sku, staged.barcode, staged.brand,
      staged.category, staged.size, staged.color, staged.quantity,
      staged.mrp, staged.cost_price, staged.supplier,
      staged.purchase_date, staged.ageing_days, staged.raw_data
    from public.report_import_chunks chunks
    cross join lateral jsonb_populate_recordset(null::public.stock_rows, chunks.rows) staged
    where chunks.import_id = run.id;

    get diagnostics inserted = row_count;
    if inserted <> expected then raise exception 'Daily row count mismatch'; end if;

    update public.reports
    set is_current = true, status = 'processed', row_count = inserted
    where id = new_report_id;

    insert into public.audit_logs(
      actor_id, actor_role, entity_type, entity_id, store_id,
      report_date, action, metadata
    ) values (
      auth.uid(), case when public.is_owner() then 'owner' else 'manager' end,
      'report', new_report_id, run.store_id, (item->>'date')::date,
      'report_imported',
      jsonb_build_object(
        'import_id', run.id, 'previous_report_id', null,
        'new_file_path', run.file_path, 'recovery_sources', '[]'::jsonb,
        'source_retained', true
      )
    );

    v_result := jsonb_build_object(
      'ok', true, 'report_ids', jsonb_build_array(new_report_id),
      'batch_id', null,
      'message', 'Import processed. Original evidence retained.'
    );
    update public.report_imports
    set status = 'processed', failure_message = null, result = v_result
    where id = run.id;
    return v_result;
  exception when others then
    failure := case when sqlerrm in (
      'Original source upload is missing', 'Incomplete staged row count',
      'Row outside manifest',
      'An active report already exists. Use owner correction.',
      'Daily row count mismatch'
    ) then sqlerrm || ' No partial report was published.'
    else 'Import failed; no partial report was published. Retry the same file or review the current version.' end;
    update public.report_imports set status = 'failed', failure_message = failure where id = run.id;
    return jsonb_build_object('ok', false, 'message', failure);
  end;
end;
$$;

revoke all on function public.commit_stock_report_import(uuid) from public, anon;
grant execute on function public.commit_stock_report_import(uuid) to authenticated, service_role;

comment on function public.commit_stock_report_import(uuid)
  is 'Atomically finalizes one authorized stock snapshot using a direct bounded staged-chunk insert.';

commit;

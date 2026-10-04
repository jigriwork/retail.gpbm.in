-- Go Planet's October stock file (50,073 rows) failed three times with
-- "Import interrupted": the single publish statement ran past the 8-second
-- limit on signed-in requests (57014). Accounts phase 1 had added a per-row
-- trigger to stock_rows, and the file has doubled since June.
--
-- Publishing now runs in parts of up to 10 staged chunks (10,000 rows), each
-- its own short request, into a hidden report (is_current = false; every
-- reader uses current reports only). commit_stock_report_import then checks
-- the row count and makes it current in one step. A failed part leaves the
-- earlier parts in place, so retrying the same file resumes where it stopped.
-- The platform statement limit is unchanged.
begin;

alter table public.report_imports add column publish_report_id uuid references public.reports(id);
alter table public.report_import_chunks add column published_at timestamptz;

-- The publisher computes the derived columns for a whole part at once and
-- sets this flag, so the per-row trigger is skipped for its inserts only.
-- (Signed-in users cannot insert stock rows directly.)
drop trigger stock_rows_derive_fields on public.stock_rows;
create trigger stock_rows_derive_fields before insert or update of raw_data on public.stock_rows
  for each row when (current_setting('app.stock_rows_derived', true) is distinct from 'on')
  execute function public.stock_rows_derive_fields();

-- Inserts the given staged chunks of a stock import into a report, with the
-- fields stock_rows_derive_fields would set (same rules as finance_num).
create function public.insert_staged_stock_rows(p_import uuid, p_report uuid, p_store uuid, p_month date, p_chunks integer[])
returns integer language plpgsql security definer set search_path = '' as $$
declare inserted integer;
begin
  perform set_config('app.stock_rows_derived', 'on', true);
  insert into public.stock_rows(
    report_id, store_id, stock_month, item_name, sku, barcode, brand,
    category, size, color, quantity, mrp, cost_price, supplier,
    purchase_date, ageing_days, raw_data,
    purchase_rate, basic_rate, hsn_code, lot_code, lot_number, article_code
  )
  select
    p_report, p_store, p_month,
    staged.item_name, staged.sku, staged.barcode, staged.brand,
    staged.category, staged.size, staged.color, staged.quantity,
    staged.mrp, staged.cost_price, staged.supplier,
    staged.purchase_date, staged.ageing_days, staged.raw_data,
    case when n.pr ~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' then n.pr::numeric end,
    case when n.br ~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' then n.br::numeric end,
    nullif(btrim(staged.raw_data->>'HSN CODE'), ''),
    nullif(btrim(staged.raw_data->>'LOT CODE'), ''),
    nullif(btrim(staged.raw_data->>'LOT NUMBER'), ''),
    nullif(btrim(staged.raw_data->>'ADDITIONAL ITEM CODE'), '')
  from public.report_import_chunks chunks
  cross join lateral jsonb_populate_recordset(null::public.stock_rows, chunks.rows) staged
  cross join lateral (select
    regexp_replace(coalesce(staged.raw_data->>'PURCHASE RATE', ''), '[,[:space:]₹]', '', 'g') as pr,
    regexp_replace(coalesce(staged.raw_data->>'BASIC RATE', ''), '[,[:space:]₹]', '', 'g') as br) n
  where chunks.import_id = p_import and chunks.chunk_no = any(p_chunks);
  get diagnostics inserted = row_count;
  perform set_config('app.stock_rows_derived', 'off', true);
  return inserted;
end $$;
revoke all on function public.insert_staged_stock_rows(uuid, uuid, uuid, date, integer[]) from public, anon, authenticated;

-- Publishes the next part (up to 10 chunks) of an authorized stock import
-- into its hidden report. Returns {ok, remaining}; call until remaining = 0,
-- then commit_stock_report_import.
create function public.publish_stock_import_part(p_import uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  run public.report_imports;
  item jsonb;
  expected integer;
  v_report uuid;
  v_chunks integer[];
  remaining integer;
  failure text;
begin
  select * into run from public.report_imports where id = p_import;
  if not found or run.report_type <> 'stock' or not public.can_access_store(run.store_id)
     or (run.actor_id <> auth.uid() and not public.is_owner()) then
    raise exception 'Stock import unavailable';
  end if;
  if run.status = 'processed' then return jsonb_build_object('ok', true, 'remaining', 0); end if;
  if run.status <> 'processing' then
    return jsonb_build_object('ok', false, 'message', 'Retry this import before publishing.');
  end if;
  if run.mode <> 'stop' or run.is_bulk or jsonb_array_length(run.manifest) <> 1 then
    raise exception 'Stock import mode unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(run.store_id::text || 'stock', 0));
  select * into run from public.report_imports where id = p_import for update;
  if run.status = 'processed' then return jsonb_build_object('ok', true, 'remaining', 0); end if;
  if run.status <> 'processing' then
    return jsonb_build_object('ok', false, 'message', 'Retry this import before publishing.');
  end if;

  begin
    item := run.manifest->0;
    expected := (item->>'row_count')::integer;
    v_report := run.publish_report_id;

    if v_report is null then
      -- First part: check the whole staged upload once.
      if not exists (select 1 from storage.objects where bucket_id = 'reports' and name = run.file_path) then
        raise exception 'Original source upload is missing';
      end if;
      if coalesce((select sum(jsonb_array_length(c.rows)) from public.report_import_chunks c where c.import_id = run.id), 0) <> expected then
        raise exception 'Incomplete staged row count';
      end if;
      if exists (
        select 1 from public.reports r
        where r.store_id = run.store_id and r.report_type = 'stock'
          and r.period_month = (item->>'date')::date and r.is_current
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
      ) returning id into v_report;
      update public.report_imports set publish_report_id = v_report where id = run.id;
    end if;

    select array_agg(c.chunk_no order by c.chunk_no) into v_chunks
    from (select chunk_no from public.report_import_chunks
          where import_id = run.id and published_at is null
          order by chunk_no limit 10) c;

    if v_chunks is not null then
      if exists (
        select 1 from public.report_import_chunks c
        cross join lateral jsonb_array_elements(c.rows) staged(value)
        where c.import_id = run.id and c.chunk_no = any(v_chunks)
          and staged.value->>'logical_date' <> item->>'date'
      ) then
        raise exception 'Row outside manifest';
      end if;
      perform public.insert_staged_stock_rows(run.id, v_report, run.store_id, (item->>'date')::date, v_chunks);
      update public.report_import_chunks set published_at = now()
      where import_id = run.id and chunk_no = any(v_chunks);
    end if;

    select count(*) into remaining from public.report_import_chunks
    where import_id = run.id and published_at is null;
    return jsonb_build_object('ok', true, 'remaining', remaining);
  exception when others then
    failure := case when sqlerrm in (
      'Original source upload is missing', 'Incomplete staged row count', 'Row outside manifest',
      'An active report already exists. Use owner correction.'
    ) then sqlerrm || ' No partial report was published.'
    else null end;
    if failure is null then raise; end if;
    update public.report_imports set status = 'failed', failure_message = failure where id = run.id;
    return jsonb_build_object('ok', false, 'message', failure);
  end;
end $$;
revoke all on function public.publish_stock_import_part(uuid) from public, anon;
grant execute on function public.publish_stock_import_part(uuid) to authenticated, service_role;

-- Final step. After publish_stock_import_part it only checks the hidden
-- report and makes it current; without parts it publishes in one go, as
-- before (small files, and requests from the previous app version).
create or replace function public.commit_stock_report_import(p_import uuid)
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

    if exists (
      select 1 from public.reports reports
      where reports.store_id = run.store_id
        and reports.report_type = 'stock'
        and reports.period_month = (item->>'date')::date
        and reports.is_current
    ) then
      raise exception 'An active report already exists. Use owner correction.';
    end if;

    if run.publish_report_id is not null then
      if exists (select 1 from public.report_import_chunks c where c.import_id = run.id and c.published_at is null) then
        return jsonb_build_object('ok', false, 'message', 'Publishing is not finished. Retry the same file to resume safely.');
      end if;
      new_report_id := run.publish_report_id;
      select count(*) into inserted from public.stock_rows where report_id = new_report_id;
    else
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

      insert into public.reports(
        store_id, uploaded_by, report_type, report_date, period_month,
        file_name, file_path, status, row_count, summary, is_current, import_id
      ) values (
        run.store_id, auth.uid(), 'stock',
        (now() at time zone 'Asia/Kolkata')::date, (item->>'date')::date,
        run.file_name, run.file_path, 'processing', 0,
        coalesce(item->'summary', '{}'::jsonb) - 'recovery_sources', false, run.id
      ) returning id into new_report_id;

      inserted := public.insert_staged_stock_rows(run.id, new_report_id, run.store_id, (item->>'date')::date,
        array(select chunk_no from public.report_import_chunks where import_id = run.id));
    end if;

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
        'source_retained', true, 'published_in_parts', run.publish_report_id is not null
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

comment on function public.commit_stock_report_import(uuid)
  is 'Finalizes one authorized stock snapshot: makes the report published in parts current, or publishes small imports in one step.';

commit;

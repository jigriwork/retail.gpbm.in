-- Weekly stock uploads. Stock was one report per month (a second upload was
-- refused); stock changes daily, so it is now uploaded weekly (any day):
-- - the person picks the stock date (the day the file is up to); the report
--   date is that date, so "sold since" starts from it;
-- - a newer stock of the same month replaces the current one, which is kept
--   as history; an older file than the current stock is refused;
-- - the daily checklist shows the latest stock date (pending after 7 days).
begin;

create or replace function public.publish_stock_import_part(p_import uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  run public.report_imports;
  item jsonb;
  expected integer;
  v_report uuid;
  v_chunks integer[];
  remaining integer;
  failure text;
  v_date date;
  v_old public.reports;
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
      -- Weekly stock: the stock date is the day the file is up to; a newer
      -- stock of the same month replaces the current one (kept as history).
      -- Without a stock date (older app) the upload day is used, as before.
      v_date := coalesce(nullif(item->>'stock_date', '')::date, public.india_today());
      if item->>'stock_date' is not null
         and (v_date > public.india_today() or date_trunc('month', v_date)::date <> (item->>'date')::date) then
        raise exception 'The stock date must be today or earlier, in the chosen month.';
      end if;
      select * into v_old from public.reports r
      where r.store_id = run.store_id and r.report_type = 'stock'
        and r.period_month = (item->>'date')::date and r.is_current;
      if v_old.id is not null and v_old.report_date > v_date then
        raise exception 'A newer stock (%) is already uploaded for this store. Upload a stock file of that day or later.', to_char(v_old.report_date, 'DD Mon');
      end if;
      insert into public.reports(
        store_id, uploaded_by, report_type, report_date, period_month,
        file_name, file_path, status, row_count, summary, is_current, import_id, replaces_report_id
      ) values (
        run.store_id, auth.uid(), 'stock',
        v_date, (item->>'date')::date,
        run.file_name, run.file_path, 'processing', 0,
        coalesce(item->'summary', '{}'::jsonb) - 'recovery_sources', false, run.id, v_old.id
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
      'Original source upload is missing', 'Incomplete staged row count', 'Row outside manifest'
    ) or sqlerrm like 'A newer stock%' or sqlerrm like 'The stock date%' then sqlerrm || ' No partial report was published.'
    else null end;
    if failure is null then raise; end if;
    update public.report_imports set status = 'failed', failure_message = failure where id = run.id;
    return jsonb_build_object('ok', false, 'message', failure);
  end;
end $$;
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
  v_date date;
  v_old public.reports;
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

    v_date := coalesce(nullif(item->>'stock_date', '')::date, public.india_today());
    if item->>'stock_date' is not null
       and (v_date > public.india_today() or date_trunc('month', v_date)::date <> (item->>'date')::date) then
      raise exception 'The stock date must be today or earlier, in the chosen month.';
    end if;
    select * into v_old from public.reports r
    where r.store_id = run.store_id and r.report_type = 'stock'
      and r.period_month = (item->>'date')::date and r.is_current
      and r.id is distinct from run.publish_report_id;

    if run.publish_report_id is not null then
      if exists (select 1 from public.report_import_chunks c where c.import_id = run.id and c.published_at is null) then
        return jsonb_build_object('ok', false, 'message', 'Publishing is not finished. Retry the same file to resume safely.');
      end if;
      new_report_id := run.publish_report_id;
      select report_date into v_date from public.reports where id = new_report_id;
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
        file_name, file_path, status, row_count, summary, is_current, import_id, replaces_report_id
      ) values (
        run.store_id, auth.uid(), 'stock',
        v_date, (item->>'date')::date,
        run.file_name, run.file_path, 'processing', 0,
        coalesce(item->'summary', '{}'::jsonb) - 'recovery_sources', false, run.id, v_old.id
      ) returning id into new_report_id;

      inserted := public.insert_staged_stock_rows(run.id, new_report_id, run.store_id, (item->>'date')::date,
        array(select chunk_no from public.report_import_chunks where import_id = run.id));
    end if;

    if inserted <> expected then raise exception 'Daily row count mismatch'; end if;
    if v_old.id is not null and v_old.report_date > v_date then
      raise exception 'A newer stock (%) is already uploaded for this store. Upload a stock file of that day or later.', to_char(v_old.report_date, 'DD Mon');
    end if;

    -- The earlier stock of the month stays as history; the new one is current.
    if v_old.id is not null then
      update public.reports set is_current = false where id = v_old.id;
    end if;
    update public.reports
    set is_current = true, status = 'processed', row_count = inserted, replaces_report_id = v_old.id
    where id = new_report_id;

    insert into public.audit_logs(
      actor_id, actor_role, entity_type, entity_id, store_id,
      report_date, action, metadata
    ) values (
      auth.uid(), case when public.is_owner() then 'owner' else 'manager' end,
      'report', new_report_id, run.store_id, (item->>'date')::date,
      'report_imported',
      jsonb_build_object(
        'import_id', run.id, 'previous_report_id', v_old.id, 'stock_date', v_date,
        'new_file_path', run.file_path, 'recovery_sources', '[]'::jsonb,
        'source_retained', true, 'published_in_parts', run.publish_report_id is not null
      )
    );

    v_result := jsonb_build_object(
      'ok', true, 'report_ids', jsonb_build_array(new_report_id),
      'batch_id', null,
      'message', case when v_old.id is null then 'Import processed. Original evidence retained.'
        else 'Stock of ' || to_char(v_date, 'DD Mon') || ' uploaded; it replaces the stock of ' || to_char(v_old.report_date, 'DD Mon') || ' (kept as history).' end
    );
    update public.report_imports
    set status = 'processed', failure_message = null, result = v_result
    where id = run.id;
    return v_result;
  exception when others then
    failure := case when sqlerrm in (
      'Original source upload is missing', 'Incomplete staged row count',
      'Row outside manifest', 'Daily row count mismatch'
    ) or sqlerrm like 'A newer stock%' or sqlerrm like 'The stock date%' then sqlerrm || ' No partial report was published.'
    else 'Import failed; no partial report was published. Retry the same file or review the current version.' end;
    update public.report_imports set status = 'failed', failure_message = failure where id = run.id;
    return jsonb_build_object('ok', false, 'message', failure);
  end;
end;
$$;

create or replace function public.store_checklist(p_store uuid, p_days integer default 30) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not coalesce(public.can_work_store(p_store), false) then null else jsonb_build_object(
    'cash_start', (select start_date from public.cash_book_starts where store_id = p_store),
    -- Weekly stock: the latest stock date (the checklist flags it after 7 days).
    'stock_date', (select max(report_date) from public.reports r where r.store_id = p_store and r.report_type = 'stock' and r.is_current and r.status = 'processed'),
    'tasks_due', (select count(*) from public.tasks t where t.store_id = p_store and t.status = 'pending'
      and t.due_date <= public.india_today() and not coalesce(t.is_private, false)),
    'days', (
      select jsonb_agg(jsonb_build_object(
        'day', g.day,
        'report', case
          when r.first_at is null then 'missing'
          when not exists (select 1 from public.sales_rows x join public.reports rr on rr.id = x.report_id and rr.is_current
                           where rr.store_id = p_store and rr.report_type = 'sales' and rr.report_date = g.day and x.line_kind = 'item') then 'summary_only'
          when r.first_at <= ((g.day + 1) + time '12:00') at time zone 'Asia/Kolkata' then 'on_time'
          else 'late' end,
        'cash', coalesce((select status from public.cash_book_days c where c.store_id = p_store and c.book_date = g.day), 'not_done')
      ) order by g.day desc)
      from (select gs::date as day from generate_series(public.india_today() - greatest(1, least(p_days, 60)), public.india_today() - 1, interval '1 day') gs) g
      left join lateral (
        select min(rp.created_at) as first_at from public.reports rp
        where rp.store_id = p_store and rp.report_type = 'sales' and rp.report_date = g.day and rp.status = 'processed') r on true)
  ) end
$$;


-- Count totals: expected pieces for the owner and managers (a cashier counts
-- blind and gets null), counted pieces and the number of items for everyone.
create or replace function public.stock_count_totals(p_count uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'items', count(*),
    'expected', case when public.is_cashier() then null else sum(l.expected_qty) end,
    'counted', coalesce(sum(l.counted_qty), 0),
    'snapshot_date', c.snapshot_date)
  from public.stock_counts c join public.stock_count_lines l on l.count_id = c.id
  where c.id = p_count and coalesce(public.can_work_store(c.store_id), false)
  group by c.id, c.snapshot_date
$$;
revoke all on function public.stock_count_totals(uuid) from public, anon;
grant execute on function public.stock_count_totals(uuid) to authenticated;

-- Delete a stock count started by mistake or twice. Counts still being
-- counted: owner, manager or cashier of the store. Submitted or reviewed
-- counts are a record of what was found: owner only. Every delete is logged.
create or replace function public.delete_stock_count(p_count uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_count public.stock_counts; v_lines integer;
begin
  select * into v_count from public.stock_counts where id = p_count for update;
  if v_count.id is null or not coalesce(public.can_work_store(v_count.store_id), false) then raise exception 'Count not found.'; end if;
  if v_count.status <> 'counting' and not public.is_owner() then
    raise exception 'Only the owner can delete a submitted count.';
  end if;
  select count(*) into v_lines from public.stock_count_lines where count_id = p_count;
  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, store_id, metadata)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), 'stock_count_deleted', 'stock_count', p_count, v_count.store_id,
    jsonb_build_object('title', v_count.title, 'status', v_count.status, 'lines', v_lines,
      'counted', (select coalesce(sum(counted_qty), 0) from public.stock_count_lines where count_id = p_count)));
  delete from public.stock_count_lines where count_id = p_count;
  delete from public.stock_counts where id = p_count;
end $$;
revoke all on function public.delete_stock_count(uuid) from public, anon;
grant execute on function public.delete_stock_count(uuid) to authenticated;

commit;

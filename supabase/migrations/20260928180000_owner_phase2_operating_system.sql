-- Phase 2 owner operating system: weekly business reviews, decision log,
-- practical SOPs and recommendation follow-up.
-- Local migration only until explicitly deployed. Must run after
-- 20260928120000_owner_notes_phase1.sql.
--
-- Additive: creates new tables, functions, triggers and policies only. No
-- existing table, column, policy, function or business row is changed. Sales,
-- stock, payroll, billing and task history are read, never rewritten.
begin;

-- ---------------------------------------------------------------------------
-- 1. Recommendation follow-up (append-only history; the latest row per key
--    governs whether a daily priority or Secretary recommendation resurfaces).
-- ---------------------------------------------------------------------------
create table if not exists public.recommendation_followups (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('daily_priority', 'secretary')),
  recommendation_key text not null check (char_length(recommendation_key) between 1 and 160),
  title text not null check (char_length(title) between 1 and 160),
  evidence_text text not null default '' check (char_length(evidence_text) <= 1500),
  signal jsonb not null default '{}'::jsonb check (jsonb_typeof(signal) = 'object' and octet_length(signal::text) <= 4000),
  status text not null check (status in ('accepted', 'converted', 'dismissed', 'reviewed')),
  reason text not null default '' check (char_length(reason) <= 600),
  outcome text not null default '' check (char_length(outcome) <= 600),
  task_id uuid references public.tasks(id) on delete set null,
  -- Private Secretary message id. Only the owner-approved snapshot above is shared.
  source_chat_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (status <> 'dismissed' or char_length(btrim(reason)) > 0),
  check (status <> 'reviewed' or char_length(btrim(outcome)) > 0),
  check (source <> 'secretary' or source_chat_id is not null)
);

create index if not exists recommendation_followups_key_created_idx
  on public.recommendation_followups (recommendation_key, created_at desc);
create index if not exists recommendation_followups_created_idx
  on public.recommendation_followups (created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Decision log
-- ---------------------------------------------------------------------------
create table if not exists public.business_decisions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 140),
  kind text not null check (kind in (
    'staff_placement', 'display', 'customer_follow_up', 'assortment', 'pricing_offer', 'operations', 'other'
  )),
  -- null means both stores / the whole business.
  store_id uuid references public.stores(id),
  brand text check (brand is null or char_length(brand) <= 80),
  hypothesis text not null check (char_length(hypothesis) between 1 and 800),
  responsible_profile_id uuid references public.profiles(id),
  responsible_name text not null default '' check (char_length(responsible_name) <= 80),
  start_date date not null,
  review_date date not null,
  measure_type text not null check (measure_type in (
    'store_net_sales', 'store_bills', 'store_average_bill', 'brand_net_sales', 'category_net_sales', 'observation'
  )),
  measure_filter text check (measure_filter is null or char_length(measure_filter) <= 80),
  success_measure text not null check (char_length(success_measure) between 1 and 400),
  status text not null default 'planned' check (status in ('planned', 'active', 'reviewed', 'cancelled')),
  result text check (result in ('worked', 'did_not_work', 'mixed', 'inconclusive')),
  evidence_basis text check (evidence_basis in ('data', 'observation')),
  evidence jsonb,
  result_note text not null default '' check (char_length(result_note) <= 1000),
  learned text not null default '' check (char_length(learned) <= 1000),
  task_id uuid references public.tasks(id) on delete set null,
  followup_id uuid references public.recommendation_followups(id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (review_date >= start_date),
  check (
    measure_type not in ('brand_net_sales', 'category_net_sales')
    or char_length(btrim(coalesce(measure_filter, ''))) > 0
  ),
  check ((status = 'reviewed') = (result is not null and reviewed_at is not null)),
  -- A decision may be recorded as having worked only when the selected sales
  -- measure showed a clear improvement, or when it is an explicit owner
  -- observation with a written note.
  check (
    result is distinct from 'worked'
    or (evidence_basis = 'data' and evidence ->> 'verdict' = 'improved')
    or (evidence_basis = 'observation' and char_length(btrim(result_note)) > 0)
  )
);

comment on column public.business_decisions.result is
  'Owner judgement of what happened. Measured sales are stored separately in evidence (verdict), which describes sales movement, not cause.';
comment on column public.business_decisions.evidence is
  'Measured sales at review time: dates, coverage, change and verdict. Not proof that the decision caused the change.';

create unique index if not exists business_decisions_followup_uidx
  on public.business_decisions (followup_id) where followup_id is not null;
create index if not exists business_decisions_status_review_idx
  on public.business_decisions (status, review_date);

-- ---------------------------------------------------------------------------
-- 3. Weekly business reviews (one per Monday-Sunday week, retained)
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique check (extract(isodow from week_start) = 1),
  week_end date not null,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) <= 200000),
  evidence_generated_at timestamptz,
  conclusion text not null default '' check (char_length(conclusion) <= 1500),
  next_week_decisions text not null default '' check (char_length(next_week_decisions) <= 800),
  status text not null default 'draft' check (status in ('draft', 'completed')),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (week_end = week_start + 6),
  check ((status = 'completed') = (completed_at is not null))
);

-- ---------------------------------------------------------------------------
-- 4. Practical SOPs (managers read only their store's active SOPs)
-- ---------------------------------------------------------------------------
create or replace function public.sop_steps_valid(p_steps jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_steps) = 'array'
    and jsonb_array_length(p_steps) between 1 and 12
    and not exists (
      select 1
      from jsonb_array_elements(p_steps) step
      where jsonb_typeof(step) <> 'object'
        or jsonb_typeof(step -> 'text') is distinct from 'string'
        or char_length(btrim(step ->> 'text')) not between 1 and 300
        or (
          step ? 'href'
          and step -> 'href' <> 'null'::jsonb
          and coalesce(step ->> 'href', '') !~ '^/app/[a-z0-9/_-]{1,80}$'
        )
    );
$$;

create table if not exists public.sops (
  id uuid primary key default gen_random_uuid(),
  sop_key text not null check (sop_key ~ '^[a-z0-9-]{2,40}$'),
  -- null means the SOP applies to every store.
  store_id uuid references public.stores(id),
  title text not null check (char_length(title) between 1 and 80),
  purpose text not null default '' check (char_length(purpose) <= 300),
  when_to_use text not null default '' check (char_length(when_to_use) <= 200),
  steps jsonb not null check (public.sop_steps_valid(steps)),
  escalate_when text not null default '' check (char_length(escalate_when) <= 600),
  exception_category text not null default 'Owner attention needed' check (char_length(exception_category) between 1 and 60),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  version integer not null default 1,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (sop_key, store_id)
);

create table if not exists public.sop_revisions (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references public.sops(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now(),
  unique (sop_id, version)
);

create or replace function public.record_sop_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.title, new.purpose, new.when_to_use, new.steps, new.escalate_when,
      new.exception_category, new.store_id, new.is_active, new.sort_order)
     is distinct from
     (old.title, old.purpose, old.when_to_use, old.steps, old.escalate_when,
      old.exception_category, old.store_id, old.is_active, old.sort_order) then
    insert into public.sop_revisions (sop_id, version, snapshot, changed_by)
    values (
      old.id,
      old.version,
      jsonb_build_object(
        'title', old.title, 'purpose', old.purpose, 'when_to_use', old.when_to_use,
        'steps', old.steps, 'escalate_when', old.escalate_when,
        'exception_category', old.exception_category, 'store_id', old.store_id,
        'is_active', old.is_active, 'sort_order', old.sort_order
      ),
      auth.uid()
    )
    on conflict (sop_id, version) do nothing;
    new.version = old.version + 1;
  else
    new.version = old.version;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists set_business_decisions_updated_at on public.business_decisions;
create trigger set_business_decisions_updated_at
  before update on public.business_decisions
  for each row execute function public.set_updated_at();

drop trigger if exists set_weekly_reviews_updated_at on public.weekly_reviews;
create trigger set_weekly_reviews_updated_at
  before update on public.weekly_reviews
  for each row execute function public.set_updated_at();

drop trigger if exists set_sops_updated_at on public.sops;
create trigger set_sops_updated_at
  before update on public.sops
  for each row execute function public.set_updated_at();

drop trigger if exists record_sops_revision on public.sops;
create trigger record_sops_revision
  before update on public.sops
  for each row execute function public.record_sop_revision();

-- Results, evidence and review metadata may only be written by
-- review_business_decision(), which computes the evidence itself.
create or replace function public.guard_business_decision_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('gpbm.decision_review', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'reviewed' or new.result is not null or new.evidence is not null
       or new.evidence_basis is not null or new.reviewed_at is not null
       or new.reviewed_by is not null or char_length(new.result_note) > 0 then
      raise exception 'Record a decision result through the review step';
    end if;
    return new;
  end if;

  if new.result is distinct from old.result
     or new.evidence is distinct from old.evidence
     or new.evidence_basis is distinct from old.evidence_basis
     or new.result_note is distinct from old.result_note
     or new.reviewed_at is distinct from old.reviewed_at
     or new.reviewed_by is distinct from old.reviewed_by
     or (new.status = 'reviewed') <> (old.status = 'reviewed') then
    raise exception 'Decision results can only be changed through the review step';
  end if;

  if old.status = 'reviewed' and (
       new.measure_type, new.measure_filter, new.store_id, new.start_date, new.review_date
     ) is distinct from (
       old.measure_type, old.measure_filter, old.store_id, old.start_date, old.review_date
     ) then
    raise exception 'A reviewed decision keeps the measure and dates it was judged on';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_business_decision_review on public.business_decisions;
create trigger guard_business_decision_review
  before insert or update on public.business_decisions
  for each row execute function public.guard_business_decision_review();

-- A completed weekly review keeps the evidence it was concluded on.
create or replace function public.guard_weekly_review_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'completed' and new.status = 'completed'
     and (new.evidence is distinct from old.evidence
          or new.evidence_generated_at is distinct from old.evidence_generated_at) then
    raise exception 'Reopen the weekly review before refreshing its evidence';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_weekly_review_evidence on public.weekly_reviews;
create trigger guard_weekly_review_evidence
  before update on public.weekly_reviews
  for each row execute function public.guard_weekly_review_evidence();

-- ---------------------------------------------------------------------------
-- 6. Row-level security
-- ---------------------------------------------------------------------------
alter table public.recommendation_followups enable row level security;
alter table public.business_decisions enable row level security;
alter table public.weekly_reviews enable row level security;
alter table public.sops enable row level security;
alter table public.sop_revisions enable row level security;

revoke all on public.recommendation_followups, public.business_decisions, public.weekly_reviews,
  public.sops, public.sop_revisions from anon, authenticated;
-- No delete grant anywhere: history is retained; SOPs are deactivated instead.
grant select, insert on public.recommendation_followups to authenticated;
grant select, insert, update on public.business_decisions to authenticated;
grant select, insert, update on public.weekly_reviews to authenticated;
grant select, insert, update on public.sops to authenticated;
grant select on public.sop_revisions to authenticated;

do $$
declare
  target text;
begin
  foreach target in array array['recommendation_followups', 'business_decisions', 'weekly_reviews', 'sops', 'sop_revisions'] loop
    execute format('drop policy if exists %I on public.%I', target || '_active_required', target);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.is_active_user()) with check (public.is_active_user())',
      target || '_active_required', target
    );
  end loop;
end;
$$;

-- Recommendation follow-ups: shared between active owners only.
drop policy if exists recommendation_followups_owner_select on public.recommendation_followups;
create policy recommendation_followups_owner_select
on public.recommendation_followups for select to authenticated
using (public.is_owner());

drop policy if exists recommendation_followups_owner_insert on public.recommendation_followups;
create policy recommendation_followups_owner_insert
on public.recommendation_followups for insert to authenticated
with check (
  public.is_owner()
  and created_by = auth.uid()
  and (
    source_chat_id is null
    or exists (
      select 1 from public.ai_chats chats
      where chats.id = source_chat_id and chats.user_id = auth.uid()
    )
  )
);

-- Decisions: shared between active owners only.
drop policy if exists business_decisions_owner_select on public.business_decisions;
create policy business_decisions_owner_select
on public.business_decisions for select to authenticated
using (public.is_owner());

drop policy if exists business_decisions_owner_insert on public.business_decisions;
create policy business_decisions_owner_insert
on public.business_decisions for insert to authenticated
with check (public.is_owner() and created_by = auth.uid() and updated_by = auth.uid());

drop policy if exists business_decisions_owner_update on public.business_decisions;
create policy business_decisions_owner_update
on public.business_decisions for update to authenticated
using (public.is_owner())
with check (public.is_owner() and updated_by = auth.uid());

-- Weekly reviews: shared between active owners only.
drop policy if exists weekly_reviews_owner_select on public.weekly_reviews;
create policy weekly_reviews_owner_select
on public.weekly_reviews for select to authenticated
using (public.is_owner());

drop policy if exists weekly_reviews_owner_insert on public.weekly_reviews;
create policy weekly_reviews_owner_insert
on public.weekly_reviews for insert to authenticated
with check (public.is_owner() and created_by = auth.uid() and updated_by = auth.uid());

drop policy if exists weekly_reviews_owner_update on public.weekly_reviews;
create policy weekly_reviews_owner_update
on public.weekly_reviews for update to authenticated
using (public.is_owner())
with check (public.is_owner() and updated_by = auth.uid());

-- SOPs: owners manage; active managers read active SOPs for their assigned
-- stores. user_store_ids() already requires an active manager profile and an
-- active store, so staff accounts receive nothing.
drop policy if exists sops_owner_select on public.sops;
create policy sops_owner_select
on public.sops for select to authenticated
using (public.is_owner());

drop policy if exists sops_manager_select_assigned on public.sops;
create policy sops_manager_select_assigned
on public.sops for select to authenticated
using (
  is_active
  and (store_id is null or store_id in (select public.user_store_ids()))
  and exists (select 1 from public.user_store_ids())
);

drop policy if exists sops_owner_insert on public.sops;
create policy sops_owner_insert
on public.sops for insert to authenticated
with check (public.is_owner() and created_by = auth.uid() and updated_by = auth.uid());

drop policy if exists sops_owner_update on public.sops;
create policy sops_owner_update
on public.sops for update to authenticated
using (public.is_owner())
with check (public.is_owner() and updated_by = auth.uid());

drop policy if exists sop_revisions_owner_select on public.sop_revisions;
create policy sop_revisions_owner_select
on public.sop_revisions for select to authenticated
using (public.is_owner());

-- ---------------------------------------------------------------------------
-- 7. Decision evidence (computed in the database so a result cannot be
--    recorded against evidence the data does not support)
-- ---------------------------------------------------------------------------
create or replace function public.decision_measure_window(
  p_store_ids uuid[],
  p_measure text,
  p_filter text,
  p_start date,
  p_end date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select
      rows.store_id,
      rows.sale_date,
      nullif(btrim(rows.bill_no), '') as bill_no,
      coalesce(rows.net_sale, 0)::numeric as net_sale,
      lower(btrim(coalesce(rows.brand, ''))) as brand,
      lower(btrim(coalesce(rows.category, ''))) as category
    from public.sales_rows rows
    join public.reports reports on reports.id = rows.report_id
    where rows.store_id = any(p_store_ids)
      and rows.sale_date between p_start and p_end
      and reports.report_type = 'sales'
      and reports.status = 'processed'
      and reports.is_current
  ),
  covered as (
    select count(*)::integer as store_days
    from (select store_id, sale_date from base group by store_id, sale_date) days
  ),
  all_bills as (
    select count(distinct (store_id, sale_date, bill_no)) filter (where bill_no is not null)::integer as bills,
      coalesce(sum(net_sale), 0)::numeric as net_sale
    from base
  ),
  filtered as (
    select * from base
    where case p_measure
      when 'brand_net_sales' then brand = lower(btrim(coalesce(p_filter, '')))
      when 'category_net_sales' then category = lower(btrim(coalesce(p_filter, '')))
      else true
    end
  ),
  measured as (
    select coalesce(sum(net_sale), 0)::numeric as net_sale,
      count(distinct (store_id, sale_date, bill_no)) filter (where bill_no is not null)::integer as bills
    from filtered
  )
  select jsonb_build_object(
    'start', p_start,
    'end', p_end,
    'days', (p_end - p_start + 1),
    'expected_store_days', (p_end - p_start + 1) * cardinality(p_store_ids),
    'covered_store_days', covered.store_days,
    'net_sale', round(measured.net_sale, 2),
    'bills', measured.bills,
    'all_bills', all_bills.bills,
    'all_net_sale', round(all_bills.net_sale, 2)
  )
  from covered, all_bills, measured;
$$;

create or replace function public.evaluate_business_decision(p_decision_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_decision public.business_decisions%rowtype;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_end date;
  v_length integer;
  v_store_ids uuid[];
  v_trial jsonb;
  v_base jsonb;
  v_trial_coverage numeric;
  v_base_coverage numeric;
  v_trial_value numeric;
  v_base_value numeric;
  v_change numeric;
  v_verdict text;
  v_explanation text;
  v_caveat constant text := 'Compared with the same number of days just before the start. This does not adjust for festivals, weddings, salary week, weather, stock arrivals or staff leave.';
begin
  if not public.is_owner() then
    raise exception 'Owner access required';
  end if;

  select * into v_decision from public.business_decisions where id = p_decision_id;
  if not found then
    raise exception 'Decision not found';
  end if;

  if v_decision.measure_type = 'observation' then
    return jsonb_build_object(
      'basis', 'observation',
      'verdict', 'not_measured',
      'explanation', 'This decision is judged by owner observation, not sales data. Write down what was observed.'
    );
  end if;

  v_end := least(v_decision.review_date, v_today - 1);
  if v_end < v_decision.start_date then
    return jsonb_build_object(
      'basis', 'data', 'verdict', 'not_started',
      'explanation', 'No closed sales day exists inside the trial period yet.'
    );
  end if;

  v_length := v_end - v_decision.start_date + 1;

  if v_decision.store_id is not null then
    v_store_ids := array[v_decision.store_id];
  else
    select coalesce(array_agg(stores.id order by stores.name), '{}')
    into v_store_ids
    from public.stores stores
    where stores.is_active
      and exists (
        select 1 from public.reports reports
        where reports.store_id = stores.id and reports.report_type = 'sales'
          and reports.status = 'processed' and reports.is_current
      );
  end if;

  if cardinality(v_store_ids) = 0 then
    return jsonb_build_object(
      'basis', 'data', 'verdict', 'insufficient_data',
      'explanation', 'No processed sales uploads exist for the selected store.'
    );
  end if;

  v_trial := public.decision_measure_window(
    v_store_ids, v_decision.measure_type, v_decision.measure_filter, v_decision.start_date, v_end
  );
  v_base := public.decision_measure_window(
    v_store_ids, v_decision.measure_type, v_decision.measure_filter,
    v_decision.start_date - v_length, v_decision.start_date - 1
  );

  v_trial_coverage := (v_trial ->> 'covered_store_days')::numeric / nullif((v_trial ->> 'expected_store_days')::numeric, 0);
  v_base_coverage := (v_base ->> 'covered_store_days')::numeric / nullif((v_base ->> 'expected_store_days')::numeric, 0);

  if v_decision.measure_type = 'store_average_bill' then
    v_trial_value := (v_trial ->> 'all_net_sale')::numeric / nullif((v_trial ->> 'all_bills')::numeric, 0);
    v_base_value := (v_base ->> 'all_net_sale')::numeric / nullif((v_base ->> 'all_bills')::numeric, 0);
  elsif v_decision.measure_type = 'store_bills' then
    v_trial_value := (v_trial ->> 'all_bills')::numeric / nullif((v_trial ->> 'covered_store_days')::numeric, 0);
    v_base_value := (v_base ->> 'all_bills')::numeric / nullif((v_base ->> 'covered_store_days')::numeric, 0);
  else
    v_trial_value := (v_trial ->> 'net_sale')::numeric / nullif((v_trial ->> 'covered_store_days')::numeric, 0);
    v_base_value := (v_base ->> 'net_sale')::numeric / nullif((v_base ->> 'covered_store_days')::numeric, 0);
  end if;

  if v_length < 7 then
    v_verdict := 'too_short';
    v_explanation := format('Only %s closed day(s) in the trial so far; at least 7 are needed before judging.', v_length);
  elsif coalesce(v_trial_coverage, 0) < 0.85 or coalesce(v_base_coverage, 0) < 0.85 then
    v_verdict := 'insufficient_data';
    v_explanation := format(
      'Sales uploads cover %s%% of trial days and %s%% of comparison days; at least 85%% of each is needed.',
      round(coalesce(v_trial_coverage, 0) * 100), round(coalesce(v_base_coverage, 0) * 100)
    );
  elsif (v_trial ->> 'bills')::integer < 10 or (v_base ->> 'bills')::integer < 10 then
    v_verdict := 'insufficient_data';
    v_explanation := 'Fewer than 10 bills matched the measure in one of the periods, which is too few to judge.';
  elsif coalesce(v_base_value, 0) <= 0 then
    v_verdict := 'insufficient_data';
    v_explanation := 'The comparison period has no measurable value.';
  else
    v_change := (v_trial_value - v_base_value) / v_base_value;
    if v_change >= 0.10 then
      v_verdict := 'improved';
      v_explanation := format('Sales improved: the measure rose %s%% against the comparison period (10%% or more counts as a clear rise). This is measured sales, not proof that the decision caused it.', round(v_change * 100, 1));
    elsif v_change <= -0.10 then
      v_verdict := 'declined';
      v_explanation := format('Sales declined: the measure fell %s%% against the comparison period. This is measured sales, not proof that the decision caused it.', round(abs(v_change) * 100, 1));
    else
      v_verdict := 'no_clear_change';
      v_explanation := format('No clear sales change: the change of %s%% is within normal day-to-day variation (under 10%%).', round(v_change * 100, 1));
    end if;
  end if;

  return jsonb_build_object(
    'basis', 'data',
    'verdict', v_verdict,
    'measure_type', v_decision.measure_type,
    'measure_filter', v_decision.measure_filter,
    'store_ids', to_jsonb(v_store_ids),
    'trial', v_trial || jsonb_build_object('value', round(coalesce(v_trial_value, 0), 2), 'coverage', round(coalesce(v_trial_coverage, 0), 3)),
    'comparison', v_base || jsonb_build_object('value', round(coalesce(v_base_value, 0), 2), 'coverage', round(coalesce(v_base_coverage, 0), 3)),
    'change_ratio', case when v_change is null then null else round(v_change, 4) end,
    'explanation', v_explanation,
    'caveat', v_caveat,
    'evaluated_at', now()
  );
end;
$$;

create or replace function public.review_business_decision(
  p_decision_id uuid,
  p_result text,
  p_result_note text default '',
  p_learned text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision public.business_decisions%rowtype;
  v_evidence jsonb;
  v_basis text;
begin
  if not public.is_owner() then
    raise exception 'Owner access required';
  end if;

  if p_result is null or p_result not in ('worked', 'did_not_work', 'mixed', 'inconclusive') then
    raise exception 'Choose a valid result';
  end if;

  select * into v_decision from public.business_decisions where id = p_decision_id for update;
  if not found then
    raise exception 'Decision not found';
  end if;
  if v_decision.status not in ('planned', 'active') then
    raise exception 'Only a planned or active decision can be reviewed';
  end if;

  v_evidence := public.evaluate_business_decision(p_decision_id);
  v_basis := case when v_decision.measure_type = 'observation' then 'observation' else 'data' end;

  if p_result = 'worked' then
    if v_basis = 'data' and v_evidence ->> 'verdict' <> 'improved' then
      raise exception 'Measured sales do not support "worked" (%). Record your judgement as mixed or inconclusive, or extend the review date.',
        v_evidence ->> 'verdict';
    end if;
    if v_basis = 'observation' and char_length(btrim(coalesce(p_result_note, ''))) = 0 then
      raise exception 'Describe what you observed before recording that it worked';
    end if;
  end if;

  perform set_config('gpbm.decision_review', 'on', true);
  update public.business_decisions
  set status = 'reviewed',
      result = p_result,
      evidence = v_evidence,
      evidence_basis = v_basis,
      result_note = left(btrim(coalesce(p_result_note, '')), 1000),
      learned = left(btrim(coalesce(p_learned, '')), 1000),
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_by = auth.uid()
  where id = p_decision_id;
  perform set_config('gpbm.decision_review', 'off', true);

  return v_evidence;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Follow-up to task without duplicates
-- ---------------------------------------------------------------------------
create or replace function public.create_followup_task(
  p_source text,
  p_key text,
  p_title text,
  p_evidence text default '',
  p_signal jsonb default '{}'::jsonb,
  p_source_chat_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task_id uuid;
begin
  if not public.is_owner() then
    raise exception 'Owner access required';
  end if;
  if p_source not in ('daily_priority', 'secretary') then
    raise exception 'Invalid follow-up source';
  end if;
  if char_length(coalesce(p_key, '')) not between 1 and 160 or char_length(btrim(coalesce(p_title, ''))) not between 1 and 160 then
    raise exception 'A short title and recommendation key are required';
  end if;
  if p_source = 'secretary' and not exists (
    select 1 from public.ai_chats chats
    where chats.id = p_source_chat_id and chats.user_id = auth.uid() and chats.role = 'assistant'
  ) then
    raise exception 'Secretary recommendation not found';
  end if;

  -- Serialise conversions of the same recommendation so two owners clicking at
  -- the same moment cannot create two tasks.
  perform pg_advisory_xact_lock(hashtextextended('recommendation_followup:' || p_key, 0));

  select followups.task_id into v_task_id
  from public.recommendation_followups followups
  join public.tasks tasks on tasks.id = followups.task_id
  where followups.recommendation_key = p_key
    and coalesce(tasks.status, 'pending') not in ('done', 'cancelled')
  order by followups.created_at desc
  limit 1;

  if v_task_id is not null then
    return v_task_id;
  end if;

  insert into public.tasks (
    assigned_to, carry_forward, category, created_by, description,
    due_date, is_private, priority, source, status, title
  ) values (
    auth.uid(), true, 'owner-follow-up', auth.uid(),
    left(coalesce(nullif(btrim(p_evidence), ''), 'Created from an owner follow-up.'), 2000),
    (now() at time zone 'Asia/Kolkata')::date,
    true, 'normal', 'manual', 'pending', left(btrim(p_title), 160)
  ) returning id into v_task_id;

  insert into public.recommendation_followups (
    source, recommendation_key, title, evidence_text, signal, status, task_id, source_chat_id, created_by
  ) values (
    p_source, p_key, left(btrim(p_title), 160), left(coalesce(p_evidence, ''), 1500),
    coalesce(p_signal, '{}'::jsonb), 'converted', v_task_id, p_source_chat_id, auth.uid()
  );

  return v_task_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.decision_measure_window(uuid[], text, text, date, date) from public, anon, authenticated;
revoke all on function public.evaluate_business_decision(uuid) from public, anon;
revoke all on function public.review_business_decision(uuid, text, text, text) from public, anon;
revoke all on function public.create_followup_task(text, text, text, text, jsonb, uuid) from public, anon;
revoke all on function public.record_sop_revision() from public, anon, authenticated;
revoke all on function public.guard_business_decision_review() from public, anon, authenticated;
revoke all on function public.guard_weekly_review_evidence() from public, anon, authenticated;
grant execute on function public.evaluate_business_decision(uuid) to authenticated;
grant execute on function public.review_business_decision(uuid, text, text, text) to authenticated;
grant execute on function public.create_followup_task(text, text, text, text, jsonb, uuid) to authenticated;
-- Check constraints on public.sops evaluate as the writing role.
grant execute on function public.sop_steps_valid(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Initial SOPs (all stores). Owners can edit them in the app; every edit
--     keeps the previous version in sop_revisions.
-- ---------------------------------------------------------------------------
insert into public.sops (sop_key, store_id, title, purpose, when_to_use, steps, escalate_when, exception_category, sort_order)
values
(
  'opening', null, 'Opening',
  'The store is ready for the first customer: people, floor, sizes and billing.',
  'Before the shutter opens. About 15 minutes.',
  jsonb_build_array(
    jsonb_build_object('text', 'Attendance: see who is absent or late. If the floor is short, cover billing and the busiest section first.'),
    jsonb_build_object('text', 'Grooming: uniform or ID, neat hair, clean shoes. Correct quietly, not in front of others.'),
    jsonb_build_object('text', 'Selling floor and trial rooms: entry, floor, mirrors and trial rooms clean; lights and AC/fans on; no clothes or hangers left inside. Do the cleaning check.', 'href', '/app/reviews/cleaning'),
    jsonb_build_object('text', 'Key racks: front racks and new arrivals full; fast styles show the common sizes. Refill missing sizes from backstock before customers arrive. Do the rack check.', 'href', '/app/reviews/rack'),
    jsonb_build_object('text', 'Billing ready: billing system, printer roll, card machine and UPI QR working, change and carry bags available.'),
    jsonb_build_object('text', 'Yesterday''s handover: alterations due today, customer holds and exchange promises are known to the staff on the floor.', 'href', '/app/updates'),
    jsonb_build_object('text', 'Only if something will affect customers today, record one Opening status update. If all is normal, nothing to fill.')
  ),
  'Call the owner first when: power, AC, card machine or UPI is down for more than 30 minutes; two or more staff are absent on a weekend or festival day; the store cannot open on time.',
  'Opening status', 10
),
(
  'floor-supervision', null, 'Floor supervision',
  'Every customer is attended, trials are followed up, and corrections are quick and private.',
  'Walk the floor at least once an hour, and continuously during evening rush, weekends and festival days.',
  jsonb_build_array(
    jsonb_build_object('text', 'Coverage: every section has someone; billing is never left empty; one person stays near the trial rooms at peak time.'),
    jsonb_build_object('text', 'Unattended customers: if a customer is looking for more than a minute or two without help, send the nearest free staff member. Greet and help; do not follow or pressure.'),
    jsonb_build_object('text', 'Trial follow-up: the staff member near the trial room offers the next size, colour or a matching item before the customer walks out.'),
    jsonb_build_object('text', 'Phones: personal phones stay away on the floor except for store work. Correct it on the spot in a few words.'),
    jsonb_build_object('text', 'Quick correction: correct privately and immediately. If the same issue repeats with the same person in a week, tell the owner in a Staff availability note. This is for coaching, not salary deductions.'),
    jsonb_build_object('text', 'Missing sizes: if the same size is asked for and not available several times in a day, record one Display / rack issue update so buying can see it.')
  ),
  'Call the owner first when: staff argue on the floor, a customer argument is getting louder, or theft is suspected. Do not confront a customer alone.',
  'Staff availability note', 20
),
(
  'complaints', null, 'Complaint handling',
  'Listen, record the facts, solve what you are allowed to, escalate money and reputation issues, and close the loop.',
  'Whenever a customer is unhappy, in the store or on the phone.',
  jsonb_build_array(
    jsonb_build_object('text', 'Listen fully and calmly. Move the customer away from the billing queue if others are waiting. Do not argue or blame.'),
    jsonb_build_object('text', 'Record the facts in a Customer issue update: bill number and date, item, the problem, what the customer is asking for. Add a photo if the item is damaged.', 'href', '/app/updates/new'),
    jsonb_build_object('text', 'Resolve within your authority: size swap, exchange within the store policy, alteration redo, or a clear pick-up date.'),
    jsonb_build_object('text', 'Before promising any refund, cash return, extra discount, exception to the exchange policy or compensation, call the owner. Record it as urgent.'),
    jsonb_build_object('text', 'Tell the customer when they will hear back, preferably the same day. Do not send WhatsApp messages or offers unless the owner has approved it.'),
    jsonb_build_object('text', 'Close the loop: when it is solved, update the record and mark it resolved.', 'href', '/app/updates')
  ),
  'Escalate to the owner immediately when: money or a refund is involved; the customer mentions social media, Google reviews or a consumer complaint; the customer is still unhappy after your offer; or a staff member is accused.',
  'Customer issue', 30
),
(
  'closing', null, 'Closing',
  'Nothing promised to a customer is forgotten and tomorrow''s team knows what is pending.',
  'The last 20 minutes before closing.',
  jsonb_build_array(
    jsonb_build_object('text', 'Customer commitments: check holds, reserved items and promised call-backs. Each has a name and a next step.'),
    jsonb_build_object('text', 'Alterations and exchanges: what is ready, what is due tomorrow, and that each piece is tagged with the customer name and bill number.'),
    jsonb_build_object('text', 'Stock exceptions only: fast sizes finished today, damaged pieces, transfer needs. Do not list normal stock.'),
    jsonb_build_object('text', 'Unfinished work: mark done what is done in Tasks. Anything unfinished stays open with a reason.', 'href', '/app/tasks'),
    jsonb_build_object('text', 'Trial rooms cleared, lights and AC off, doors and shutter locked as per the existing routine.'),
    jsonb_build_object('text', 'Handover: if anything must happen at opening tomorrow, record one Pending work update. If nothing is pending, mark No issues today on the checklist.', 'href', '/app/checklist')
  ),
  'Call the owner before leaving when: cash or billing does not match the usual closing check; a customer commitment for tomorrow cannot be met; or any stock is missing or damaged beyond normal.',
  'Pending work', 40
)
on conflict (sop_key, store_id) do nothing;

commit;

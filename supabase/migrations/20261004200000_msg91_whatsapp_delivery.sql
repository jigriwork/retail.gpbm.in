-- Server-side MSG91 delivery evidence and duplicate-send protection.
-- Only service-role application code writes this table. The owner may inspect
-- it; managers and cashiers never gain access to staff delivery information.
begin;

create table public.whatsapp_deliveries (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique check (length(dedupe_key) between 8 and 240),
  kind text not null check (kind in ('customer_thank_you', 'payslip')),
  store_id uuid not null references public.stores(id),
  recipient text not null check (recipient ~ '^[1-9][0-9]{9,14}$'),
  template_name text not null check (length(template_name) between 1 and 120),
  reference_id uuid not null,
  status text not null default 'processing' check (status in ('processing', 'accepted', 'delivered', 'read', 'failed')),
  provider_request_id text,
  error_code text,
  attempt_count integer not null default 1 check (attempt_count > 0),
  initiated_by uuid references public.profiles(id),
  metadata jsonb not null default '{}'::jsonb,
  accepted_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index whatsapp_deliveries_reference_idx on public.whatsapp_deliveries(kind, reference_id);
create index whatsapp_deliveries_status_idx on public.whatsapp_deliveries(status, updated_at desc);
create index whatsapp_deliveries_store_idx on public.whatsapp_deliveries(store_id, created_at desc);

create trigger set_whatsapp_deliveries_updated_at
  before update on public.whatsapp_deliveries
  for each row execute function public.set_updated_at();

alter table public.whatsapp_deliveries enable row level security;
revoke all on public.whatsapp_deliveries from anon, authenticated;
grant select on public.whatsapp_deliveries to authenticated;
create policy whatsapp_deliveries_owner_read on public.whatsapp_deliveries
  for select to authenticated using (public.is_owner());

-- MSG91 API sends are recorded separately from the legacy manual share paths.
create or replace function public.record_payslip_delivery(p_generated uuid,p_kind text,p_method text,p_note text default null) returns void
language plpgsql security definer set search_path='' as $$
declare g public.generated_payslips; begin
 if not public.is_owner() then raise exception 'Owner required'; end if;
 select * into g from public.generated_payslips where id=p_generated for update;
 if not found or not public.can_access_store(g.store_id) then raise exception 'Payslip unavailable'; end if;
 if p_kind not in('share_opened','sent','not_sent','failed','skipped') or p_method not in('whatsapp_text','whatsapp_pdf_share','copy_message','whatsapp_manual','msg91_api','download_only','other') or length(p_note)>1000 then raise exception 'Invalid delivery event'; end if;
 insert into public.payslip_delivery_events(generated_id,actor_id,kind,method,note) values(g.id,auth.uid(),p_kind,p_method,p_note);
 if p_kind='share_opened' then
  update public.generated_payslips set last_share_attempt_at=now(),last_share_method=p_method where id=g.id;
 else
  update public.generated_payslips set sent_status=p_kind,sent_at=case when p_kind='sent' then now() end,sent_by=auth.uid(),sent_method=p_method,sent_note=p_note where id=g.id;
 end if;
end $$;

revoke all on function public.record_payslip_delivery(uuid,text,text,text) from public,anon;
grant execute on function public.record_payslip_delivery(uuid,text,text,text) to authenticated;

commit;

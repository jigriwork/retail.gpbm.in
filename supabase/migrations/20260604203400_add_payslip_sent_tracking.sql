-- Add owner-confirmed payslip sent tracking fields.
-- WhatsApp personal/wa.me does not provide delivery confirmation, so these fields track owner-confirmed status only.
-- generated_payslips RLS remains owner-only; no manager policies are added here.

alter table public.generated_payslips
  add column if not exists sent_status text default 'not_sent' check (sent_status in ('not_sent', 'sent', 'failed', 'skipped')),
  add column if not exists sent_method text,
  add column if not exists sent_at timestamptz,
  add column if not exists sent_by uuid references public.profiles(id),
  add column if not exists sent_note text,
  add column if not exists last_share_attempt_at timestamptz,
  add column if not exists last_share_method text;

create index if not exists generated_payslips_sent_status_idx on public.generated_payslips(sent_status);
create index if not exists generated_payslips_sent_at_idx on public.generated_payslips(sent_at);

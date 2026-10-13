-- 1. "Sahu" (Go Planet) is Rajendra Sahu and "SAHU" (Brand Mark) is Niranjan
--    SAHU (owner, 2026-10-13). The duplicates have no login, payslips or sales
--    names of their own, so they are switched off; the real entries keep the
--    "SAHU" sales names already verified to them.
-- 2. "SHOP GP", "SHOP BM" and "SHOP" on bills are the store counter, not
--    people: they never rank as staff (stars, morning summary) or appear as
--    names to match. The night plan already skips them.
begin;

update public.employee_contacts
set is_active = false,
    notes = concat_ws(' · ', nullif(notes, ''), case id
      when 'eab8e668-a8ee-4f30-bf5b-033ded5940d8' then 'Duplicate of Rajendra Sahu (switched off 13 Oct 2026)'
      else 'Duplicate of Niranjan SAHU (switched off 13 Oct 2026)' end),
    updated_at = now()
where id in ('eab8e668-a8ee-4f30-bf5b-033ded5940d8', '38343ce1-5cec-457a-a725-f360dfaeffc4')
  and not exists (select 1 from public.employee_auth_links l where l.employee_contact_id = employee_contacts.id);

do $patch$
declare
  def text;
  before text;
  fn text;
begin
  -- Staff rankings (week stars, appreciation) all read staff_sales_window.
  def := pg_get_functiondef('public.staff_sales_window(uuid, date, date)'::regprocedure);
  before := def;
  def := replace(def, $a$where staff is not null and staff !~* '^(nil|na|n/a|none|unspecified|-|0)$'$a$,
    $a$where staff is not null and staff !~* '^(nil|na|n/a|none|unspecified|-|0)$' and staff !~* '^(shop|counter|cash|store)\M'$a$);
  if def = before then raise exception 'staff_sales_window changed: not patched'; end if;
  execute def;

  -- Morning summary: best staff of the day.
  def := pg_get_functiondef('public.owner_daily_summary_facts(date)'::regprocedure);
  before := def;
  def := replace(def, $a$where n.store_id = s.id and n.sale_date = p_day and n.line_kind = 'item'$a$,
    $a$where n.store_id = s.id and n.sale_date = p_day and n.line_kind = 'item' and n.staff !~* '^(shop|counter|cash|store)\M'$a$);
  if def = before then raise exception 'owner_daily_summary_facts changed: not patched'; end if;
  execute def;

  -- "Match staff names": counter names are not shown as names to match.
  foreach fn in array array['public.staff_match_overview(uuid)', 'public.staff_match_overview_system(uuid)'] loop
    def := pg_get_functiondef(fn::regprocedure);
    before := def;
    def := replace(def, 'and not exists (select 1 from former f where f.norm = s.norm)',
      'and not exists (select 1 from former f where f.norm = s.norm)
      and s.norm !~* ''^(shop|counter|cash|store)\M''');
    if def = before then raise exception '% changed: not patched', fn; end if;
    execute def;
  end loop;
end
$patch$;

commit;

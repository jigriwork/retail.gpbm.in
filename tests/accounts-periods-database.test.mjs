import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// Disposable database only (scripts/test-accounts-local.mjs).
const args = ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
function sql(text) {
  return execFileSync("psql", args, { input: "create or replace function pg_temp.assert_test(ok boolean, message text) returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception '%',message; end if; end $$;\n" + text, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
const as = actor => `reset role; set local request.jwt.claim.sub=${quote(actor)}; set local request.jwt.claim.role='authenticated'; set local role authenticated;`;
const check = (condition, message) => `select pg_temp.assert_test((${condition}),${quote(message)});\n`;
const value = text => sql(text).split("\n").at(-1);

const owner = "b2000000-0000-0000-0000-000000000001";
const accountant = "b2000000-0000-0000-0000-000000000002";
const gp = value("select id from stores where code='GP'");
const goPlanet = value("select id from billing_firms where name='Go Planet'");
const gpFashion = value("select id from billing_firms where name='GP Fashion'");
sql(`insert into auth.users(id,email) values (${quote(owner)},'p-owner@example.invalid'),(${quote(accountant)},'p-acc@example.invalid') on conflict do nothing;
update profiles set role=case when id=${quote(owner)} then 'owner' else 'accountant' end, is_active=true where id in (${quote(owner)},${quote(accountant)});`);
const setup = `reset role; insert into finance_grants(user_id,can_view,can_post,can_manage_masters,can_close_period,granted_by) values(${quote(accountant)},true,true,true,true,${quote(owner)});
${as(accountant)}
insert into parties(legal_name) values('Vikash Sales Corporation') returning id as party \\gset
insert into purchase_invoices(firm_id,store_id,party_id,supplier_invoice_no,invoice_date,taxable_amount,cgst_amount,sgst_amount,invoice_total,created_by)
values(${quote(goPlanet)},${quote(gp)},:'party','PJ-26','2026-08-25',1000,25,25,1050,${quote(accountant)}) returning id as inv \\gset
select post_purchase_invoice(:'inv') as pur \\gset
`;

test("a closed month refuses new entries and reversals; only the owner can reopen it, with a reason", () => {
  assert.throws(() => sql(`begin; ${setup} select close_period(${quote(goPlanet)},'2026-08-01');
    select record_supplier_voucher('payment',${quote(goPlanet)},null,:'party','2026-08-30',100,'bank',null,null,null,null,null,null,null,null,null,null); rollback;`), /Aug 2026 is closed/);
  assert.throws(() => sql(`begin; ${setup} select close_period(${quote(goPlanet)},'2026-08-01'); select reverse_voucher(:'pur','2026-08-31','wrong'); rollback;`), /is closed/);
  // A reversal dated in an open month is allowed; the other firm is unaffected.
  sql(`begin; ${setup} select close_period(${quote(goPlanet)},'2026-08-01'); select reverse_voucher(:'pur','2026-09-02','wrong rates');
    ${check(`not period_is_closed(${quote(gpFashion)},'2026-08-15')`, "Other firm must stay open")} rollback;`);
  assert.throws(() => sql(`begin; ${setup} select close_period(${quote(goPlanet)},'2026-08-01'); select reopen_period(${quote(goPlanet)},'2026-08-01','need to fix'); rollback;`), /Only an owner/);
  sql(`begin; ${setup} select close_period(${quote(goPlanet)},'2026-08-01'); ${as(owner)} select reopen_period(${quote(goPlanet)},'2026-08-01','Supplier sent a late invoice');
    ${check(`not period_is_closed(${quote(goPlanet)},'2026-08-15') and (select reopen_reason from accounting_periods)='Supplier sent a late invoice'`, "Reopen must be recorded")} rollback;`);
});

test("company statement is compared, matched by document and amount, and never changes our ledger", () => {
  sql(`begin; ${setup}
  select record_supplier_voucher('payment',${quote(goPlanet)},null,:'party','2026-09-05',500,'bank','UTR9',null,null,null,null,null,null,null,null,null);
  select save_supplier_statement(${quote(goPlanet)},:'party','2026-08-01','2026-09-30',0,700,null,
    '[{"date":"2026-08-25","doc_no":"PJ 26","debit":1050},{"date":"2026-09-05","doc_no":"UTR9","credit":500},{"date":"2026-09-20","doc_no":"PJ-31","debit":150}]'::jsonb,null) as st \\gset
  select statement_comparison(:'st') as cmp \\gset
  ${check("(:'cmp'::jsonb->>'our_balance')::numeric=550 and (:'cmp'::jsonb->>'their_balance')::numeric=700 and (:'cmp'::jsonb->>'difference')::numeric=-150", "Balances wrong")}
  ${check("(:'cmp'::jsonb->>'matched')::int=2 and jsonb_array_length(:'cmp'::jsonb->'unmatched_theirs')=1 and (:'cmp'::jsonb->'unmatched_theirs'->0->>'doc_no')='PJ-31'", "Their unmatched invoice PJ-31 must be listed")}
  ${check(`(select ledger_balance from party_balances(${quote(goPlanet)},:'party','2026-12-31'))=550`, "Statement must not change our ledger")}
  rollback;`);
});

test("summary keeps firms separate and adds up purchases, payments and notes", () => {
  sql(`begin; ${setup}
  select record_supplier_voucher('credit_note',${quote(goPlanet)},null,:'party','2026-09-10',50,null,'CN1',null,'margin',null,null,null,null,null,null,null);
  ${check(`(select sum(purchases_total) from accounts_summary(null,null,null,'2026-08-01','2026-09-30'))=1050`, "Purchase total")}
  ${check(`(select sum(credit_notes) from accounts_summary(${quote(goPlanet)},null,null,'2026-08-01','2026-09-30'))=50`, "CN total")}
  ${check(`(select count(*) from accounts_summary(${quote(gpFashion)},null,null,'2026-08-01','2026-09-30'))=0`, "Other firm must not see Go Planet rows")}
  rollback;`);
});

test("chain-store volume: balances and a ledger page stay fast with 20,000 vouchers", () => {
  const out = sql(`begin; ${setup}
  reset role;
  insert into parties(legal_name) select 'Load supplier ' || g from generate_series(1,200) g;
  do $$ declare p uuid; i int; begin
    for p in select id from parties where legal_name like 'Load supplier %' loop
      for i in 1..50 loop
        perform write_voucher(jsonb_build_object('firm_id',(select id from billing_firms where name='Go Planet'),'party_id',p,'voucher_type','purchase','voucher_date','2026-09-01'::date + (i % 28)),
          jsonb_build_array(jsonb_build_object('account','purchases','debit',1000),jsonb_build_object('account','supplier','party_id',p,'credit',1000)));
        perform write_voucher(jsonb_build_object('firm_id',(select id from billing_firms where name='Go Planet'),'party_id',p,'voucher_type','payment','voucher_date','2026-09-01'::date + (i % 28)),
          jsonb_build_array(jsonb_build_object('account','supplier','party_id',p,'debit',600),jsonb_build_object('account','bank','credit',600)));
      end loop;
    end loop; end $$;
  analyze vouchers; analyze voucher_lines; analyze voucher_allocations;
  set local request.jwt.claim.sub=${quote(owner)};
  select clock_timestamp() as t0 \\gset
  select count(*) from party_balances(${quote(goPlanet)});
  select extract(epoch from clock_timestamp() - :'t0'::timestamptz) * 1000 as balances_ms \\gset
  select clock_timestamp() as t1 \\gset
  select count(*) from party_ledger(${quote(goPlanet)},(select id from parties where legal_name='Load supplier 7'),'2026-04-01','2027-03-31',0,50);
  select extract(epoch from clock_timestamp() - :'t1'::timestamptz) * 1000 as ledger_ms \\gset
  select :'balances_ms' || ' ' || :'ledger_ms';
  rollback;`);
  const [balancesMs, ledgerMs] = out.split("\n").at(-1).split(" ").map(Number);
  console.log(`20,000 vouchers: all balances ${balancesMs.toFixed(0)} ms, one ledger page ${ledgerMs.toFixed(0)} ms`);
  assert.ok(balancesMs < 5000, `party_balances took ${balancesMs} ms`);
  assert.ok(ledgerMs < 500, `party_ledger took ${ledgerMs} ms`);
});

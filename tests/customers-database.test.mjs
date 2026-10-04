import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// Fixed disposable database (scripts/test-accounts-local.mjs); never production.
const args = ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
function sql(text) {
  return execFileSync("psql", args, { input: "create or replace function pg_temp.assert_test(ok boolean, message text) returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception '%',message; end if; end $$;\n" + text, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
const as = actor => `reset role; set local request.jwt.claim.sub=${quote(actor)}; set local request.jwt.claim.role='authenticated'; set local role authenticated;`;
const check = (condition, message) => `select pg_temp.assert_test((${condition}),${quote(message)});`;
const value = text => sql(text).split("\n").at(-1);

const owner = "c0000000-0000-0000-0000-000000000001";
const gpManager = "c0000000-0000-0000-0000-000000000003";
const bmManager = "c0000000-0000-0000-0000-000000000004";
const accountant = "c0000000-0000-0000-0000-000000000002";
const people = [[owner, "owner"], [accountant, "accountant"], [gpManager, "manager"], [bmManager, "manager"]];
const gp = value("select id from stores where code='GP'");
const bm = value("select id from stores where code='BM'");
sql(`insert into auth.users(id,email) values ${people.map(([id], i) => `(${quote(id)},'customers-${i}@example.invalid')`).join(",")} on conflict(id) do nothing;
update profiles set role=v.role,is_active=true from (values ${people.map(([id, role]) => `(${quote(id)}::uuid,${quote(role)})`).join(",")}) v(id,role) where profiles.id=v.id;
insert into store_users(store_id,user_id) values(${quote(gp)},${quote(gpManager)}),(${quote(bm)},${quote(bmManager)}) on conflict do nothing;`);
const today = value("select india_today()");
const day = offset => `(${quote(today)}::date - ${offset})`;

// Customer A (9876543210) bought at GP 200 days ago and 120 days ago (lapsed),
// customer B (+91 98765 00001) bought at GP and BM yesterday, C is a NIL placeholder.
const setup = `reset role;
insert into reports(store_id,report_type,report_date,status,row_count,is_current) values
 (${quote(gp)},'sales',${day(200)},'processed',1,true),(${quote(gp)},'sales',${day(120)},'processed',1,true),
 (${quote(gp)},'sales',${day(1)},'processed',2,true),(${quote(bm)},'sales',${day(1)},'processed',1,true);
insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,quantity,net_sale,raw_data)
select r.id, r.store_id, r.report_date, v.bill, 'Item', v.qty, v.amount, jsonb_build_object('RCU MOBILE NO.', v.mobile, 'RCU NAME', v.name)
from reports r join (values
  (${day(200)}, 'GP', 'GP-1', 1, 1000, '9876543210', 'ravi kumar'),
  (${day(120)}, 'GP', 'GP-2', 2, 3000, '09876543210', 'RAVI KUMAR'),
  (${day(1)}, 'GP', 'GP-3', 1, 2000, '+91 98765 00001', 'PRIYA'),
  (${day(1)}, 'GP', 'GP-4', 1, 500, '0', 'NIL NIL NIL'),
  (${day(1)}, 'BM', 'BM-1', 3, 6000, '9876500001', 'NILL')
) v(d, code, bill, qty, amount, mobile, name) on r.report_date = v.d and r.store_id = (select id from stores where code = v.code) and r.report_type = 'sales';`;

test("mobiles and names are cleaned from Logic's columns; placeholders are ignored", () => {
  assert.equal(sql("select normalize_in_mobile('+91 98765-43210'), normalize_in_mobile('09876543210'), coalesce(normalize_in_mobile('0'),'null'), coalesce(normalize_in_mobile('12345'),'null');"), "9876543210|9876543210|null|null");
  assert.equal(sql("select clean_customer_name('ravi  kumar'), coalesce(clean_customer_name('NIL NIL NIL'),'null'), coalesce(clean_customer_name('NILL'),'null'), coalesce(clean_customer_name(' '),'null');"), "Ravi Kumar|null|null|null");
});

test("owner sees each customer once across stores; managers see only their store's customers and purchases", () => {
  const out = sql(`begin; ${setup}
  ${as(owner)}
  select mobile, name, bills, spend, store_count from customer_list(null,'all',null,50,0) order by mobile;
  ${as(gpManager)}
  select 'gp', mobile, bills, spend from customer_list(${quote(gp)},'all',null,50,0) order by mobile;
  select 'gp-lapsed', mobile from customer_list(${quote(gp)},'lapsed',null,50,0);
  select 'gp-recent', mobile from customer_list(${quote(gp)},'recent',null,50,0);
  select 'gp-bm-purchases', count(*) from customer_purchases('9876500001');
  ${as(bmManager)}
  select 'bm', count(*) from customer_list(${quote(bm)},'all',null,50,0);
  select 'bm-sees-A', count(*) from customer_purchases('9876543210');
  rollback;`);
  assert.deepEqual(out.split("\n"), [
    "9876500001|Priya|2|8000|2", "9876543210|Ravi Kumar|2|4000|1",
    "gp|9876500001|1|2000", "gp|9876543210|2|4000",
    "gp-lapsed|9876543210", "gp-recent|9876500001",
    "gp-bm-purchases|1",
    "bm|1", "bm-sees-A|0",
  ]);
  assert.equal(sql(`begin; ${setup} ${as(gpManager)} select count(*) from customer_list(${quote(bm)},'all',null,50,0); rollback;`), "0");
  assert.equal(sql(`begin; ${setup} ${as(gpManager)} select count(*) from customer_list(null,'all',null,50,0); rollback;`), "0");
  assert.equal(sql(`begin; ${setup} ${as(accountant)} select count(*) from customer_list(${quote(gp)},'all',null,50,0); rollback;`), "0");
});

test("KPIs: capture rate, new and returning customers in a period", () => {
  const out = sql(`begin; ${setup} ${as(gpManager)}
  select k->>'bills', k->>'bills_with_mobile', k->>'customers', k->>'new_customers', k->>'returning_customers', k->>'customers_all_time', k->>'repeat_customers_all_time'
  from (select customer_kpis(${quote(gp)}, ${day(30)}, ${day(0)}) k) x; rollback;`);
  // Last 30 days at GP: bills GP-3 (B, new) and GP-4 (no mobile); A is lapsed.
  assert.equal(out, "2|1|1|1|0|2|1");
});

test("consent: offers only with consent, withdrawal recorded, do-not-contact blocks everything", () => {
  assert.throws(() => sql(`begin; ${setup} ${as(gpManager)} select log_customer_message('9876543210',${quote(gp)},'lapsed_offer'); rollback;`), /need the customer's consent/);
  assert.throws(() => sql(`begin; ${setup} ${as(gpManager)} select log_customer_message('9876543210',${quote(gp)},'thank_you'); rollback;`), /last 3 days/);
  assert.throws(() => sql(`begin; ${setup} ${as(gpManager)} select save_customer_profile('9876543210',null,null,null,true,null,false,null); rollback;`), /how the customer agreed/);
  assert.throws(() => sql(`begin; ${setup} ${as(bmManager)} select save_customer_profile('9876543210',null,null,null,false,null,false,null); rollback;`), /Customer not found/);
  sql(`begin; ${setup} ${as(gpManager)}
  select log_customer_message('9876500001',${quote(gp)},'thank_you');
  select save_customer_profile('9876543210','Ravi',null,null,true,'in_store',false,null);
  ${check(`(select marketing_consent and consent_source='in_store' and consent_at is not null from customer_profiles where mobile='9876543210')`, "Consent recorded with source and time")}
  select log_customer_message('9876543210',${quote(gp)},'lapsed_offer');
  ${check(`(select count(*) from customer_messages where mobile='9876543210')=1`, "Offer logged after consent")}
  select save_customer_profile('9876543210','Ravi',null,null,false,null,false,null);
  ${check(`(select not marketing_consent and withdrawn_at is not null from customer_profiles where mobile='9876543210')`, "Withdrawal time kept")}
  reset role; ${check(`(select count(*) from audit_logs where action in ('customer_consent_given','customer_consent_withdrawn'))>=2`, "Consent changes audited")}
  ${as(gpManager)}
  select save_customer_profile('9876500001',null,null,null,true,'in_store',true,null);
  ${check(`(select not marketing_consent and do_not_contact from customer_profiles where mobile='9876500001')`, "Do-not-contact overrides consent")}
  rollback;`);
  assert.throws(() => sql(`begin; ${setup} ${as(gpManager)} select save_customer_profile('9876500001',null,null,null,false,null,true,null);
    select log_customer_message('9876500001',${quote(gp)},'thank_you'); rollback;`), /asked not to be contacted/);
  assert.equal(sql("select has_function_privilege('anon','public.customer_list(uuid,text,text,integer,integer)','EXECUTE');"), "f");
});

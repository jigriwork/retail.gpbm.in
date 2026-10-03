import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// Fixed disposable database (scripts/test-accounts-local.mjs). Never reads
// DATABASE_URL or .env.local, so it cannot reach production.
const args = ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
function sql(text) {
  return execFileSync("psql", args, { input: "create or replace function pg_temp.assert_test(ok boolean, message text) returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception '%',message; end if; end $$;\n" + text, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
const as = actor => `reset role; set local request.jwt.claim.sub=${quote(actor)}; set local request.jwt.claim.role='authenticated'; set local role authenticated;`;
const check = (condition, message) => `select pg_temp.assert_test((${condition}),${quote(message)});`;
const value = text => sql(text).split("\n").at(-1);

const owner = "a0000000-0000-0000-0000-000000000001";
const accountant = "a0000000-0000-0000-0000-000000000002";
const gpManager = "a0000000-0000-0000-0000-000000000003";
const bmManager = "a0000000-0000-0000-0000-000000000004";
const staff = "a0000000-0000-0000-0000-000000000005";
const gpAccountant = "a0000000-0000-0000-0000-000000000006";
const people = [[owner, "owner"], [accountant, "accountant"], [gpManager, "manager"], [bmManager, "manager"], [staff, "staff"], [gpAccountant, "accountant"]];
const gp = value("select id from stores where code='GP'");
const bm = value("select id from stores where code='BM'");
const goPlanet = value("select id from billing_firms where name='Go Planet'");
const gpFashion = value("select id from billing_firms where name='GP Fashion'");
sql(`insert into auth.users(id,email) values ${people.map(([id], i) => `(${quote(id)},'accounts-${i}@example.invalid')`).join(",")} on conflict(id) do nothing;
update profiles set role=v.role,is_active=true from (values ${people.map(([id, role]) => `(${quote(id)}::uuid,${quote(role)})`).join(",")}) v(id,role) where profiles.id=v.id;
insert into store_users(store_id,user_id) values(${quote(gp)},${quote(gpManager)}),(${quote(bm)},${quote(bmManager)}) on conflict do nothing;`);
// Grants are given inside each test transaction so tests stay independent.
const grantAll = `reset role; insert into finance_grants(user_id,can_view,can_post,can_manage_masters,granted_by) values(${quote(accountant)},true,true,true,${quote(owner)});`;
const grantGpOnly = `reset role; insert into finance_grants(user_id,firm_id,store_id,can_view,can_post,granted_by) values(${quote(gpAccountant)},${quote(goPlanet)},${quote(gp)},true,true,${quote(owner)});`;
const sha = c => c.repeat(64);

test("store-to-firm mapping follows the owner's instruction and leaves September at Brand Mark unconfirmed", () => {
  sql(`begin;
  ${check(`store_firm_on(${quote(gp)},'2026-05-01')=${quote(goPlanet)}`, "Go Planet store must bill under Go Planet")}
  ${check(`store_firm_on(${quote(gp)},'2026-10-02')=${quote(goPlanet)}`, "Go Planet store must stay on Go Planet")}
  ${check(`store_firm_on(${quote(bm)},'2026-08-31')=${quote(goPlanet)}`, "Brand Mark before September is Go Planet")}
  ${check(`store_firm_on(${quote(bm)},'2026-09-15') is null`, "September at Brand Mark must not be guessed")}
  ${check(`store_firm_on(${quote(bm)},'2026-10-01')=${quote(gpFashion)}`, "Brand Mark from October is GP Fashion")}
  ${check(`sales_bill_firm(${quote(gp)},'2026-10-02','GP-9350')=${quote(goPlanet)}`, "GP- series resolves")}
  ${check(`sales_bill_firm(${quote(bm)},'2026-09-25','BM-243') is null`, "Unconfirmed BM- series in September must stay unresolved")}
  ${check(`sales_bill_firm(${quote(bm)},'2026-06-01','BM-1600')=${quote(goPlanet)}`, "Old BM- series resolves to Go Planet")}
  rollback;`);
  assert.throws(() => sql(`begin; insert into store_firm_periods(store_id,firm_id,valid_from,status,evidence) values(${quote(bm)},${quote(gpFashion)},'2026-08-01','confirmed','overlap test'); rollback;`), /already has a confirmed firm/);
  // Confirming the September period is allowed once it no longer overlaps.
  sql(`begin; update store_firm_periods set status='confirmed', valid_from='2026-09-12' where store_id=${quote(bm)} and status='to_confirm';
  insert into store_firm_periods(store_id,firm_id,valid_from,valid_to,status,evidence) values(${quote(bm)},${quote(goPlanet)},'2026-09-01','2026-09-11','confirmed','test cutover');
  ${check(`store_firm_on(${quote(bm)},'2026-09-11')=${quote(goPlanet)} and store_firm_on(${quote(bm)},'2026-09-12')=${quote(gpFashion)}`, "Confirmed cutover must resolve")} rollback;`);
});

test("accountant sees nothing without a grant, and never owner-only or store report data", () => {
  sql(`begin; ${as(accountant)}
  ${check("(select count(*) from billing_firms)=0", "Ungranted accountant saw firms")}
  ${check("(select count(*) from parties)=0", "Ungranted accountant saw parties")}
  ${check("not finance_any('view')", "Ungranted accountant has finance access")}
  ${grantAll} ${as(accountant)}
  ${check("(select count(*) from billing_firms)=2", "Granted accountant must see firms")}
  ${check("(select count(*) from stores where is_active)>=2", "Granted accountant must see store names")}
  ${check("(select count(*) from sales_rows)=0 and (select count(*) from reports)=0", "Accountant must not read store reports")}
  ${check("(select count(*) from payslip_rows)=0 and (select count(*) from owner_notes)=0 and (select count(*) from audit_logs)=0", "Accountant must not read payroll, owner notes or audit logs")}
  ${check("not is_owner()", "Accountant must never be owner")}
  insert into parties(legal_name,created_by) values('Vikash Sales Corporation',${quote(accountant)});
  ${check("(select count(*) from parties where legal_name='Vikash Sales Corporation')=1", "Accountant with masters grant must add parties")}
  rollback;`);
  assert.throws(() => sql(`begin; ${as(accountant)} insert into finance_grants(user_id,can_view) values(${quote(accountant)},true); rollback;`), /row-level security/);
  assert.throws(() => sql(`begin; reset role; insert into finance_grants(user_id,can_view) values(${quote(staff)},true); rollback;`), /accountant or manager/);
});

test("deactivated accountant loses access at the database even with a grant", () => {
  sql(`begin; ${grantAll} ${as(accountant)} ${check("(select count(*) from billing_firms)=2", "Grant should work while active")}
  reset role; update profiles set is_active=false where id=${quote(accountant)}; ${as(accountant)}
  ${check("(select count(*) from billing_firms)=0 and not finance_any('view')", "Deactivated accountant kept access")} rollback;`);
});

test("firm- and store-scoped grants do not leak to other firms or stores", () => {
  sql(`begin; ${grantGpOnly} ${as(gpAccountant)}
  ${check(`finance_can('post',${quote(goPlanet)},${quote(gp)})`, "Scoped grant must allow its store")}
  ${check(`not finance_can('post',${quote(gpFashion)},${quote(bm)})`, "Scoped grant leaked to GP Fashion / Brand Mark")}
  ${check(`not finance_can('post',${quote(goPlanet)},null)`, "Store-scoped grant must not cover firm-wide records")}
  ${check(`not finance_any('masters')`, "View/post grant must not manage masters")}
  ${check(`(select count(*) from stores where id=${quote(bm)})=0`, "Scoped accountant saw another store")}
  rollback;`);
  assert.throws(() => sql(`begin; ${grantGpOnly} ${as(gpAccountant)} insert into parties(legal_name) values('X Traders'); rollback;`), /row-level security/);
});

test("managers submit purchase documents for their own store only and cannot read finance masters", () => {
  const reserve = (store, kind, c) => `select reserve_finance_document(${quote(kind)},${quote(store)},null,null,'pj-26.pdf','application/pdf',1000,${quote(sha(c))},'PJ-26',null,'2026-09-25')`;
  sql(`begin; ${as(gpManager)} ${reserve(gp, "purchase_invoice", "a")} as r \\gset
  ${check("(select count(*) from finance_documents)=1", "Manager must see own submission")}
  ${check(`(select firm_id from finance_documents)=${quote(goPlanet)}`, "Firm must be picked from the store mapping")}
  ${check("(select count(*) from parties)=0 and (select count(*) from billing_firms)=0", "Manager without grant read masters")}
  ${check(`store_billing_firm_label(${quote(gp)},'2026-09-25')='Go Planet'`, "Manager must see Billed under")}
  rollback;`);
  assert.throws(() => sql(`begin; ${as(gpManager)} ${reserve(bm, "purchase_invoice", "b")}; rollback;`), /cannot submit/);
  assert.throws(() => sql(`begin; ${as(gpManager)} ${reserve(gp, "credit_note", "c")}; rollback;`), /cannot submit/);
  assert.throws(() => sql(`begin; ${as(staff)} ${reserve(gp, "purchase_invoice", "d")}; rollback;`), /cannot submit/);
});

test("finance documents: reserved upload only, duplicates stored once, evidence never deleted", () => {
  sql(`begin; ${grantAll} ${as(accountant)}
  select reserve_finance_document('purchase_invoice',${quote(bm)},null,null,'inv.pdf','application/pdf',1000,${quote(sha("e"))},'Invoice',null,'2026-09-20')::jsonb as r \\gset
  ${check(`(select firm_id from finance_documents where id=(:'r'::jsonb->>'id')::uuid) is null`, "September Brand Mark document must not get a guessed firm")}
  insert into storage.objects(bucket_id,name) values('finance-docs',:'r'::jsonb->>'path');
  select finalize_finance_document((:'r'::jsonb->>'id')::uuid);
  ${check(`(select status from finance_documents where id=(:'r'::jsonb->>'id')::uuid)='stored'`, "Finalize must store")}
  ${check(`(reserve_finance_document('purchase_invoice',${quote(bm)},null,null,'copy.pdf','application/pdf',1000,${quote(sha("e"))},'Copy',null,null)->>'duplicate')::boolean`, "Same file must be reported as a duplicate")}
  delete from storage.objects where bucket_id='finance-docs';
  update storage.objects set name='changed' where bucket_id='finance-docs';
  ${as(owner)} delete from storage.objects where bucket_id='finance-docs';
  ${check("(select count(*) from storage.objects where bucket_id='finance-docs' and name<>'changed')=1", "Finance evidence was deleted or renamed")}
  rollback;`);
  assert.throws(() => sql(`begin; ${grantAll} ${as(accountant)} insert into storage.objects(bucket_id,name) values('finance-docs','docs/unreserved.pdf'); rollback;`), /row-level security/);
  assert.throws(() => sql(`begin; ${as(gpManager)} select reserve_finance_document('purchase_invoice',${quote(gp)},null,null,'a.pdf','application/pdf',1000,${quote(sha("f"))},null,null,null)::jsonb as r \\gset
    ${as(bmManager)} insert into storage.objects(bucket_id,name) values('finance-docs',:'r'::jsonb->>'path'); rollback;`), /row-level security/);
});

test("confirmed terms cannot change and need approval to confirm", () => {
  const arrangement = `insert into brands(name) values('PEPE') returning id as brand \\gset
  insert into parties(legal_name) values('Vikash Sales Corporation') returning id as party \\gset
  insert into supply_arrangements(party_id,brand_id,firm_id,valid_from,settlement_basis) values(:'party',:'brand',${quote(goPlanet)},'2026-09-25','to_confirm') returning id as arr \\gset`;
  sql(`begin; ${grantAll} ${as(accountant)} ${arrangement}
  insert into company_terms(arrangement_id,version,effective_from,credit_days) values(:'arr',1,'2026-09-25',45);
  ${check("(select status from company_terms)='draft'", "Terms start as draft")} rollback;`);
  assert.throws(() => sql(`begin; ${grantAll} ${as(accountant)} ${arrangement}
    insert into company_terms(arrangement_id,version,effective_from,status) values(:'arr',1,'2026-09-25','confirmed'); rollback;`), /allowed to approve/);
  assert.throws(() => sql(`begin; ${as(owner)} ${arrangement}
    insert into company_terms(arrangement_id,version,effective_from,status,credit_days) values(:'arr',1,'2026-09-25','confirmed',45) returning id as t \\gset
    update company_terms set credit_days=30 where id=:'t'; rollback;`), /cannot be changed/);
  sql(`begin; ${as(owner)} ${arrangement}
    insert into company_terms(arrangement_id,version,effective_from,status,credit_days) values(:'arr',1,'2026-09-25','confirmed',45) returning id as t \\gset
    ${check("(select confirmed_by from company_terms)=auth.uid()", "Confirmation must record who confirmed")}
    update company_terms set status='retired' where id=:'t';
    ${check("(select count(*) from finance_events where entity_type='company_terms')>=2", "Terms history must be recorded")} rollback;`);
});

test("Logic sales columns become structured fields without double-counting discounts", () => {
  const raw = { "BILL NO.": "GP-1", "SALE QTY": "1", "M.R.P.": "599.00", "RATE": "599.0000", "GROSS AMOUNT": "599.00", "CD(%)": "10.00", "CD VALUE": "-59.90", "SCH.(Unit)": null, "SCH.(RS.)": null, "TAXABLE AMOUNT": "456.76", "CGST %": "9.00", "CGST (RS)": "41.12", "SGST %": "9.00", "SGST (RS)": "41.12", "TOTAL TAX": "82.24", "NET AMOUNT": "539.00", "HSN CODE": "62052000", "LOT CODE": "123", "SNO.": "7" };
  const bad = { ...raw, "NET AMOUNT": "549.00" };
  sql(`begin; insert into reports(id,store_id,report_type,report_date,status,row_count,is_current) values('b0000000-0000-0000-0000-000000000001',${quote(gp)},'sales','2026-10-01','processed',3,true);
  insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,quantity,mrp,net_sale,raw_data) values
   ('b0000000-0000-0000-0000-000000000001',${quote(gp)},'2026-10-01','GP-1','Shirt',1,599,539,${quote(JSON.stringify(raw))}),
   ('b0000000-0000-0000-0000-000000000001',${quote(gp)},'2026-10-01','GP-1','Shirt',1,599,549,${quote(JSON.stringify(bad))}),
   ('b0000000-0000-0000-0000-000000000001',${quote(gp)},'2026-10-01','GP-1','Shirt',null,null,null,'{}');
  ${check("(select count(*) from sales_rows where gross_amount=599 and cd_amount=-59.90 and taxable_amount=456.76 and tax_amount=82.24 and cgst_rate=9 and hsn_code='62052000' and source_line_no=7 and amounts_reconciled)=1", "Fields must be derived and reconciled")}
  ${check("(select count(*) from sales_rows where net_sale=549 and amounts_reconciled=false)=1", "Mismatched components must be flagged")}
  ${check("(select count(*) from sales_rows where line_kind='no_amount')=1", "Blank follow-up lines must be marked")}
  rollback;`);
});

test("sales input coverage separates bill-level, summary-only, missing and confirmed zero days", () => {
  sql(`begin;
  insert into reports(id,store_id,report_type,report_date,status,row_count,is_current) values
   ('b0000000-0000-0000-0000-000000000011',${quote(bm)},'sales','2026-09-27','processed',1,true),
   ('b0000000-0000-0000-0000-000000000012',${quote(bm)},'sales','2026-09-28','processed',1,true);
  insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,quantity,net_sale,raw_data) values
   ('b0000000-0000-0000-0000-000000000011',${quote(bm)},'2026-09-27','BM-257','Shirt',1,1487,'{}'),
   ('b0000000-0000-0000-0000-000000000012',${quote(bm)},'2026-09-28',null,null,2,4867.82,'{"SHOW ROOM":"(NIL)"}');
  insert into sales_day_confirmations(store_id,sale_date,confirmed_by) values(${quote(bm)},'2026-09-30',${quote(owner)});
  ${as(bmManager)}
  ${check(`(select string_agg(status,',' order by day) from sales_input_coverage(${quote(bm)},'2026-09-27','2026-09-30'))='bill_level,summary_only,missing,zero_confirmed'`, "Coverage statuses wrong")}
  ${check(`(select count(*) from sales_input_coverage(${quote(gp)},'2026-09-27','2026-09-30'))=0`, "Manager saw another store's coverage")}
  rollback;`);
  assert.throws(() => sql(`begin; insert into reports(store_id,report_type,report_date,status,is_current) values(${quote(gp)},'sales','2026-10-05','processed',true),(${quote(gp)},'sales','2026-10-05','processed',true); rollback;`), /reports_one_current_sales/);
});

test("stores added from Accounts get their billing firm from day one; scoped accountants cannot add for other firms", () => {
  sql(`begin; ${grantAll} ${as(accountant)}
  select finance_create_store('GP Fashion Mall','GPF2',${quote(gpFashion)},'2026-11-01','Berhampur') as s \\gset
  ${check(`store_firm_on(:'s','2026-11-01')=${quote(gpFashion)}`, "New store must bill under its firm")}
  ${check(`store_firm_on(:'s','2026-10-31') is null`, "New store has no firm before it opens")}
  rollback;`);
  assert.throws(() => sql(`begin; ${grantGpOnly} ${as(gpAccountant)} select finance_create_store('X','XX1',${quote(gpFashion)},'2026-11-01',null); rollback;`), /cannot add stores/);
  assert.throws(() => sql(`begin; ${as(gpManager)} select finance_create_store('X','XX2',${quote(goPlanet)},'2026-11-01',null); rollback;`), /cannot add stores/);
});

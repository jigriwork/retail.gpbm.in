import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// Disposable database only (scripts/test-accounts-local.mjs).
const args = ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
function sql(text) {
  return execFileSync("psql", args, { input: "create or replace function pg_temp.assert_test(ok boolean, message text) returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception '%',message; end if; end $$;\n" + text, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
const as = actor => `reset role; set local request.jwt.claim.sub=${quote(actor)}; set local request.jwt.claim.role='authenticated'; set local role authenticated;`;
const check = (condition, message) => `select pg_temp.assert_test((${condition}),${quote(message)});\n`;
const value = text => sql(text).split("\n").at(-1);
// Fixtures (reports, sales and stock rows) are written as the database owner,
// as the import routines would; the owner's sign-in claims stay set so the
// accounts routines' own permission checks see an owner.
const ownerClaims = id => `reset role; set local request.jwt.claim.sub=${quote(id)}; set local request.jwt.claim.role='authenticated';`;

const owner = "d0000000-0000-0000-0000-000000000001";
const gp = value("select id from stores where code='GP'");
const goPlanet = value("select id from billing_firms where name='Go Planet'");
sql(`insert into auth.users(id,email) values (${quote(owner)},'s-owner@example.invalid') on conflict do nothing; update profiles set role='owner', is_active=true where id=${quote(owner)};`);

// Agarwal supplied Pepe until 24 Sep; Vikash from 25 Sep. Lot L1 (3 pcs) and L2 (2 pcs) bought from Agarwal.
const setup = `reset role;
-- Fixture document (in the app it arrives through the reserved upload).
insert into finance_documents(kind,firm_id,file_path,file_name,mime_type,byte_size,sha256,status,submitted_by,submitted_role)
values('terms_agreement',${quote(goPlanet)},'docs/takeover.pdf','takeover.pdf','application/pdf',10,${quote("a".repeat(64))},'stored',${quote(owner)},'owner') returning id as doc \\gset
${ownerClaims(owner)}
insert into parties(legal_name) values('Agarwal Apparels') returning id as old \\gset
insert into parties(legal_name) values('Vikash Sales Corporation') returning id as new \\gset
insert into brands(name) values('PEPE JEANS') returning id as brand \\gset
insert into purchase_invoices(firm_id,store_id,party_id,supplier_invoice_no,invoice_date,total_qty,taxable_amount,cgst_amount,sgst_amount,invoice_total,created_by)
values(${quote(goPlanet)},${quote(gp)},:'old','AG-1','2026-09-01',5,5000,125,125,5250,${quote(owner)}) returning id as inv \\gset
insert into purchase_invoice_lines(invoice_id,line_no,brand_id,lot_code,barcode,quantity,taxable_amount,cgst_amount,sgst_amount) values
 (:'inv',1,:'brand','L1','890001',3,3000,75,75),(:'inv',2,:'brand','L2','890002',2,2000,50,50);
select post_purchase_invoice(:'inv') as pur \\gset
insert into reports(id,store_id,report_type,report_date,status,row_count,is_current) values('e0000000-0000-0000-0000-000000000001',${quote(gp)},'sales','2026-09-20','processed',4,true);
insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,quantity,net_sale,raw_data) values
 ('e0000000-0000-0000-0000-000000000001',${quote(gp)},'2026-09-20','GP-1','Jeans',2,4000,'{"LOT CODE":"L1"}'),
 ('e0000000-0000-0000-0000-000000000001',${quote(gp)},'2026-09-20','GP-2','Jeans',2,4000,'{"LOT CODE":"L1"}'),
 ('e0000000-0000-0000-0000-000000000001',${quote(gp)},'2026-09-20','GP-3','Shirt',1,1000,'{"LOT CODE":"L9"}'),
 ('e0000000-0000-0000-0000-000000000001',${quote(gp)},'2026-09-20','GP-4','Jeans',-1,-2000,'{"LOT CODE":"L1"}');
`;
const lotBatch = (lot, party = "old") => `(select id from purchase_batches where lot_code='${lot}' and party_id=:'${party}' and status='active' limit 1)`;

test("posted purchases create batches; sales are attributed by lot, shortfalls and unknown lots stay unresolved, returns go back", () => {
  sql(`begin; ${setup}
  ${check("(select count(*) from purchase_batches where invoice_id=:'inv' and attribution='attributed' and party_id=:'old')=2", "Purchase batches missing")}
  select allocate_store_sales(${quote(gp)},'2026-09-01','2026-09-30') as res \\gset
  ${check("(:'res'::jsonb->>'allocated')::numeric=3 and (:'res'::jsonb->>'unresolved')::numeric=2 and (:'res'::jsonb->>'customer_returns')::numeric=1", "Allocation result wrong: " )}
  ${check(`batch_remaining(${lotBatch("L1")})=1`, "L1 should have 3-3+1 = 1 left")}
  ${check("(select count(*) from stock_allocations where method='unresolved' and status='active')=2", "Two unresolved lines expected (L1 shortfall, unknown L9)")}
  ${check("(select sum(qty) from attribution_summary(" + quote(gp) + ",'2026-09-01','2026-09-30') where method='attributed' and party_id=:'old')=2", "Net attributed to Agarwal should be 3 sold - 1 returned")}
  rollback;`);
});

test("a corrected sales report is re-attributed, never counted twice", () => {
  sql(`begin; ${setup}
  select allocate_store_sales(${quote(gp)},'2026-09-01','2026-09-30');
  update reports set is_current=false where id='e0000000-0000-0000-0000-000000000001';
  insert into reports(id,store_id,report_type,report_date,status,row_count,is_current) values('e0000000-0000-0000-0000-000000000002',${quote(gp)},'sales','2026-09-20','processed',1,true);
  insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,quantity,net_sale,raw_data) values ('e0000000-0000-0000-0000-000000000002',${quote(gp)},'2026-09-20','GP-1','Jeans',1,2000,'{"LOT CODE":"L1"}');
  select allocate_store_sales(${quote(gp)},'2026-09-01','2026-09-30') as res \\gset
  ${check("(:'res'::jsonb->>'stale_reversed')::int>=3", "Old report's attributions must be reversed")}
  ${check(`batch_remaining(${lotBatch("L1")})=2`, "Only the corrected sale (1 pc) may count")}
  rollback;`);
});

test("distributor change: old stock keeps the old supplier until a documented takeover; later sales follow the moved batch", () => {
  sql(`begin; ${setup}
  select allocate_store_sales(${quote(gp)},'2026-09-01','2026-09-30');
  select record_distributor_transfer(${quote(goPlanet)},:'old',:'new','2026-09-25',0,:'doc',array[${lotBatch("L2")}],'Vikash takes over Agarwal Pepe stock') as t \\gset
  ${check(`batch_remaining(${lotBatch("L2")})=0 and batch_remaining(${lotBatch("L2", "new")})=2`, "L2 should move to Vikash")}
  insert into reports(id,store_id,report_type,report_date,status,row_count,is_current) values('e0000000-0000-0000-0000-000000000003',${quote(gp)},'sales','2026-09-26','processed',1,true);
  insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,quantity,net_sale,raw_data) values ('e0000000-0000-0000-0000-000000000003',${quote(gp)},'2026-09-26','GP-9','Jeans',1,2000,'{"LOT CODE":"L2"}');
  select allocate_store_sales(${quote(gp)},'2026-09-26','2026-09-26');
  ${check(`(select b.party_id from stock_allocations a join purchase_batches b on b.id=a.batch_id join sales_rows s on s.id=a.sales_row_id where s.bill_no='GP-9' and a.status='active')=:'new'`, "Sale after takeover must go to Vikash's batch")}
  ${check(`(select count(*) from stock_allocations a join purchase_batches b on b.id=a.batch_id where b.party_id=:'old' and a.status='active' and a.qty>0)=2`, "Earlier sales must stay with Agarwal")}
  rollback;`);
  assert.throws(() => sql(`begin; ${setup} select record_distributor_transfer(${quote(goPlanet)},:'old',:'new','2026-09-25',100,gen_random_uuid(),null,'no paper'); rollback;`), /signed takeover document/);
});

test("supplier return: dispatch reduces stock not the ledger; the debit note reduces it once and the supplier's CN is matched, not deducted again", () => {
  const ledger = `(select ledger_balance from party_balances(${quote(goPlanet)}, :'old', '2026-12-31'))`;
  sql(`begin; ${setup}
  select create_supplier_return(${quote(goPlanet)},${quote(gp)},:'old','2026-09-28',jsonb_build_array(jsonb_build_object('batch_id',${lotBatch("L2")},'qty',2)),'Defective',null) as ret \\gset
  ${check(`${ledger}=5250`, "Request must not touch the ledger")}
  select advance_supplier_return(:'ret','dispatch','2026-09-29','LR-55',null,null,null,null,null);
  ${check(`${ledger}=5250 and batch_remaining(${lotBatch("L2")})=0`, "Dispatch reduces stock, not the ledger")}
  ${check(`(select pending from return_credit_pending(${quote(goPlanet)}) where party_id=:'old')=2000`, "Return credit pending should be the expected value")}
  select advance_supplier_return(:'ret','acknowledge','2026-10-01',null,null,(select jsonb_agg(jsonb_build_object('id',id,'accepted_qty',1)) from supplier_return_lines where return_id=:'ret'),null,null,null);
  ${check(`${ledger}=4250 and batch_remaining(${lotBatch("L2")})=1`, "Accepted 1 of 2: debit note 1000, rejected piece back in stock")}
  select advance_supplier_return(:'ret','credit','2026-10-02','CN-77',1000,null,null,null,null);
  ${check(`${ledger}=4250 and (select count(*) from vouchers where voucher_type='credit_note')=0 and (select status from supplier_returns where id=:'ret')='credited'`, "Supplier CN must be matched, not deducted again")}
  rollback;`);
  sql(`begin; ${setup}
  select create_supplier_return(${quote(goPlanet)},${quote(gp)},:'old','2026-09-28',jsonb_build_array(jsonb_build_object('batch_id',${lotBatch("L2")},'qty',1)),null,'credit_note') as ret \\gset
  select advance_supplier_return(:'ret','dispatch','2026-09-29',null,null,null,null,null,null);
  select advance_supplier_return(:'ret','acknowledge','2026-10-01',null,null,(select jsonb_agg(jsonb_build_object('id',id,'accepted_qty',1)) from supplier_return_lines where return_id=:'ret'),null,null,null);
  ${check(`${ledger}=5250`, "Without deduct-on-acknowledgement the ledger waits for the CN")}
  select advance_supplier_return(:'ret','credit','2026-10-02','CN-78',900,null,null,null,null);
  ${check(`${ledger}=4350 and (select count(*) from vouchers where voucher_type='credit_note')=1`, "The supplier CN is posted once")}
  rollback;`);
  sql(`begin; ${setup}
  select create_supplier_return(${quote(goPlanet)},${quote(gp)},:'old','2026-09-28',jsonb_build_array(jsonb_build_object('batch_id',${lotBatch("L2")},'qty',1)),null,null) as ret \\gset
  select advance_supplier_return(:'ret','dispatch','2026-09-29',null,null,null,null,null,null);
  select advance_supplier_return(:'ret','acknowledge','2026-10-01',null,null,(select jsonb_agg(jsonb_build_object('id',id,'accepted_qty',1)) from supplier_return_lines where return_id=:'ret'),null,null,null);
  select advance_supplier_return(:'ret','credit','2026-10-02','CN-79',800,null,null,null,null);
  ${check("(select amount from disputes where title like 'Return%')=200", "A different supplier credit becomes a 200 dispute")}
  rollback;`);
});

test("opening stock from a stock report starts unattributed until mapped to a supplier with a reason", () => {
  sql(`begin; ${setup}
  insert into reports(id,store_id,report_type,report_date,period_month,status,row_count,is_current) values('e0000000-0000-0000-0000-000000000009',${quote(gp)},'stock','2026-09-25','2026-09-01','processed',2,true);
  insert into stock_rows(report_id,store_id,stock_month,item_name,brand,quantity,mrp,raw_data) values
   ('e0000000-0000-0000-0000-000000000009',${quote(gp)},'2026-09-01','Old jeans','PEPE JEANS',4,3999,'{"LOT CODE":"OL1","PURCHASE RATE":"2389.40","BASIC RATE":"2508.87"}'),
   ('e0000000-0000-0000-0000-000000000009',${quote(gp)},'2026-09-01','Zero','PEPE JEANS',0,3999,'{"LOT CODE":"OL2"}');
  select create_opening_batches('e0000000-0000-0000-0000-000000000009','2026-09-25') as n \\gset
  ${check(":'n'::int=1 and (select attribution from purchase_batches where lot_code='OL1')='unattributed' and (select unit_cost from purchase_batches where lot_code='OL1')=2389.40", "Opening batch wrong")}
  select attribute_batches(${quote(gp)},:'brand',:'old','Agarwal was the only Pepe distributor before September');
  ${check("(select party_id from purchase_batches where lot_code='OL1')=:'old'", "Brand mapping must attribute the opening batch")}
  rollback;`);
  assert.throws(() => sql(`begin; ${setup}
    insert into reports(id,store_id,report_type,report_date,period_month,status,row_count,is_current) values('e0000000-0000-0000-0000-000000000009',${quote(gp)},'stock','2026-09-25','2026-09-01','processed',1,true);
    insert into stock_rows(report_id,store_id,stock_month,item_name,brand,quantity,raw_data) values('e0000000-0000-0000-0000-000000000009',${quote(gp)},'2026-09-01','Old jeans','PEPE JEANS',4,'{"LOT CODE":"OL1"}');
    select create_opening_batches('e0000000-0000-0000-0000-000000000009','2026-09-25');
    select create_opening_batches('e0000000-0000-0000-0000-000000000009','2026-09-25'); rollback;`), /already exists/);
});

test("a store manager cannot attribute sales or move stock", () => {
  const manager = "d0000000-0000-0000-0000-000000000002";
  sql(`insert into auth.users(id,email) values (${quote(manager)},'s-mgr@example.invalid') on conflict do nothing; update profiles set role='manager', is_active=true where id=${quote(manager)};
  insert into store_users(store_id,user_id) values(${quote(gp)},${quote(manager)}) on conflict do nothing;`);
  assert.throws(() => sql(`begin; ${as(manager)} select allocate_store_sales(${quote(gp)},'2026-09-01','2026-09-30'); rollback;`), /cannot attribute/);
  assert.throws(() => sql(`begin; ${as(manager)} select transfer_stock_between_stores(${quote(gp)},'2026-09-01','[]',null,null); rollback;`), /cannot receive/);
  assert.throws(() => sql(`begin; ${as(manager)} select create_supplier_return(${quote(goPlanet)},${quote(gp)},gen_random_uuid(),'2026-09-01','[{"qty":1}]',null,null); rollback;`), /cannot create returns/);
});

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
const check = (condition, message) => `select pg_temp.assert_test((${condition}),${quote(message)});`;
const value = text => sql(text).split("\n").at(-1);

const owner = "c0000000-0000-0000-0000-000000000001";
const accountant = "c0000000-0000-0000-0000-000000000002";
const storeAccountant = "c0000000-0000-0000-0000-000000000003";
const gp = value("select id from stores where code='GP'");
const goPlanet = value("select id from billing_firms where name='Go Planet'");
sql(`insert into auth.users(id,email) values (${quote(owner)},'l-owner@example.invalid'),(${quote(accountant)},'l-acc@example.invalid'),(${quote(storeAccountant)},'l-sacc@example.invalid') on conflict do nothing;
update profiles set role=case when id=${quote(owner)} then 'owner' else 'accountant' end, is_active=true where id in (${quote(owner)},${quote(accountant)},${quote(storeAccountant)});`);

const setup = `reset role;
insert into finance_grants(user_id,can_view,can_post,can_manage_masters,granted_by) values(${quote(accountant)},true,true,true,${quote(owner)});
insert into finance_grants(user_id,firm_id,store_id,can_view,can_post,granted_by) values(${quote(storeAccountant)},${quote(goPlanet)},${quote(gp)},true,true,${quote(owner)});
${as(owner)}
insert into parties(legal_name) values('Vikash Sales Corporation') returning id as party \\gset
insert into brands(name) values('PEPE JEANS') returning id as brand \\gset
insert into supply_arrangements(party_id,brand_id,firm_id,valid_from,settlement_basis,status) values(:'party',:'brand',${quote(goPlanet)},'2026-09-01','purchase','confirmed') returning id as arr \\gset
insert into company_terms(arrangement_id,version,effective_from,status,payment_cycle,credit_days) values(:'arr',1,'2026-09-01','confirmed','per_invoice',45);
${as(accountant)}
insert into purchase_invoices(firm_id,store_id,party_id,supplier_invoice_no,invoice_date,total_qty,taxable_amount,cgst_amount,sgst_amount,round_off,invoice_total,created_by)
values(${quote(goPlanet)},${quote(gp)},:'party','PJ -26','2026-09-25',463,976985.60,44413.82,44413.82,-0.24,1065813.00,${quote(accountant)}) returning id as inv \\gset
insert into purchase_invoice_lines(invoice_id,line_no,brand_id,quantity,taxable_amount,gst_rate,cgst_amount,sgst_amount) values
 (:'inv',1,:'brand',351,669459.80,5,16736.50,16736.49),
 (:'inv',2,:'brand',112,307525.80,18,27677.32,27677.32);
select post_purchase_invoice(:'inv') as pur \\gset
`;
// Entries in these tests are dated up to Oct 2026, so balances are read as of 31 Oct.
const balance = field => `(select ${field} from party_balances(${quote(goPlanet)}, :'party', '2026-10-31'))`;

test("Pepe PJ-26 posts as one balanced purchase: ledger ₹10,65,813, due in 45 days from confirmed terms", () => {
  sql(`begin; ${setup}
  ${check("(select sum(debit)=sum(credit) from voucher_lines where voucher_id=:'pur')", "Voucher must balance")}
  ${check(`${balance("ledger_balance")}=1065813.00`, "Ledger balance must equal invoice total")}
  ${check("(select due_date from vouchers where id=:'pur')='2026-11-09'", "Due date must come from 45 credit days")}
  ${check("(select status from purchase_invoices where id=:'inv')='posted'", "Invoice must be posted")}
  ${check(`${balance("due_now")}=0`, "Not due before the due date")}
  ${check(`(select due_now from party_balances(${quote(goPlanet)}, :'party', '2026-11-10'))=1065813.00 and (select overdue from party_balances(${quote(goPlanet)}, :'party', '2026-11-10'))=1065813.00`, "Must be due and overdue after the due date")}
  rollback;`);
});

test("the same supplier invoice cannot be entered twice (PDF, Logic and item sheet enrich one purchase)", () => {
  assert.throws(() => sql(`begin; ${setup}
    insert into purchase_invoices(firm_id,store_id,party_id,supplier_invoice_no,invoice_date,taxable_amount,invoice_total,created_by)
    values(${quote(goPlanet)},${quote(gp)},:'party','PJ-26','2026-10-01',1,1,${quote(accountant)}); rollback;`), /purchase_invoices_no_key/);
});

test("partial and over-payments: allocations never exceed open amounts and leftovers are advances", () => {
  sql(`begin; ${setup}
  select record_supplier_voucher('payment',${quote(goPlanet)},null,:'party','2026-10-01',500000,'bank','UTR1',null,null,null,null,null,null,'Part payment',jsonb_build_array(jsonb_build_object('voucher_id',:'pur','amount',500000)),null);
  ${check(`${balance("ledger_balance")}=565813.00 and ${balance("open_bills")}=565813.00 and ${balance("advance")}=0`, "Partial payment must reduce the bill once")}
  select record_supplier_voucher('payment',${quote(goPlanet)},null,:'party','2026-10-05',600000,'bank','UTR2',null,null,null,null,null,null,null,jsonb_build_array(jsonb_build_object('voucher_id',:'pur','amount',565813)),null);
  ${check(`${balance("ledger_balance")}=-34187.00 and ${balance("open_bills")}=0 and ${balance("advance")}=34187.00`, "Overpayment must show as advance")}
  rollback;`);
  assert.throws(() => sql(`begin; ${setup}
    select record_supplier_voucher('payment',${quote(goPlanet)},null,:'party','2026-10-01',100,'bank',null,null,null,null,null,null,null,null,jsonb_build_array(jsonb_build_object('voucher_id',:'pur','amount',200)),null); rollback;`), /More than the unadjusted amount/);
});

test("credit notes reduce the ledger once and are matched to bills, not deducted again", () => {
  sql(`begin; ${setup}
  select record_supplier_voucher('credit_note',${quote(goPlanet)},null,:'party','2026-10-10',30234,null,'CN-792','2026-08-28','promotion',null,null,null,null,'SS-26 promo',jsonb_build_array(jsonb_build_object('voucher_id',:'pur','amount',30234)),null) as cn \\gset
  ${check(`${balance("ledger_balance")}=1035579.00 and ${balance("cn_received")}=30234 and ${balance("open_bills")}=1035579.00`, "CN must reduce ledger and bill once")}
  select record_supplier_voucher('payment',${quote(goPlanet)},null,:'party','2026-10-11',1035579,'bank',null,null,null,null,null,null,null,null,jsonb_build_array(jsonb_build_object('voucher_id',:'pur','amount',1035579)),null);
  ${check(`${balance("ledger_balance")}=0 and ${balance("open_bills")}=0 and ${balance("advance")}=0`, "Paying net of the CN must settle exactly")}
  rollback;`);
  assert.throws(() => sql(`begin; ${setup}
    select record_supplier_voucher('credit_note',${quote(goPlanet)},null,:'party','2026-10-10',1000,null,'CN',null,'return',900,40,40,0,null,null,null); rollback;`), /plus GST must equal/);
});

test("reversal restores the ledger, releases adjustments and cancels a reversed invoice", () => {
  sql(`begin; ${setup}
  select record_supplier_voucher('payment',${quote(goPlanet)},null,:'party','2026-10-01',100000,'bank',null,null,null,null,null,null,null,null,jsonb_build_array(jsonb_build_object('voucher_id',:'pur','amount',100000)),null) as pay \\gset
  select reverse_voucher(:'pay','2026-10-02','Paid to wrong supplier');
  ${check(`${balance("ledger_balance")}=1065813.00 and ${balance("open_bills")}=1065813.00`, "Reversal must restore the bill")}
  ${check("(select count(*) from voucher_allocations where from_voucher_id=:'pay' and released_at is null)=0", "Adjustments must be released")}
  select reverse_voucher(:'pur','2026-10-02','Wrong rates');
  ${check(`${balance("ledger_balance")}=0`, "Reversed purchase must leave nothing owed")}
  ${check("(select status from purchase_invoices where id=:'inv')='cancelled'", "Reversed invoice must be cancelled for re-entry")}
  rollback;`);
});

test("posted entries are immutable and vouchers cannot be written or unbalanced directly", () => {
  // Each attempt must either be refused or leave the posted entry unchanged.
  const unchanged = check("(select count(*) from voucher_lines where line_no=99)=0 and (select invoice_total from purchase_invoices where id=:'inv')=1065813 and (select sum(quantity) from purchase_invoice_lines where invoice_id=:'inv')=463 and (select amount from vouchers where id=:'pur')=1065813", "Posted entry changed");
  for (const statement of [
    "update vouchers set amount=1 where id=:'pur'",
    "delete from vouchers where id=:'pur'",
    "insert into voucher_lines(voucher_id,line_no,account,debit) values(:'pur',99,'bank',1)",
    "update purchase_invoices set invoice_total=1 where id=:'inv'",
    "update purchase_invoice_lines set quantity=1 where invoice_id=:'inv'",
    "delete from purchase_invoice_lines where invoice_id=:'inv'",
  ]) {
    try {
      sql(`begin; ${setup}\n${statement};\n${unchanged} rollback;`);
    } catch (error) {
      assert.match(String(error.stderr), /cannot|permission denied|row-level security/, statement);
    }
  }
  // As the owner (who may update drafts) the guard trigger itself refuses.
  assert.throws(() => sql(`begin; ${setup}\n${as(owner)} update purchase_invoices set invoice_total=1 where id=:'inv'; rollback;`), /cannot be edited/);
  assert.throws(() => sql(`begin; ${setup} ${as(accountant)}
    insert into purchase_invoices(firm_id,store_id,party_id,supplier_invoice_no,invoice_date,taxable_amount,invoice_total,created_by) values(${quote(goPlanet)},${quote(gp)},:'party','X-1','2026-10-01',1,1,${quote(accountant)}) returning id as d \\gset
    update purchase_invoices set status='posted' where id=:'d'; rollback;`), /only through Post invoice/);
  assert.throws(() => sql(`begin; reset role; select write_voucher(jsonb_build_object('firm_id',${quote(goPlanet)},'voucher_type','journal','voucher_date','2026-10-01'),
    jsonb_build_array(jsonb_build_object('account','bank','debit',10),jsonb_build_object('account','cash','credit',9))); commit;`), /does not balance/);
});

test("totals must add up before posting", () => {
  assert.throws(() => sql(`begin; ${setup} ${as(accountant)}
    insert into purchase_invoices(firm_id,store_id,party_id,supplier_invoice_no,invoice_date,taxable_amount,cgst_amount,sgst_amount,invoice_total,created_by)
    values(${quote(goPlanet)},${quote(gp)},:'party','BAD-1','2026-10-01',1000,25,25,1060,${quote(accountant)}) returning id as d \\gset
    select post_purchase_invoice(:'d'); rollback;`), /do not add up/);
});

test("a store-scoped accountant posts store purchases but not firm-wide payments; sales-based bills are not 'due'", () => {
  sql(`begin; ${setup} ${as(storeAccountant)}
  ${check(`${balance("ledger_balance")}=1065813.00`, "Store accountant must see the store's purchase")}
  rollback;`);
  assert.throws(() => sql(`begin; ${setup} ${as(storeAccountant)}
    select record_supplier_voucher('payment',${quote(goPlanet)},null,:'party','2026-10-01',10,'bank',null,null,null,null,null,null,null,null,null,null); rollback;`), /cannot post/);
  sql(`begin; ${setup} ${as(owner)}
  update supply_arrangements set valid_to='2026-09-30' where id=:'arr';
  insert into supply_arrangements(party_id,brand_id,firm_id,valid_from,settlement_basis,status) values(:'party',:'brand',${quote(goPlanet)},'2026-10-01','sales','confirmed');
  insert into purchase_invoices(firm_id,store_id,party_id,supplier_invoice_no,invoice_date,taxable_amount,cgst_amount,sgst_amount,invoice_total,created_by)
  values(${quote(goPlanet)},${quote(gp)},:'party','PJ-40','2026-10-02',1000,25,25,1050,${quote(owner)}) returning id as s \\gset
  insert into purchase_invoice_lines(invoice_id,line_no,brand_id,quantity,taxable_amount,cgst_amount,sgst_amount) values(:'s',1,:'brand',1,1000,25,25);
  select post_purchase_invoice(:'s') as sv \\gset
  ${check("(select due_date is null and settlement_basis='sales' from vouchers where id=:'sv')", "Sales-based purchase must not get a purchase due date")}
  ${check(`(select sales_basis_open from party_balances(${quote(goPlanet)}, :'party', '2027-03-01'))=1050 and (select due_now from party_balances(${quote(goPlanet)}, :'party', '2027-03-01'))=1065813.00`, "Sales-based bill must not count as due")}
  rollback;`);
});

test("party ledger shows a running balance a page at a time", () => {
  sql(`begin; ${setup}
  select record_supplier_voucher('payment',${quote(goPlanet)},null,:'party','2026-10-01',65813,'bank',null,null,null,null,null,null,null,null,null,null);
  ${check(`(select string_agg(running_balance::text,',' order by voucher_date) from party_ledger(${quote(goPlanet)},:'party','2026-09-01','2026-10-31',0,50))='1065813.00,1000000.00'`, "Running balance wrong")}
  ${check(`(select opening_balance from party_ledger(${quote(goPlanet)},:'party','2026-10-01','2026-10-31',0,50) limit 1)=1065813.00`, "Opening balance before the range wrong")}
  rollback;`);
});

test("item-sheet lines without numeric GST still post when the invoice header carries the tax", () => {
  sql(`begin; ${setup}
  ${as(accountant)}
  insert into purchase_invoices(firm_id,store_id,party_id,supplier_invoice_no,invoice_date,total_qty,taxable_amount,cgst_amount,sgst_amount,invoice_total,created_by)
  values(${quote(goPlanet)},${quote(gp)},:'party','PJ-27','2026-09-26',2,2000,50,50,2100,${quote(accountant)}) returning id as d \\gset
  insert into purchase_invoice_lines(invoice_id,line_no,brand_id,quantity,taxable_amount,source) values(:'d',1,:'brand',2,2000,'item_sheet');
  ${check("(purchase_invoice_check(:'d')->>'can_post')::boolean and not (purchase_invoice_check(:'d')->>'lines_have_tax')::boolean", "Tax-less item lines must not block posting")}
  rollback;`);
});

test("open bills and unadjusted entries come back in one query, oldest due first", () => {
  sql(`begin; ${setup}
  select record_supplier_voucher('payment',${quote(goPlanet)},null,:'party','2026-10-01',1000,'bank',null,null,null,null,null,null,null,null,'[]'::jsonb,null);
  ${check(`(select count(*) from open_vouchers(${quote(goPlanet)},:'party','credit'))=1 and (select open_amount from open_vouchers(${quote(goPlanet)},:'party','credit'))=1065813.00`, "Open bill wrong")}
  ${check(`(select open_amount from open_vouchers(${quote(goPlanet)},:'party','debit'))=1000`, "Unadjusted payment wrong")}
  rollback;`);
});

test("a store-scoped accountant can pay that store's bills in full, but not leave advances or touch other stores", () => {
  const bm = value("select id from stores where code='BM'");
  // Store accountant pays the Go Planet store's bill, fully allocated.
  sql(`begin; ${setup} ${as(storeAccountant)}
  select record_supplier_voucher('payment',${quote(goPlanet)},${quote(gp)},:'party','2026-10-01',65813,'bank',null,null,null,null,null,null,null,null,jsonb_build_array(jsonb_build_object('voucher_id',:'pur','amount',65813)),null) as pay \\gset
  ${check(`(select store_id from vouchers where id=:'pay')=${quote(gp)} and (select open_amount from open_vouchers(${quote(goPlanet)},:'party','credit'))=1000000`, "Store payment must be posted and allocated")}
  rollback;`);
  // Partly unallocated store payment = advance -> refused.
  assert.throws(() => sql(`begin; ${setup} ${as(storeAccountant)}
    select record_supplier_voucher('payment',${quote(goPlanet)},${quote(gp)},:'party','2026-10-01',70000,'bank',null,null,null,null,null,null,null,null,jsonb_build_array(jsonb_build_object('voucher_id',:'pur','amount',65813)),null); rollback;`), /set in full/);
  // Firm-wide payment -> refused for the store accountant.
  assert.throws(() => sql(`begin; ${setup} ${as(storeAccountant)}
    select record_supplier_voucher('payment',${quote(goPlanet)},null,:'party','2026-10-01',100,'bank',null,null,null,null,null,null,null,null,jsonb_build_array(jsonb_build_object('voucher_id',:'pur','amount',100)),null); rollback;`), /cannot post/);
  // Another store's payment -> refused.
  assert.throws(() => sql(`begin; ${setup} ${as(storeAccountant)}
    select record_supplier_voucher('payment',${quote(goPlanet)},${quote(bm)},:'party','2026-10-01',100,'bank',null,null,null,null,null,null,null,null,null,null); rollback;`), /cannot post/);
  // Undoing part of a store payment needs firm-wide permission.
  assert.throws(() => sql(`begin; ${setup} ${as(storeAccountant)}
    select record_supplier_voucher('payment',${quote(goPlanet)},${quote(gp)},:'party','2026-10-01',100,'bank',null,null,null,null,null,null,null,null,jsonb_build_array(jsonb_build_object('voucher_id',:'pur','amount',100)),null) as pay \\gset
    select release_allocation((select id from voucher_allocations where from_voucher_id=:'pay'),'test'); rollback;`), /firm-wide permission/);
  // The firm-wide accountant may still record an advance.
  sql(`begin; ${setup} ${as(accountant)}
  select record_supplier_voucher('payment',${quote(goPlanet)},null,:'party','2026-10-01',500,'bank',null,null,null,null,null,null,null,null,null,null);
  ${check(`(select advance from party_balances(${quote(goPlanet)},:'party','2026-10-31'))=500`, "Firm-wide advance allowed")} rollback;`);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// Fixed disposable database (scripts/test-accounts-local.mjs); never production.
const args = ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = text => execFileSync("psql", args, { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const as = actor => `reset role; set local request.jwt.claim.sub=${quote(actor)}; set local request.jwt.claim.role='authenticated'; set local role authenticated;`;
const owner = "f0000000-0000-0000-0000-000000000001";
const accountant = "f0000000-0000-0000-0000-000000000002";
const gpManager = "f0000000-0000-0000-0000-000000000003";
const people = [[owner, "owner"], [accountant, "accountant"], [gpManager, "manager"]];
const gp = sql("select id from stores where code='GP'");
const goPlanet = sql("select id from billing_firms where name='Go Planet'");
sql(`insert into auth.users(id,email) values ${people.map(([id], i) => `(${quote(id)},'gst-${i}@example.invalid')`).join(",")} on conflict(id) do nothing;
update profiles set role=v.role,is_active=true from (values ${people.map(([id, role]) => `(${quote(id)}::uuid,${quote(role)})`).join(",")}) v(id,role) where profiles.id=v.id;
insert into store_users(store_id,user_id) values(${quote(gp)},${quote(gpManager)}) on conflict do nothing;`);

// One supplier (GSTIN 21AAAAA0000A1Z5) with four September bills A, B, C, D due 45 days later.
const setup = `reset role;
insert into finance_grants(user_id,can_view,can_post,can_manage_masters,granted_by) values(${quote(accountant)},true,true,true,${quote(owner)});
${as(owner)}
insert into parties(legal_name,gstin) values('Test Supplier','21AAAAA0000A1Z5') returning id as party \\gset
insert into brands(name) values('TEST BRAND') returning id as brand \\gset
insert into supply_arrangements(party_id,brand_id,firm_id,valid_from,settlement_basis,status) values(:'party',:'brand',${quote(goPlanet)},'2026-04-01','purchase','confirmed') returning id as arr \\gset
insert into company_terms(arrangement_id,version,effective_from,status,payment_cycle,credit_days) values(:'arr',1,'2026-04-01','confirmed','per_invoice',45);
${as(accountant)}
with i as (
  insert into purchase_invoices(firm_id,store_id,party_id,supplier_invoice_no,invoice_date,total_qty,taxable_amount,cgst_amount,sgst_amount,invoice_total,due_date,due_date_source,created_by)
  values (${quote(goPlanet)},${quote(gp)},:'party','A-1','2026-09-05',1,1000,25,25,1050,'2026-10-20','manual',${quote(accountant)}),
         (${quote(goPlanet)},${quote(gp)},:'party','B/2','2026-09-10',1,2000,50,50,2100,'2026-10-25','manual',${quote(accountant)}),
         (${quote(goPlanet)},${quote(gp)},:'party','C-3','2026-09-15',1,3000,75,75,3150,'2026-10-30','manual',${quote(accountant)}),
         (${quote(goPlanet)},${quote(gp)},:'party','D-4','2026-09-20',1,4000,100,100,4200,'2026-11-04','manual',${quote(accountant)})
  returning id)
select count(public.post_purchase_invoice(id)) as posted from i \\gset
reset role;
insert into finance_documents(kind,firm_id,file_path,file_name,mime_type,byte_size,sha256,status,submitted_by,submitted_role)
values('gst_return',${quote(goPlanet)},'docs/2b.json','2b.json','application/json',10,repeat('b',64),'stored',${quote(accountant)},'accountant') returning id as doc \\gset
${as(accountant)}`;

const row = (no, date, taxable, half, period = "") => `jsonb_build_object('supplier_gstin','21AAAAA0000A1Z5','supplier_name','TEST SUPPLIER','doc_type','invoice','doc_no','${no}','doc_date','${date}','doc_value',${taxable + 2 * half},'taxable',${taxable},'cgst',${half},'sgst',${half},'igst',0,'itc_available',true)${period}`;

test("GSTR-2B matching: matched, amount differs, not yet in 2B, in a later 2B, not in books", () => {
  const out = sql(`begin; ${setup}
  select import_gstr2b(:'doc', ${quote(goPlanet)}, '092026', jsonb_build_array(${row("A1", "2026-09-05", 1000, 25)}, ${row("B-2", "2026-09-10", 2100, 52.5)}, ${row("E-9", "2026-09-28", 500, 12.5)}));
  select import_gstr2b(:'doc', ${quote(goPlanet)}, '102026', jsonb_build_array(${row("D 4", "2026-09-20", 4000, 100)}));
  select status, doc_no, coalesce(other_period, '') from gstr2b_reconcile(${quote(goPlanet)}, '092026') order by doc_no;
  rollback;`);
  assert.deepEqual(out.split("\n").filter(Boolean), [
    "3", "1",
    "matched|A-1|", "amount_differs|B/2|", "not_in_2b|C-3|", "in_other_2b|D-4|102026", "not_in_books|E-9|",
  ]);
});

test("re-importing a period replaces it; managers cannot import or read GST data", () => {
  const out = sql(`begin; ${setup}
  select import_gstr2b(:'doc', ${quote(goPlanet)}, '092026', jsonb_build_array(${row("A1", "2026-09-05", 1000, 25)}));
  select import_gstr2b(:'doc', ${quote(goPlanet)}, '092026', jsonb_build_array(${row("A1", "2026-09-05", 1000, 25)}));
  select count(*) from gstr2b_lines;
  ${as(gpManager)} select count(*) from gstr2b_lines;
  rollback;`);
  assert.deepEqual(out.split("\n").filter(Boolean), ["1", "1", "1", "0"]);
  assert.throws(() => sql(`begin; ${setup} ${as(gpManager)} select import_gstr2b(:'doc', ${quote(goPlanet)}, '092026', '[]'::jsonb); rollback;`), /cannot import GST/);
});

test("supplier dues: open bills due by a date with overdue days; managers see none", () => {
  const out = sql(`begin; ${setup}
  select voucher_no is not null, reference_no, due_date, open_amount, days_overdue > 0 from supplier_dues('2026-10-31') order by due_date;
  rollback;`);
  // A due 20 Oct, B 25 Oct, C 30 Oct; D (4 Nov) is after 31 Oct.
  assert.deepEqual(out.split("\n").filter(Boolean).map((line) => line.split("|").slice(1, 4).join("|")), [
    "A-1|2026-10-20|1050.00", "B/2|2026-10-25|2100.00", "C-3|2026-10-30|3150.00",
  ]);
  assert.equal(sql(`begin; ${setup} ${as(gpManager)} select count(*) from supplier_dues('2026-12-31'); rollback;`).split("\n").filter(Boolean).at(-1), "0");
});

test("JSON is accepted only for GST returns", () => {
  assert.throws(() => sql(`begin; ${setup} select reserve_finance_document('purchase_invoice', ${quote(gp)}, ${quote(goPlanet)}, null, 'x.json', 'application/json', 10, repeat('c',64), null, null, null); rollback;`), /JSON files are for GST returns/);
  assert.match(sql(`begin; ${setup} select reserve_finance_document('gst_return', null, ${quote(goPlanet)}, null, '2b.json', 'application/json', 10, repeat('d',64), null, null, null)->>'duplicate'; rollback;`), /false/);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// Disposable database only (scripts/test-accounts-local.mjs).
const args = ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
function sql(text) {
  return execFileSync("psql", args, { input: "create or replace function pg_temp.assert_test(ok boolean, message text) returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception '%',message; end if; end $$;\n" + text, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
const value = text => sql(text).split("\n").at(-1);
const check = (condition, message) => `select pg_temp.assert_test((${condition}),${quote(message)});\n`;
const json = object => quote(JSON.stringify(object));
const total = (rules, lines, field) => Number(value(`select (compute_working(${json(rules)}::jsonb, ${json(lines)}::jsonb)->'totals'->>'${field}')::numeric`));

// Workbook-faithful Mufti rules (row-level thresholds, published 15.25/4.76).
const mufti = {
  formula: "sale_against_payment", threshold_basis: "line",
  sales_tax: { mode: "approx", approx_high: 15.25, approx_low: 4.76, threshold: 2599, operator: ">" },
  margin: { eoss: 19, fresh: 26.7, other: 26.7 },
  purchase_cost: { high_factor: 58.05, low_factor: 68.54, threshold: 2599, operator: ">" },
  purchase_tax: { high_rate: 18, low_rate: 5, threshold: 2599, operator: ">=" },
};

test("Mufti row formula: one EOSS line reproduces the workbook's own row", () => {
  // Workbook row 3: MRP 4499, NSV 2249.50 -> pay 2185.11931, CN 896.6507.
  const line = [{ qty: 1, mrp: 4499, nsv: 2249.5, class: "eoss", sale_date: "2026-08-01" }];
  assert.equal(total(mufti, line, "payment"), 2185.11931);
  assert.equal(total(mufti, line, "cn"), 896.6507);
});

test("thresholds on whole lines vs per piece: 2 x MRP 1,499 changes the CN by ₹314.49", () => {
  const line = [{ qty: 2, mrp: 1499, nsv: 1499, class: "eoss", sale_date: "2026-08-01" }];
  const byLine = total(mufti, line, "cn");
  const byPiece = total({ ...mufti, threshold_basis: "piece" }, line, "cn");
  assert.equal(Math.round((byPiece - byLine) * 100) / 100, 314.49);
});

test("boundary operators are honoured exactly and exact tax fractions differ from the approximations", () => {
  const at = [{ qty: 1, mrp: 2599, nsv: 2599, class: "fresh", sale_date: "2026-08-01" }];
  assert.equal(total(mufti, at, "purchase_cost"), 1781.3546); // '>' keeps 2599 in the lower slab (68.54%)
  assert.equal(total({ ...mufti, purchase_cost: { ...mufti.purchase_cost, operator: ">=" } }, at, "purchase_cost"), 1508.7195);
  const sale = [{ qty: 1, mrp: 4499, nsv: 2249.5, class: "eoss", sale_date: "2026-08-01" }];
  assert.equal(total(mufti, sale, "sales_tax"), 107.0762);
  assert.equal(total({ ...mufti, sales_tax: { mode: "fraction", high_rate: 18, low_rate: 5, threshold: 2599, operator: ">" } }, sale, "sales_tax").toFixed(6), "107.119048");
});

test("a customer return cancels its sale exactly (thresholds use absolute values)", () => {
  const lines = [
    { qty: 1, mrp: 4499, nsv: 2249.5, class: "eoss", bill_no: "1", sale_date: "2026-08-01" },
    { qty: -1, mrp: 4499, nsv: -2249.5, class: "eoss", bill_no: "2", sale_date: "2026-08-01" },
  ];
  for (const field of ["payment", "cn", "sales_tax", "purchase_value"]) assert.equal(total(mufti, lines, field), 0, field);
});

test("Turtle-type: payment = accepted sales - margin; caps allocate per piece, never divided twice", () => {
  const turtle = {
    formula: "sales_margin", threshold_basis: "piece", margin: { fresh: 28, eoss: 28, other: 0 },
    sales_tax: { mode: "fraction", high_rate: 18, low_rate: 5, threshold: 2625, operator: ">" },
    md: { high_pct: 43.25, low_pct: 32.76, threshold: 2625, operator: ">" },
    discount: { accept: "cap", cap: 2398, allocation: "qty" },
  };
  // Bill BM-1811: 4 pcs of MRP 1499 (one line of 2), customer discount 2398, approved 2398.
  const bill = [
    { qty: 1, mrp: 1499, nsv: 899.39, bill_no: "BM-1811", sale_date: "2026-06-10" },
    { qty: 2, mrp: 1499, nsv: 1799.22, bill_no: "BM-1811", sale_date: "2026-06-10" },
    { qty: 1, mrp: 1499, nsv: 899.39, bill_no: "BM-1811", sale_date: "2026-06-10" },
  ];
  assert.equal(total(turtle, bill, "accepted_discount"), 2398);
  assert.equal(total(turtle, bill, "payment"), 2590.56); // (5996 - 2398) x 72%
  const exchange = [
    { qty: -1, mrp: 1899, nsv: -1139.4, bill_no: "BM-1907", sale_date: "2026-06-12" },
    { qty: 1, mrp: 1899, nsv: 1139.4, bill_no: "BM-1907", sale_date: "2026-06-12" },
  ];
  assert.equal(total({ ...turtle, discount: { accept: "all" } }, exchange, "payment"), 0);
});

test("promotion share: (accepted discount - tax difference) x 50%, with bill tiers", () => {
  const promo = { formula: "promo_share", threshold_basis: "line", share_pct: 50, sales_tax: { mode: "approx", approx_high: 15.25, approx_low: 4.76, threshold: 2599, operator: ">" } };
  // Pepe sheet row 105: MRP 2599, accepted 368.76 -> CN 175.60.
  const row = [{ qty: 1, mrp: 2599, nsv: 2230.24, accepted_discount: 368.76, sale_date: "2026-03-31" }];
  assert.equal(total({ ...promo, discount: { accept: "input" } }, row, "cn").toFixed(2), "175.60");
  const tiers = { ...promo, discount: { accept: "tiers", tiers: [{ min_bill_mrp: 4499, amount: 500 }, { min_bill_mrp: 6999, amount: 1000 }] } };
  const bill = [{ qty: 1, mrp: 4999, nsv: 4299.14, bill_no: "GP-6053", sale_date: "2026-03-31" }];
  assert.equal(total(tiers, bill, "accepted_discount"), 500); // customer got 699.86; promotion allows 500
});

// ------------------------------------------------------------------ workflow on uploaded sales
const owner = "f0000000-0000-0000-0000-000000000001";
const gp = value("select id from stores where code='GP'");
const goPlanet = value("select id from billing_firms where name='Go Planet'");
sql(`insert into auth.users(id,email) values (${quote(owner)},'w-owner@example.invalid') on conflict do nothing; update profiles set role='owner', is_active=true where id=${quote(owner)};`);
const claims = `reset role; set local request.jwt.claim.sub=${quote(owner)}; set local request.jwt.claim.role='authenticated';`;
const rulesWithCompany = { ...mufti, company_working: mufti };
const setup = `${claims}
insert into parties(legal_name) values('S Square') returning id as party \\gset
insert into brands(name) values('MUFTI') returning id as brand \\gset
-- Store-specific: in August the Brand Mark store also billed under Go Planet, so a firm-wide arrangement would need its reports too.
insert into supply_arrangements(party_id,brand_id,firm_id,store_id,valid_from,settlement_basis,status) values(:'party',:'brand',${quote(goPlanet)},${quote(gp)},'2026-08-01','sales','confirmed') returning id as arr \\gset
insert into company_terms(arrangement_id,version,effective_from,status,credit_days,rules) values(:'arr',1,'2026-08-01','confirmed',15,${json({ ...rulesWithCompany, class: { default: "fresh", eoss: [{ from: "2026-08-01", to: "2026-08-31" }] } })});
insert into purchase_invoices(firm_id,store_id,party_id,supplier_invoice_no,invoice_date,total_qty,taxable_amount,cgst_amount,sgst_amount,invoice_total,created_by)
values(${quote(goPlanet)},${quote(gp)},:'party','SM-1','2026-07-28',2,5000,125,125,5250,${quote(owner)}) returning id as inv \\gset
insert into purchase_invoice_lines(invoice_id,line_no,brand_id,lot_code,quantity,taxable_amount,cgst_amount,sgst_amount) values(:'inv',1,:'brand','M1',2,5000,125,125);
select post_purchase_invoice(:'inv');
insert into reports(id,store_id,report_type,report_date,status,row_count,is_current) values('a1000000-0000-0000-0000-000000000001',${quote(gp)},'sales','2026-08-01','processed',1,true);
insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,brand,quantity,mrp,net_sale,raw_data) values('a1000000-0000-0000-0000-000000000001',${quote(gp)},'2026-08-01','GP-1','Shirt','MUFTI',1,4499,2249.5,'{"LOT CODE":"M1"}');
select allocate_store_sales(${quote(gp)},'2026-08-01','2026-08-01');
`;

test("a working over missing days is 'incomplete' and cannot be approved", () => {
  sql(`begin; ${setup}
  select prepare_working(:'arr','2026-08-01','2026-08-03','agreed_terms',null,null) as run \\gset
  ${check("not (select complete from calculation_runs where id=:'run') and (select inputs->>'missing_days' from calculation_runs where id=:'run')='2'", "Two missing days must block")}
  ${check("(select (totals->>'payment')::numeric from calculation_runs where id=:'run')=2185.11931", "Figures are still shown")}
  rollback;`);
  assert.throws(() => sql(`begin; ${setup} select prepare_working(:'arr','2026-08-01','2026-08-03','agreed_terms',null,null) as run \\gset
    select set_working_status(:'run','approved',null); rollback;`), /Working incomplete/);
});

test("approval records the expected CN and settlement without touching the ledger; the real CN is matched once", () => {
  sql(`begin; ${setup}
  select prepare_working(:'arr','2026-08-01','2026-08-01','agreed_terms',null,null) as run \\gset
  ${check("(select complete from calculation_runs where id=:'run')", "Single complete day should be complete")}
  select set_working_status(:'run','approved',null);
  ${check("(select expected_amount from claims where run_id=:'run')=896.65 and (select payable from settlements where run_id=:'run')=2185.12", "Expected CN and payable")}
  ${check(`(select ledger_balance from party_balances(${quote(goPlanet)},:'party','2026-12-31'))=5250`, "Approval must not change the ledger")}
  ${check(`(select cn_pending from settlement_balances(${quote(goPlanet)}) where party_id=:'party')=896.65`, "CN pending")}
  select record_supplier_voucher('credit_note',${quote(goPlanet)},null,:'party','2026-09-10',896.65,null,'CN-1',null,'margin',null,null,null,null,null,null,null) as cn \\gset
  select match_claim((select id from claims where run_id=:'run'), :'cn');
  ${check(`(select status from claims where run_id=:'run')='received' and (select cn_pending from settlement_balances(${quote(goPlanet)}) where party_id=:'party')=0`, "Matched CN closes the expected credit")}
  ${check(`(select ledger_balance from party_balances(${quote(goPlanet)},:'party','2026-12-31'))=4353.35`, "Only the posted CN reduces the ledger")}
  rollback;`);
});

test("a corrected sales report marks the approved working 'source changed' and its figures never change", () => {
  sql(`begin; ${setup}
  select prepare_working(:'arr','2026-08-01','2026-08-01','agreed_terms',null,null) as run \\gset
  select set_working_status(:'run','approved',null);
  update reports set is_current=false where id='a1000000-0000-0000-0000-000000000001';
  ${check("(select source_changed and status='approved' and (totals->>'payment')::numeric=2185.11931 from calculation_runs where id=:'run')", "Source change must flag, not rewrite")}
  rollback;`);
  assert.throws(() => sql(`begin; ${setup} select prepare_working(:'arr','2026-08-01','2026-08-01','agreed_terms',null,null) as run \\gset
    update calculation_runs set totals='{}' where id=:'run'; rollback;`), /cannot be changed/);
  assert.throws(() => sql(`begin; ${setup} select prepare_working(:'arr','2026-08-01','2026-08-01','company_working',null,null) as run \\gset
    select set_working_status(:'run','approved',null); rollback;`), /for comparison/);
});

test("pieces not attributed to this supplier keep the working incomplete", () => {
  sql(`begin; ${setup}
  insert into reports(id,store_id,report_type,report_date,status,row_count,is_current) values('a1000000-0000-0000-0000-000000000002',${quote(gp)},'sales','2026-08-02','processed',1,true);
  insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,brand,quantity,mrp,net_sale,raw_data) values('a1000000-0000-0000-0000-000000000002',${quote(gp)},'2026-08-02','GP-2','Shirt','MUFTI',1,4499,2249.5,'{"LOT CODE":"UNKNOWN"}');
  select allocate_store_sales(${quote(gp)},'2026-08-02','2026-08-02');
  select prepare_working(:'arr','2026-08-01','2026-08-02','agreed_terms',null,null) as run \\gset
  ${check("not (select complete from calculation_runs where id=:'run') and (select (inputs->>'unattributed_pieces')::numeric from calculation_runs where id=:'run')=1", "Unattributed piece must block")}
  rollback;`);
});

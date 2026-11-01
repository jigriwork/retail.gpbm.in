// Continuous monthly cash book (migration 20261101120000). Disposable local
// PostgreSQL only: node scripts/test-cash-book-local.mjs
// With CASH_BOOK_WORKBOOK=<path to the corrected Go Planet workbook> the
// September import is tested with the real file; otherwise with a generated
// month of the same shape.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const fails = (q, pattern) => assert.throws(() => sql(q), pattern);
const last = (out) => out.split("\n").filter(Boolean).at(-1);
const json = (out) => JSON.parse(last(out));
const n = (value) => (value === null || value === undefined ? value : Number(value));

const owner = "00000000-0000-0000-0000-0000000000c1";
const cashier = "00000000-0000-0000-0000-0000000000c2";
const manager = "00000000-0000-0000-0000-0000000000c3";
const accountant = "00000000-0000-0000-0000-0000000000c4";
const bmCashier = "00000000-0000-0000-0000-0000000000c5";
sql(`insert into auth.users(id,email) values ('${owner}','m-owner@example.invalid'),('${cashier}','m-cashier@example.invalid'),
  ('${manager}','m-manager@example.invalid'),('${accountant}','m-accountant@example.invalid'),('${bmCashier}','m-bmcashier@example.invalid') on conflict do nothing;
update profiles set role='owner', is_active=true, full_name='Owner M' where id='${owner}';
update profiles set role='cashier', is_active=true, full_name='Cashier GP' where id='${cashier}';
update profiles set role='manager', is_active=true, full_name='Manager GP' where id='${manager}';
update profiles set role='accountant', is_active=true, full_name='Accountant' where id='${accountant}';
update profiles set role='cashier', is_active=true, full_name='Cashier BM' where id='${bmCashier}';
insert into store_users(user_id, store_id) select u, s.id from (values ('${cashier}'::uuid,'GP'),('${manager}'::uuid,'GP'),('${bmCashier}'::uuid,'BM')) v(u,c)
  join stores s on s.code=v.c where not exists (select 1 from store_users x where x.user_id=v.u and x.store_id=s.id);`);

const as = (id) => `set local request.jwt.claim.sub='${id}'; set local role authenticated;`;
const asDb = "reset role; set local request.jwt.claim.sub='';";
const GP = `'${sql("select id from stores where code='GP';")}'::uuid`;
const BM = `'${sql("select id from stores where code='BM';")}'::uuid`;
const today = sql("select india_today();");
const day = (k) => sql(`select (india_today() - ${k})::text;`);
const j = (value) => `$j$${JSON.stringify(value)}$j$::jsonb`;

// September payload: the real workbook when given, else a generated month.
function septemberPayload() {
  if (process.env.CASH_BOOK_WORKBOOK) {
    const out = execFileSync(process.execPath, ["scripts/cash-book-import-workbook.mjs", "--file", process.env.CASH_BOOK_WORKBOOK,
      "--name", "GP_September_October_2026_Cashbook.xlsx", "--sheet", "September 2026", "--store", "GP", "--print"], { encoding: "utf8" });
    const { source, days } = JSON.parse(out);
    return { source, days, real: true };
  }
  const days = []; let opening = 56373;
  for (let d = 1; d <= 30; d += 1) {
    const book = 50000 + d * 1000; const deduction = d === 17 ? 160000 : 49000 + d * 900;
    const closing = opening + book - deduction;
    days.push({ date: `2026-09-${String(d).padStart(2, "0")}`, opening, book_sales: book, software_sales: book - 100, combined_deduction: deduction, closing });
    opening = closing;
  }
  const sum = (key) => days.reduce((total, item) => total + item[key], 0);
  const source = { file_name: "generated.xlsx", sheet: "September 2026", sha256: "a".repeat(64), period_from: "2026-09-01", period_to: "2026-09-30",
    opening: 56373, closing: days.at(-1).closing, totals: { book_sales: sum("book_sales"), software_sales: sum("software_sales"), combined_deduction: sum("combined_deduction") } };
  return { source, days, real: false };
}
const sept = septemberPayload();
const importSql = (dry) => `select cash_book_import_legacy(${GP}, ${j(sept.source)}, ${j(sept.days)}, ${dry});`;

test("September workbook imports once, closes at its calculated balance and opens October with it (Sep 30 -> Oct 1)", () => {
  const out = sql(`begin; ${as(owner)}
${importSql(true)}
${asDb} select count(*) from cash_book_days; ${as(owner)}
${importSql(false)}
${importSql(false)}
select cash_book_month(${GP}, '2026-09-01');
select cash_book_month(${GP}, '2026-10-01');
rollback;`).split("\n").filter(Boolean);
  const [dry, countAfterDry, imported, again, september, october] = [JSON.parse(out[0]), out[1], JSON.parse(out[2]), JSON.parse(out[3]), JSON.parse(out[4]), JSON.parse(out[5])];
  assert.equal(dry.status, "valid");
  assert.equal(countAfterDry, "0", "a dry run writes nothing");
  assert.equal(imported.status, "imported");
  assert.equal(imported.days, 30);
  assert.equal(again.status, "already_imported", "the same file is never imported twice");
  assert.equal(september.days.length, 30);
  assert.equal(n(september.opening), sept.source.opening);
  assert.equal(n(september.closing), sept.source.closing);
  assert.equal(september.closing_date, "2026-09-30");
  assert.equal(september.complete, true);
  assert.equal(n(september.totals.book_sales), sept.source.totals.book_sales);
  assert.equal(n(september.totals.legacy_combined), sept.source.totals.combined_deduction, "the combined Expenses figure is kept as one legacy deduction");
  assert.equal(n(september.totals.card), null, "no card/UPI split is invented");
  assert.equal(n(september.totals.cash_expenses), 0, "no expense categories are invented");
  const negative = sept.days.filter((item) => item.closing < 0).map((item) => item.date);
  assert.deepEqual(september.days.filter((item) => item.flags.includes("negative_closing")).map((item) => item.date), negative, "negative balances are kept and flagged");
  assert.ok(september.days.every((item) => item.counted === null && item.cash_difference === null), "no counted cash is invented");
  assert.equal(n(september.days[16].software.legacy_workbook), sept.days[16].software_sales);
  assert.equal(n(october.opening), sept.source.closing, "October opens with September's calculated closing");
  assert.equal(october.days[0].status, "missing", "a day with nothing entered is missing, not zero");
  assert.equal(october.days.length, 31);
  assert.equal(october.complete, false);
  if (sept.real) {
    assert.deepEqual([n(september.opening), n(september.closing), n(october.opening)], [56373, 36465, 36465]);
    assert.deepEqual(negative, ["2026-09-17", "2026-09-18", "2026-09-22"]);
    assert.deepEqual(september.days.filter((item) => item.flags.includes("workbook_software_outlier")).map((item) => item.date), ["2026-09-20", "2026-09-23"]);
  }
});

test("import refuses broken chains, wrong totals, overlaps and non-owners", () => {
  const broken = sept.days.map((item, index) => (index === 4 ? { ...item, closing: item.closing + 1 } : item));
  fails(`begin; ${as(owner)} select cash_book_import_legacy(${GP}, ${j(sept.source)}, ${j(broken)}, true); rollback;`, /is not the closing|does not equal/);
  fails(`begin; ${as(owner)} select cash_book_import_legacy(${GP}, ${j({ ...sept.source, totals: { ...sept.source.totals, book_sales: 1 } })}, ${j(sept.days)}, true); rollback;`, /Book Sales total/);
  fails(`begin; ${as(owner)} select cash_book_import_legacy(${GP}, ${j(sept.source)}, ${j(sept.days.slice(1))}, true); rollback;`, /Expected 30 days/);
  fails(`begin; ${as(owner)} select cash_book_set_start(${GP}, '2026-09-10', 100); select cash_book_save_day(${GP}, '2026-09-10', '{"book_sales":1}'); ${importSql(true)} rollback;`, /already has cash book days|already starts/);
  fails(`begin; ${as(manager)} ${importSql(true)} rollback;`, /Only the owner/);
  fails(`begin; ${as(accountant)} ${importSql(true)} rollback;`, /Only the owner/);
  // An October start the owner already set at the workbook closing joins the import.
  const joined = json(sql(`begin; ${as(owner)} select cash_book_set_start(${GP}, '2026-10-01', ${sept.source.closing}); ${importSql(true)} rollback;`));
  assert.equal(joined.start_action, "move_back");
});

const fill = (store, date, values) => `select cash_book_save_day(${store}, '${date}', ${j(values)});`;
const full = { book_sales: 1000, card: 0, upi: 0, counted: 0 };

test("month and year boundaries carry the calculated closing: Oct 31 -> Nov 1, Dec 31 -> Jan 1", () => {
  const out = sql(`begin; ${as(owner)}
select cash_book_set_start(${BM}, '2026-10-31', 1000);
${fill(BM, "2026-10-31", { book_sales: 5000, card: 1200, upi: 800, counted: 3990 })}
select cash_book_close(${BM}, '2026-10-31');
select cash_book_month(${BM}, '2026-11-01');
rollback;
begin; ${as(owner)}
select cash_book_set_start(${BM}, '2025-12-31', 500);
${fill(BM, "2025-12-31", { book_sales: 100, card: 0, upi: 0, counted: 600 })}
select cash_book_close(${BM}, '2025-12-31');
select cash_book_month(${BM}, '2025-12-01');
select cash_book_month(${BM}, '2026-01-01');
rollback;`).split("\n").filter((line) => line.startsWith("{"));
  const closeOct = JSON.parse(out[1]);
  assert.equal(n(closeOct.closing), 4000, "1000 + 5000 - 1200 - 800");
  assert.equal(n(closeOct.difference), -10);
  const november = JSON.parse(out[2]);
  assert.equal(n(november.opening), 4000);
  assert.equal(n(november.days[0].opening), 4000);
  const december = JSON.parse(out[5]);
  const january = JSON.parse(out[6]);
  assert.equal(december.complete, true, "every book day of December is closed");
  assert.equal(n(december.closing), 600);
  assert.equal(n(january.opening), 600, "the new year opens with 31 Dec's calculated closing");
  assert.equal(january.days[0].status, "missing");
});

test("only real calendar days are listed, including leap years", () => {
  const counts = sql(`begin; ${as(owner)}
select jsonb_array_length(cash_book_month(${BM}, '2024-02-15')->'days');
select jsonb_array_length(cash_book_month(${BM}, '2026-02-01')->'days');
select jsonb_array_length(cash_book_month(${BM}, '2028-02-01')->'days');
select jsonb_array_length(cash_book_month(${BM}, '2100-02-01')->'days');
select jsonb_array_length(cash_book_month(${BM}, '2026-04-30')->'days');
select cash_book_month(${BM}, '2026-02-01')->'days'->-1->>'date';
rollback;`).split("\n");
  assert.deepEqual(counts, ["29", "28", "29", "28", "30", "2026-02-28"]);
});

// Sales report fixtures for BM, July 2026.
const reports = `${asDb}
insert into reports(id,store_id,report_type,report_date,status,row_count,is_current) values
 ('c0000000-0000-0000-0000-000000000001',${BM},'sales','2026-07-01','processed',4,true),
 ('c0000000-0000-0000-0000-000000000002',${BM},'sales','2026-07-02','processed',2,true),
 ('c0000000-0000-0000-0000-000000000003',${BM},'sales','2026-07-03','processed',2,true),
 ('c0000000-0000-0000-0000-000000000004',${BM},'sales','2026-07-04','processed',0,true),
 ('c0000000-0000-0000-0000-000000000005',${BM},'sales','2026-07-05','uploaded',0,true);
insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,quantity,net_sale,raw_data) values
 ('c0000000-0000-0000-0000-000000000001',${BM},'2026-07-01','BM-1','Shirt',1,1000,'{}'),
 ('c0000000-0000-0000-0000-000000000001',${BM},'2026-07-01','BM-2','Jeans',1,500,'{}'),
 ('c0000000-0000-0000-0000-000000000001',${BM},'2026-07-01','BM-3','Shirt',-1,-300,'{}'),
 ('c0000000-0000-0000-0000-000000000001',${BM},'2026-07-01','BM-3','Shirt',null,null,'{}'),
 ('c0000000-0000-0000-0000-000000000002',${BM},'2026-07-02',null,null,2,700,'{}'),
 ('c0000000-0000-0000-0000-000000000002',${BM},'2026-07-02',null,null,1,300,'{}'),
 ('c0000000-0000-0000-0000-000000000003',${BM},'2026-07-03','BM-9','Belt',1,400,'{}'),
 ('c0000000-0000-0000-0000-000000000003',${BM},'2026-07-03',null,null,1,400,'{}');
insert into sales_day_confirmations(store_id,sale_date,confirmed_by) values(${BM},'2026-07-07','${owner}');`;

test("Software Sales: item lines with returns, summary-only, both kinds, real zero, processing, pending and confirmed zero", () => {
  const out = sql(`begin; ${reports}
select cash_book_software(${BM}, d::date) from generate_series('2026-07-01'::date, '2026-07-07', interval '1 day') d;
rollback;`).split("\n").filter(Boolean).map((line) => JSON.parse(line));
  assert.deepEqual(out.map((item) => [item.status, n(item.amount), item.basis]), [
    ["ready", 1200, "item"],          // 1000 + 500 - 300 return; blank return companion ignored
    ["ready", 1000, "summary"],
    ["ready", 400, "item"],            // never item + summary together
    ["ready", 0, "zero_report"],       // processed report with no sales lines = real zero
    ["processing", null, null],        // uploaded, not processed yet
    ["pending", null, null],           // nothing uploaded: not zero
    ["ready", 0, "zero_confirmed"],
  ]);
  assert.equal(out[2].summary_ignored, true);
});

test("Software Sales fills itself, Book Sales is never overwritten, closed days keep their figure and flag a replaced report", () => {
  const out = sql(`begin; ${reports}
${as(owner)}
select cash_book_set_start(${BM}, '2026-07-01', 1000);
${fill(BM, "2026-07-01", { book_sales: 1250, card: 0, upi: 0, counted: 2250 })}
select cash_book_close(${BM}, '2026-07-01');
${fill(BM, "2026-07-02", { book_sales: 990 })}
${asDb}
update reports set is_current=false where id in ('c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002');
insert into reports(id,store_id,report_type,report_date,status,row_count,is_current) values
 ('c0000000-0000-0000-0000-000000000011',${BM},'sales','2026-07-01','processed',1,true),
 ('c0000000-0000-0000-0000-000000000012',${BM},'sales','2026-07-02','processed',1,true);
insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,quantity,net_sale,raw_data) values
 ('c0000000-0000-0000-0000-000000000011',${BM},'2026-07-01','BM-1','Shirt',1,1500,'{}'),
 ('c0000000-0000-0000-0000-000000000012',${BM},'2026-07-02','BM-5','Cap',1,950,'{}');
${as(owner)}
select cash_book_day(${BM}, '2026-07-01');
select cash_book_day(${BM}, '2026-07-02');
${as(bmCashier)}
select cash_book_day(${BM}, '2026-07-02');
rollback;`).split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  const [closedRow, openRow, cashierRow] = out.slice(-3);
  assert.equal(n(closedRow.book_sales), 1250);
  assert.equal(n(closedRow.software.amount), 1200, "the closed day keeps the figure it was closed with");
  assert.equal(n(closedRow.software.report_amount), 1500, "the new report is shown beside it");
  assert.equal(closedRow.software.changed_after_close, true);
  assert.equal(n(closedRow.sales_difference), -50);
  assert.equal(n(openRow.software.amount), 950, "an open day follows the replaced report");
  assert.equal(n(openRow.book_sales), 990, "typed Book Sales is untouched");
  assert.equal(n(openRow.sales_difference), -40);
  assert.equal(cashierRow.software.amount, null, "cashiers see only whether the figures match");
  assert.equal(cashierRow.software.matches, false);
  assert.equal(cashierRow.sales_difference, null);
});

test("Software Sales correction: owner or granted accountant with a reason; history kept; restore; never on a closed day; never managers or cashiers", () => {
  const grant = (flags) => `${asDb} insert into finance_grants(user_id, store_id, can_view, ${Object.keys(flags).join(",")}) values ('${accountant}', ${BM}, false, ${Object.values(flags).join(",")});`;
  const base = `begin; ${reports} ${as(owner)} select cash_book_set_start(${BM}, '2026-07-01', 1000);`;
  const out = json(sql(`${base}
select cash_book_override_software(${BM}, '2026-07-01', 1180, 'Logic counted a cancelled bill');
select cash_book_restore_software(${BM}, '2026-07-01', 'Bill was valid after all');
select cash_book_override_software(${BM}, '2026-07-01', 1190, 'Exchange entered twice in Logic');
select cash_book_day(${BM}, '2026-07-01');
rollback;`));
  assert.equal(n(out.software.amount), 1190);
  assert.equal(out.software.status, "override");
  assert.equal(n(out.software.report_amount), 1200, "the report figure is kept");
  assert.equal(n(out.software.override.original), 1200);
  assert.equal(out.software.override.by, "Owner M");
  assert.equal(out.overrides.length, 2);
  assert.equal(out.overrides[1].restore_reason, "Bill was valid after all");
  assert.equal(sql(`${base} select cash_book_override_software(${BM}, '2026-07-01', 1, 'Testing the report'); ${asDb} select sum(net_sale) from sales_rows where report_id='c0000000-0000-0000-0000-000000000001'; rollback;`).split("\n").at(-1), "1200", "uploaded rows never change");
  fails(`${base} select cash_book_override_software(${BM}, '2026-07-01', 1180, 'no'); rollback;`, /Write why/);
  fails(`${base} ${as(manager)} select cash_book_override_software(${GP}, '${today}', 1, 'Manager tries this'); rollback;`, /Only the owner or an accountant/);
  fails(`${base} ${as(bmCashier)} select cash_book_override_software(${BM}, '2026-07-01', 1, 'Cashier tries this'); rollback;`, /Only the owner or an accountant/);
  fails(`${base} ${grant({ cash_book_enter: true })} ${as(accountant)} select cash_book_override_software(${BM}, '2026-07-01', 1, 'No override grant'); rollback;`, /Only the owner or an accountant/);
  const byAccountant = json(sql(`${base} ${grant({ cash_book_override: true })} ${as(accountant)} select cash_book_override_software(${BM}, '2026-07-01', 1100, 'Accountant matched the bill book'); rollback;`));
  assert.equal(n(byAccountant.software.amount), 1100);
  fails(`${base} ${fill(BM, "2026-07-01", { ...full, counted: 2200 })} select cash_book_close(${BM}, '2026-07-01');
select cash_book_override_software(${BM}, '2026-07-01', 1180, 'After closing'); rollback;`, /closed\. The owner must reopen/);
  fails(`${base} select cash_book_override_software(${BM}, '2026-07-01', 1180, 'Correction one');
${fill(BM, "2026-07-01", { ...full, counted: 2200 })} select cash_book_close(${BM}, '2026-07-01');
select cash_book_restore_software(${BM}, '2026-07-01'); rollback;`, /closed\. The owner must reopen/);
});

test("Card and UPI are separate buckets and never overlap the old combined EDC line", () => {
  const d = day(1);
  const base = `begin; ${as(owner)} select cash_book_set_start(${BM}, '${d}', 1000); ${as(bmCashier)}`;
  fails(`${base} select cash_book_add_entry(${BM}, '${d}', 'edc', 500); ${fill(BM, d, { card: 300 })} rollback;`, /old combined EDC/);
  fails(`${base} ${fill(BM, d, { upi: 300 })} select cash_book_add_entry(${BM}, '${d}', 'edc', 500); rollback;`, /counted twice|count them twice/);
  const row = json(sql(`${base} ${fill(BM, d, { book_sales: 10000, card: 3000, upi: 2500 })} rollback;`));
  assert.equal(n(row.noncash), 5500);
  assert.equal(n(row.closing), 1000 + 10000 - 5500);
  assert.deepEqual(row.missing, ["counted"]);
});

test("cash-paid expenses reduce the drawer; UPI/bank-paid ones are recorded once and do not; deposits are transfers", () => {
  const d = day(1);
  const out = sql(`begin; ${as(owner)} select cash_book_set_start(${BM}, '${d}', 1000); ${as(bmCashier)}
${fill(BM, d, { book_sales: 5000, card: 1000, upi: 1000 })}
select cash_book_add_entry(${BM}, '${d}', 'expense', 200, 'tea_snacks', null, null, null, 'Bill 17');
select cash_book_add_paid_expense(${BM}, '${d}', 'courier', 900, 'upi', 'Courier paid by UPI', 'UTR 123');
${fill(BM, d, { deposit: 1500 })}
select cash_book_day(${BM}, '${d}');
${fill(BM, d, { deposit: 0 })}
select cash_book_day(${BM}, '${d}');
${asDb} select count(*) from store_expenses where store_id=${BM} and paid_from='upi';
rollback;`).split("\n").filter(Boolean);
  const rows = out.filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  const [withDeposit, withoutDeposit] = rows.filter((row) => "entries" in row);
  assert.equal(n(withDeposit.cash_expenses), 200);
  assert.equal(n(withDeposit.bank_paid_expenses), 900, "shown for information");
  assert.equal(n(withDeposit.deposit), 1500);
  assert.equal(n(withDeposit.closing), 1000 + 5000 - 2000 - 200 - 1500, "the UPI-paid courier is not taken from the drawer");
  assert.equal(n(withoutDeposit.deposit), 0);
  assert.equal(n(withoutDeposit.closing), 1000 + 5000 - 2000 - 200);
  assert.equal(out.at(-1), "1", "one expense record, in Other expenses only");
});

test("accountants: nothing without a grant; view, entry and correction only as granted; no Accounts, reopen or import", () => {
  const d = day(1);
  const start = `begin; ${as(owner)} select cash_book_set_start(${GP}, '${d}', 1000);`;
  const grant = (scope, flags) => `${asDb} insert into finance_grants(user_id, ${scope ? "store_id," : ""} can_view, ${Object.keys(flags).join(",")}) values ('${accountant}', ${scope ? `${scope},` : ""} false, ${Object.values(flags).join(",")});`;
  fails(`${start} ${as(accountant)} select cash_book_month(${GP}, '${d}'); rollback;`, /Store access denied/);
  fails(`${start} ${as(accountant)} select cash_book_day(${GP}, '${d}'); rollback;`, /Store access denied/);
  assert.equal(sql(`${start} ${as(accountant)} select cash_book_stores(); rollback;`).split("\n").at(-1), "[]");

  const viewOnly = `${start} ${grant(GP, { cash_book_view: true })} ${as(accountant)}`;
  assert.equal(json(sql(`${viewOnly} select cash_book_month(${GP}, '${d}'); rollback;`)).access.enter, false);
  assert.equal(sql(`${viewOnly} select finance_any('view'), finance_store_visible(${GP}), finance_can('view', null, ${GP}); rollback;`).split("\n").at(-1), "f|f|f", "a cash book grant opens no Accounts data");
  fails(`${viewOnly} select cash_book_month(${BM}, '${d}'); rollback;`, /Store access denied/);
  fails(`${viewOnly} ${fill(GP, d, { book_sales: 10 })} rollback;`, /cannot change the cash book/);

  const enter = `${start} ${grant(GP, { cash_book_enter: true })} ${as(accountant)}`;
  const closed = json(sql(`${enter} ${fill(GP, d, { book_sales: 500, card: 0, upi: 0, counted: 1500 })} select cash_book_close(${GP}, '${d}'); rollback;`));
  assert.equal(n(closed.closing), 1500);
  fails(`${enter} ${fill(GP, d, { ...full })} select cash_book_close(${GP}, '${d}'); select cash_book_reopen_day(${GP}, '${d}', 'Accountant tries'); rollback;`, /Only the owner can reopen/);
  fails(`${enter} select cash_book_set_start(${GP}, '${d}', 5); rollback;`, /Only the owner sets/);
  fails(`${enter} select cash_book_override_software(${GP}, '${d}', 1, 'Without permission'); rollback;`, /Only the owner or an accountant/);
  fails(`${enter} select cash_book_review_day(${GP}, '${d}'); rollback;`, /Only the owner or the store manager/);
  // Older days too (no 3-day limit for a granted accountant), never the future.
  assert.ok(sql(`begin; ${as(owner)} select cash_book_set_start(${GP}, (india_today() - 20)::date, 1000); ${grant(GP, { cash_book_enter: true })} ${as(accountant)}
select cash_book_save_day(${GP}, (india_today() - 20)::date, '{"book_sales":1}'); rollback;`).includes('"book_sales": 1'));

  // Firm scope follows the store's billing firm on each date: Brand Mark is GP Fashion from 1 Oct 2026.
  const firm = sql("select id from billing_firms where name='GP Fashion';");
  const firmGrant = `begin; ${asDb} insert into finance_grants(user_id, firm_id, can_view, cash_book_view) values ('${accountant}', '${firm}', false, true); ${as(accountant)}`;
  assert.equal(json(sql(`${firmGrant} select cash_book_month(${BM}, '2026-10-01'); rollback;`)).days.length, 31);
  fails(`${firmGrant} select cash_book_month(${BM}, '2026-08-01'); rollback;`, /Store access denied/);
  fails(`${firmGrant} select cash_book_month(${GP}, '2026-10-01'); rollback;`, /Store access denied/);
  assert.match(sql(`${firmGrant} select cash_book_stores(); rollback;`), /Brand Mark/);
  // Revoked grants stop at once.
  fails(`${viewOnly} ${asDb} update finance_grants set revoked_at=now() where user_id='${accountant}'; ${as(accountant)} select cash_book_month(${GP}, '${d}'); rollback;`, /Store access denied/);
});

test("managers and cashiers keep their stores and the 3-day window; tables and helpers stay closed to direct access", () => {
  fails(`begin; ${as(owner)} select cash_book_set_start(${BM}, '${day(1)}', 1); ${as(cashier)} select cash_book_month(${BM}, '${day(1)}'); rollback;`, /Store access denied/);
  fails(`begin; ${as(owner)} select cash_book_set_start(${GP}, (india_today() - 6)::date, 1); ${as(manager)} ${fill(GP, day(6), { book_sales: 1 })} rollback;`, /Older days can be changed only by the owner/);
  fails(`begin; ${as(cashier)} select * from cash_book_software_overrides; rollback;`, /permission denied/);
  fails(`begin; ${as(accountant)} select * from cash_book_events; rollback;`, /permission denied/);
  fails(`begin; ${as(owner)} select cash_book_software(${GP}, '${today}'); rollback;`, /permission denied/);
  assert.equal(sql("select has_function_privilege('anon','public.cash_book_month(uuid,date)','EXECUTE') or has_function_privilege('authenticated','public.cash_book_refresh_from(uuid,date)','EXECUTE');"), "f");
});

test("duplicate submissions, required explicit zeros, unbroken chain and closed-day locks", () => {
  const [d1, d2] = [day(2), day(1)];
  const base = `begin; ${as(owner)} select cash_book_set_start(${BM}, '${d1}', 1000); ${as(bmCashier)}`;
  const key = "11111111-2222-3333-4444-555555555555";
  assert.equal(sql(`${base}
select cash_book_add_entry(${BM}, '${d1}', 'expense', 50, 'water', null, null, null, null, '${key}') = cash_book_add_entry(${BM}, '${d1}', 'expense', 50, 'water', null, null, null, null, '${key}');
select jsonb_array_length(cash_book_day(${BM}, '${d1}')->'entries'); rollback;`).split("\n").slice(-2).join(","), "t,1");
  fails(`${base} select cash_book_add_entry(${BM}, '${d1}', 'expense', 50, 'water', null, null, null, null, '${key}');
select cash_book_add_entry(${BM}, '${d1}', 'expense', 60, 'water', null, null, null, null, '${key}'); rollback;`, /already saved with different details/);
  fails(`${base} ${fill(BM, d1, { book_sales: 100, counted: 1100 })} select cash_book_close(${BM}, '${d1}'); rollback;`, /Fill in before closing: Card, UPI/);
  fails(`${base} ${fill(BM, d1, { book_sales: 100, card: 0, upi: 0 })} select cash_book_close(${BM}, '${d1}'); rollback;`, /Counted cash/);
  fails(`${base} ${fill(BM, d1, { book_sales: "" })} select cash_book_close(${BM}, '${d1}'); rollback;`, /Book Sales/);
  fails(`${base} ${fill(BM, d1, { book_sales: "12.345" })} rollback;`, /up to 2 decimals/);
  fails(`${base} ${fill(BM, d1, { book_sales: -5 })} rollback;`, /0 or more/);
  fails(`${base} ${fill(BM, d2, full)} select cash_book_close(${BM}, '${d2}'); rollback;`, /Close .* first/);
  fails(`${base} ${fill(BM, d1, full)} select cash_book_close(${BM}, '${d1}'); select cash_book_close(${BM}, '${d1}'); rollback;`, /already closed/);
  fails(`${base} ${fill(BM, d1, full)} select cash_book_close(${BM}, '${d1}'); ${fill(BM, d1, { book_sales: 5 })} rollback;`, /This day is closed/);
  fails(`${base} ${fill(BM, d1, full)} select cash_book_close(${BM}, '${d1}'); select cash_book_add_entry(${BM}, '${d1}', 'donation', 5); rollback;`, /This day is closed/);
  fails(`${base} ${fill(BM, d1, full)} select cash_book_close(${BM}, '${d1}'); ${as(manager)} select cash_book_reopen_day(${BM}, '${d1}', 'Manager reopen'); rollback;`, /Only the owner/);
  fails(`${base} ${fill(BM, d1, full)} select cash_book_close(${BM}, '${d1}'); ${as(owner)} select cash_book_reopen_day(${BM}, '${d1}'); rollback;`, /Write why/);
  fails(`${base} ${fill(BM, d1, { book_sales: 1 })} select cash_book_save_day(${BM}, '${d1}', '{"card":0}', 0); rollback;`, /Someone else changed this day/);
  fails(`${base} ${fill(BM, d1, full)} select cash_book_close(${BM}, '${d1}', 0); rollback;`, /Someone else changed this day/);
  fails(`${base} select cash_book_add_entry(${BM}, '${d1}', 'adjustment_out', 50, null, 'Shortage written off'); rollback;`, /Only the owner can record a cash adjustment/);
  fails(`${base} ${as(owner)} select cash_book_add_entry(${BM}, '${d1}', 'adjustment_out', 50, null, 'x'); rollback;`, /reason for the adjustment/);
  fails(`${base} ${fill(BM, today, full)} select cash_book_save_day(${BM}, (india_today() + 1)::date, '{"book_sales":1}'); rollback;`, /cannot change the cash book/);
});

test("a correction to an earlier day flows into later open days; closed later days block it; every step is recorded", () => {
  const [d1, d2] = [day(2), day(1)];
  const out = sql(`begin; ${as(owner)} select cash_book_set_start(${BM}, '${d1}', 1000);
${fill(BM, d1, { book_sales: 2000, card: 500, upi: 500, counted: 2000 })}
select cash_book_close(${BM}, '${d1}');
${fill(BM, d2, { book_sales: 300 })}
select (cash_book_day(${BM}, '${d2}')->>'opening');
select cash_book_reopen_day(${BM}, '${d1}', 'Book Sales was typed 100 short');
select (cash_book_day(${BM}, '${d2}')->>'opening') is null;
${fill(BM, d1, { book_sales: 2100 })}
select (cash_book_day(${BM}, '${d2}')->>'opening');
select cash_book_close(${BM}, '${d1}');
select (cash_book_day(${BM}, '${d2}')->>'opening'), (cash_book_day(${BM}, '${d2}')->>'cash_difference');
${asDb} select string_agg(action || coalesce(':' || reason, ''), ',' order by id) from cash_book_events where store_id=${BM} and book_date='${d1}';
rollback;`).split("\n").filter((line) => line && !line.startsWith("{"));
  assert.equal(out[out.length - 4], "f", "while the earlier day is reopened the later day still has a known opening");
  assert.equal(out[out.length - 5], "2000.00", "opening = previous calculated closing (2000 counted, 2000 calculated)");
  assert.equal(out[out.length - 3], "2100.00", "the later open day follows the correction at once");
  assert.equal(out[out.length - 2], "2100.00|", "still open: no cash difference until counted");
  assert.match(out.at(-1), /^set_start,save,close,reopen:Book Sales was typed 100 short,save,close$/);
  fails(`begin; ${as(owner)} select cash_book_set_start(${BM}, '${d1}', 1000);
${fill(BM, d1, full)} select cash_book_close(${BM}, '${d1}'); ${fill(BM, d2, full)} select cash_book_close(${BM}, '${d2}');
select cash_book_reopen_day(${BM}, '${d1}', 'Old correction'); rollback;`, /Later days are closed/);
});

test("monthly totals add movements; opening and closing are balances, not sums; shortages stay visible", () => {
  const [d1, d2] = [day(2), day(1)];
  const month = json(sql(`begin; ${as(owner)} select cash_book_set_start(${BM}, '${d1}', 1000);
${fill(BM, d1, { book_sales: 2000, card: 300, upi: 200, counted: 2400, deposit: 100 })}
select cash_book_add_entry(${BM}, '${d1}', 'expense', 40, 'tea_snacks');
select cash_book_add_entry(${BM}, '${d1}', 'owner', 160, null, 'Adib');
select cash_book_close(${BM}, '${d1}');
${fill(BM, d2, { book_sales: 1000, card: 100, upi: 100, counted: 3000 })}
select cash_book_add_entry(${BM}, '${d2}', 'cash_in', 50, null, 'Old customer balance');
select cash_book_close(${BM}, '${d2}');
select cash_book_month(${BM}, '${d2}');
rollback;`));
  // d1: 1000 + 2000 - 500 - 100 - 40 - 160 = 2200 (counted 2400: +200)
  // d2: 2200 + 1000 - 200 + 50 = 3050 (counted 3000: -50)
  const rows = month.days.filter((item) => item.status === "closed");
  if (rows.length === 2) {
    assert.deepEqual(rows.map((item) => [n(item.opening), n(item.closing), n(item.cash_difference)]), [[1000, 2200, 200], [2200, 3050, -50]]);
    assert.equal(n(month.totals.book_sales), 3000);
    assert.equal(n(month.totals.card), 400);
    assert.equal(n(month.totals.upi), 300);
    assert.equal(n(month.totals.deposit), 100);
    assert.equal(n(month.totals.cash_expenses), 40);
    assert.equal(n(month.totals.other_net), -110);
    assert.equal(n(month.totals.cash_difference), 150, "shortage and excess are both shown, never plugged");
    assert.equal(n(month.closing), 3050, "closing is the last closed day's balance");
    assert.equal(month.complete, month.to < month.today, "complete only once the month is over and every day from the start is closed");
  } else {
    // The two days straddle a month boundary: the later month opens with the earlier closing.
    assert.equal(rows.length, 1);
    assert.equal(n(month.opening), 2200);
  }
});

test("an owner-stated correction of a workbook typing error is kept with the import and changes no balance", () => {
  const day20 = sept.days.findIndex((item) => item.date === "2026-09-20");
  const before = sept.days[day20].software_sales;
  const after = sept.real ? 122594 : before - 1000;
  const days = sept.days.map((item, index) => (index === day20 ? { ...item, software_sales: after } : item));
  const correction = { date: "2026-09-20", field: "software_sales", workbook_value: before, corrected_value: after, reason: "Staff typed an extra 2" };
  const source = { ...sept.source, corrections: [correction],
    totals: { ...sept.source.totals, software_sales: sept.source.totals.software_sales - before + after, software_sales_workbook: sept.source.totals.software_sales } };
  const out = sql(`begin; ${as(owner)}
select cash_book_import_legacy(${GP}, ${j(source)}, ${j(days)}, false);
select cash_book_day(${GP}, '2026-09-20');
select cash_book_month(${GP}, '2026-09-01');
rollback;`).split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  const [imported, row, month] = out;
  assert.equal(imported.status, "imported");
  assert.equal(n(row.software.legacy_workbook), after);
  assert.ok(row.flags.includes("workbook_corrected"));
  assert.match(row.note, new RegExp(`corrected from ${before} to ${after}: Staff typed an extra 2`));
  assert.equal(n(month.closing), sept.source.closing, "balances are unchanged");
  if (sept.real) {
    assert.equal(n(row.book_sales) - after, 135445 - 122594);
    assert.ok(!row.flags.includes("workbook_software_outlier"));
  }
  fails(`begin; ${as(owner)} select cash_book_import_legacy(${GP}, ${j({ ...source, corrections: [{ ...correction, field: "book_sales" }] })}, ${j(days)}, true); rollback;`, /Only Software Sales/);
  fails(`begin; ${as(owner)} select cash_book_import_legacy(${GP}, ${j({ ...source, corrections: [{ ...correction, reason: "" }] })}, ${j(days)}, true); rollback;`, /write the reason/);
  fails(`begin; ${as(owner)} select cash_book_import_legacy(${GP}, ${j({ ...source, corrections: [{ ...correction, corrected_value: 5 }] })}, ${j(days)}, true); rollback;`, /does not match the day sent/);
});

test("owner corrects September: reopen from a day with one reason, edit, close the ready days in order; later balances follow", () => {
  const out = sql(`begin; ${as(owner)}
${importSql(false)}
select cash_book_reopen_from(${GP}, '2026-09-20', 'Recheck of the September book');
select cash_book_month(${GP}, '2026-09-01');
select cash_book_save_day(${GP}, '2026-09-20', '{"book_sales": ${sept.days[19].book_sales + 100}}');
select cash_book_month(${GP}, '2026-10-01');
select cash_book_close_through(${GP}, '2026-09-30');
select cash_book_month(${GP}, '2026-09-01');
select cash_book_day(${GP}, '2026-09-20');
${asDb} select count(*) from cash_book_events where store_id=${GP} and action='reopen' and reason like 'Recheck of the September book%';
rollback;`).split("\n").filter(Boolean);
  const json = out.filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  const [, reopenedMonth, , october, closedThrough, september, day20] = json;
  assert.equal(out[1], "11", "20 to 30 September reopened");
  assert.equal(reopenedMonth.days.filter((item) => item.status === "open").length, 11);
  assert.equal(reopenedMonth.complete, false);
  assert.equal(n(october.opening), sept.source.closing + 100, "October's opening follows the correction at once");
  assert.deepEqual([closedThrough.closed, closedThrough.stopped_at], [11, null]);
  assert.equal(september.complete, true);
  assert.equal(n(september.closing), sept.source.closing + 100);
  assert.equal(day20.software.status, "workbook", "the imported day keeps its workbook Software Sales through the reopen");
  assert.equal(n(day20.software.amount), sept.days[19].software_sales);
  assert.ok(day20.reopen_reason.startsWith("Recheck of the September book"));
  assert.equal(out.at(-1), "11", "the reason is recorded on every reopened day");
  fails(`begin; ${as(owner)} ${importSql(false)} ${as(manager)} select cash_book_reopen_from(${GP}, '2026-09-20', 'Manager tries'); rollback;`, /Only the owner/);
  fails(`begin; ${as(owner)} ${importSql(false)} select cash_book_reopen_from(${GP}, '2026-09-20', 'no'); rollback;`, /Write why/);
  // Close-through stops at the first day that is not ready and says why.
  const stop = json.length ? JSON.parse(last(sql(`begin; ${as(owner)} select cash_book_set_start(${BM}, '${day(2)}', 100);
${fill(BM, day(2), full)} ${fill(BM, day(1), { book_sales: 5 })} select cash_book_close_through(${BM}, '${day(1)}'); rollback;`))) : null;
  assert.equal(stop.closed, 1);
  assert.equal(stop.stopped_at, day(1));
  assert.match(stop.reason, /Fill in before closing/);
});

test("imported days show the workbook Software Sales and flag where the uploaded report differs", () => {
  const out = sql(`begin; ${asDb}
insert into reports(id,store_id,report_type,report_date,status,row_count,is_current) values ('c0000000-0000-0000-0000-0000000000a1',${GP},'sales','2026-09-25','processed',1,true);
insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,quantity,net_sale,raw_data) values ('c0000000-0000-0000-0000-0000000000a1',${GP},'2026-09-25','GP-1','Shirt',1,31974,'{}');
${as(owner)} ${importSql(false)}
select cash_book_day(${GP}, '2026-09-25');
select cash_book_month(${GP}, '2026-09-01');
rollback;`).split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  const [, day25, month] = out;
  assert.equal(day25.software.status, "workbook");
  assert.equal(n(day25.software.amount), sept.days[24].software_sales);
  assert.equal(n(day25.software.report_amount), 31974);
  assert.equal(day25.software.report_differs, Math.abs(sept.days[24].software_sales - 31974) > 1);
  assert.equal(n(day25.sales_difference), sept.days[24].software_sales - sept.days[24].book_sales);
  assert.equal(n(month.totals.software_sales), sept.source.totals.software_sales, "September's Software Sales total is the workbook's");
});

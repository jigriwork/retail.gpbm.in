import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const fails = (q, pattern) => assert.throws(() => sql(q), pattern);

const owner = "00000000-0000-0000-0000-0000000000b1";
const cashier = "00000000-0000-0000-0000-0000000000b2";
const manager = "00000000-0000-0000-0000-0000000000b3";
sql(`insert into auth.users(id,email) values ('${owner}','cb-owner@example.invalid'),('${cashier}','cb-cashier@example.invalid'),('${manager}','cb-manager@example.invalid') on conflict do nothing;
update profiles set role='owner', is_active=true, full_name='Owner' where id='${owner}';
update profiles set role='cashier', is_active=true, full_name='Cashier' where id='${cashier}';
update profiles set role='manager', is_active=true, full_name='Manager' where id='${manager}';
insert into store_users(user_id, store_id) select '${cashier}', id from stores where code='BM' and not exists (select 1 from store_users where user_id='${cashier}');
insert into store_users(user_id, store_id) select '${manager}', id from stores where code='BM' and not exists (select 1 from store_users where user_id='${manager}');`);

const as = (id) => `set local request.jwt.claim.sub='${id}'; set local role authenticated;`;
// Store ids looked up as the database owner (a cashier cannot read other stores).
const BM = `'${sql("select id from stores where code='BM';")}'::uuid`;
const GP = `'${sql("select id from stores where code='GP';")}'::uuid`;
// Results only: entry ids and empty lines from the setup calls are dropped.
const results = (out) => out.split("\n").filter((line) => line && !/^[0-9a-f-]{36}$/.test(line));
// The last three days, so cashier and manager may work on them (3-day window).
const today = sql("select india_today();");
const day = (n) => sql(`select (india_today() - ${n})::text;`);
const [d1, d2, d3] = [day(3), day(2), day(1)];

// Brand Mark's paper book of 2-4 Oct 2026, on the three days before today.
const book = `
${as(owner)}
select cash_book_set_start(${BM}, '${d1}', 8148);
${as(cashier)}
select cash_book_add_entry(${BM}, '${d1}', 'edc', 44373);
select cash_book_add_entry(${BM}, '${d1}', 'expense', 340, 'tea_snacks');
select cash_book_add_entry(${BM}, '${d1}', 'expense', 100, 'food', 'Tiffin');
select cash_book_add_entry(${BM}, '${d1}', 'expense', 40, 'other', 'Shop exp');
select cash_book_add_entry(${BM}, '${d1}', 'owner', 2000, null, 'Adib');
select cash_book_close_day(${BM}, '${d1}', 46607, 7902)->>'difference';
select cash_book_add_entry(${BM}, '${d2}', 'edc', 27986);
select cash_book_add_entry(${BM}, '${d2}', 'expense', 1840, 'courier', 'Adib courier');
select cash_book_add_entry(${BM}, '${d2}', 'donation', 10);
select cash_book_add_entry(${BM}, '${d2}', 'expense', 40, 'other', 'Shop exp');
select cash_book_add_entry(${BM}, '${d2}', 'expense', 310, 'tea_snacks');
select cash_book_add_entry(${BM}, '${d2}', 'expense', 3700, 'security', 'Outside guard salary');
select cash_book_add_entry(${BM}, '${d2}', 'expense', 4700, 'marketing', 'Social media (Adib)');
select cash_book_add_entry(${BM}, '${d2}', 'expense', 50, 'pooja', 'Agarbatti');
select cash_book_close_day(${BM}, '${d2}', 34207, 3473)->>'closing';
select cash_book_add_entry(${BM}, '${d3}', 'edc', 71652);
select cash_book_add_entry(${BM}, '${d3}', 'expense', 336, 'tea_snacks');
select cash_book_add_entry(${BM}, '${d3}', 'expense', 140, 'water');
select cash_book_add_entry(${BM}, '${d3}', 'expense', 350, 'transport', 'Sai Vamsi rickshaw');
select cash_book_add_entry(${BM}, '${d3}', 'expense', 1540, 'courier', 'Adib courier');
select cash_book_add_entry(${BM}, '${d3}', 'expense', 3000, 'staff_room', 'Sharukh room rent');
select cash_book_add_entry(${BM}, '${d3}', 'staff_payment', 1000, null, 'Runu salary');
select cash_book_add_entry(${BM}, '${d3}', 'expense', 20, 'other', 'Shop exp');
select cash_book_add_entry(${BM}, '${d3}', 'owner', 700, null, 'Adib');
select cash_book_add_entry(${BM}, '${d3}', 'home', 5000, null, 'I.B (Home)');
select cash_book_add_entry(${BM}, '${d3}', 'donation', 1500, null, 'Sept Sadqa');
`;

test("the paper book of 2-4 Oct gives the same CB; next day opens with the counted cash; shortage shown", () => {
  const out = results(sql(`begin; ${book}
select cash_book_close_day(${BM}, '${d3}', 122077, 40112)::text;
select (cash_book_day(${BM}, '${today}')->>'opening');
rollback;`));
  assert.equal(out[0], "0.00", "2 Oct: counted 7,902 equals CB");
  assert.equal(out[1], "3473.00", "3 Oct CB");
  const closed = JSON.parse(out[2]);
  assert.deepEqual([Number(closed.closing), Number(closed.counted), Number(closed.difference)], [40312, 40112, -200]);
  assert.equal(out[3], "40112.00", "today opens with the counted cash");
});

test("cash sent to the other store waits there until received; summary facts carry the cash book", () => {
  const out = results(sql(`begin; ${book}
${as(owner)}
select cash_book_set_start(${GP}, '${d3}', 1000);
select cash_book_add_entry(${GP}, '${d3}', 'to_store', 500, null, 'Change for BM', null, ${BM});
${as(cashier)}
select jsonb_array_length(cash_book_day(${BM}, '${d3}')->'incoming');
select cash_book_receive_transfer((select (cash_book_day(${BM}, '${d3}')->'incoming'->0->>'id')::uuid), '${d3}') is not null;
select cash_book_close_day(${BM}, '${d3}', 122077, 40612)->>'closing';
reset role;
select owner_daily_summary_facts('${d3}')->'stores';
rollback;`));
  const [incoming, received, closing, facts] = out.slice(-4);
  assert.equal(incoming, "1");
  assert.equal(received, "t");
  assert.equal(closing, "40812.00", "40,312 + 500 received");
  const bm = JSON.parse(facts).find((s) => s.code === "BM");
  assert.equal(bm.cash.status, "closed");
  assert.deepEqual([Number(bm.cash.book), Number(bm.cash.counted), bm.cash.deposit], [40812, 40612, false]);
});

test("rules: days close in order, 3-day window, own entries, owner-only reopen, no Logic figure for the cashier", () => {
  const base = `begin; ${as(owner)} select cash_book_set_start(${BM}, '${d1}', 8148); ${as(cashier)}`;
  fails(`${base} select cash_book_add_entry(${BM}, '${d2}', 'edc', 10); rollback;`, /Close .* first/);
  fails(`begin; ${as(owner)} select cash_book_set_start(${BM}, (india_today() - 10)::date, 8148); ${as(cashier)} select cash_book_add_entry(${BM}, (india_today() - 10)::date, 'edc', 10); rollback;`, /Older days can be changed only by the owner/);
  fails(`${base} select cash_book_add_entry(${BM}, '${d1}', 'expense', 10); rollback;`, /expense type/);
  fails(`${base} select cash_book_add_entry(${BM}, '${d1}', 'other_out', 10); rollback;`, /what this money was for/);
  fails(`${base} ${as(owner)} select cash_book_add_entry(${BM}, '${d1}', 'edc', 10) as e \\gset
${as(cashier)} select cash_book_delete_entry(:'e'); rollback;`, /Only the person who entered it/);
  assert.equal(sql(`${base} select cash_book_add_entry(${BM}, '${d1}', 'edc', 10) as e \\gset
${as(manager)} select cash_book_delete_entry(:'e'); select jsonb_array_length(cash_book_day(${BM}, '${d1}')->'entries'); rollback;`), "0");
  fails(`${base} select cash_book_close_day(${BM}, '${d1}', 100, 100); select cash_book_reopen_day(${BM}, '${d1}'); rollback;`, /Only the owner can reopen/);
  fails(`${base} select cash_book_close_day(${BM}, '${d1}', 100, 100); select cash_book_add_entry(${BM}, '${d1}', 'edc', 10); rollback;`, /This day is closed/);
  fails(`${base} select cash_book_close_day(${BM}, '${d1}', 100, 100); select cash_book_close_day(${BM}, '${d2}', 100, 100);
${as(owner)} select cash_book_reopen_day(${BM}, '${d1}'); rollback;`, /Later days are closed/);
  assert.equal(sql(`${base} select cash_book_day(${BM}, '${d1}') ? 'report_sale', cash_book_day(${BM}, '${d1}')->'report_sale'; rollback;`), "t|null");
  fails(`begin; ${as(cashier)} select cash_book_day(${GP}, '${d1}'); rollback;`, /Store access denied/);
});

test("cashier: sees and edits own store's staff, cannot remove or move them; functions are not public", () => {
  const setup = `begin; insert into employee_contacts(store_id, staff_name, normalized_staff_name, is_active) values (${BM}, 'RUNU', 'runu', true) returning id as emp \\gset
`;
  assert.equal(sql(`${setup} ${as(cashier)} update employee_contacts set notes='night shift' where id=:'emp'; select notes from employee_contacts where id=:'emp'; rollback;`), "night shift");
  fails(`${setup} ${as(cashier)} update employee_contacts set is_active=false where id=:'emp'; rollback;`, /Only the owner or the manager/);
  assert.equal(sql(`${setup} ${as(cashier)} select count(*) from employee_contacts where store_id=${GP}; rollback;`), "0");
  assert.equal(sql("select has_function_privilege('anon','public.cash_book_day(uuid,date)','EXECUTE') or has_function_privilege('authenticated','public.cash_book_open_day(uuid,date)','EXECUTE');"), "f");
  fails(`begin; ${as(cashier)} select * from cash_book_days; rollback;`, /permission denied/);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const owner = "00000000-0000-0000-0000-0000000000f1";
const cashier = "00000000-0000-0000-0000-0000000000f2";
sql(`insert into auth.users(id,email) values ('${owner}','ws-owner@example.invalid'),('${cashier}','ws-cashier@example.invalid') on conflict do nothing;
update profiles set role='owner', is_active=true where id='${owner}';
update profiles set role='cashier', is_active=true where id='${cashier}';
insert into store_users(user_id, store_id) select '${cashier}', id from stores where code='GP' and not exists (select 1 from store_users where user_id='${cashier}');`);
const month = sql("select (date_trunc('month', india_today()) - interval '1 month')::date;");
const day = (n) => sql(`select ('${month}'::date + ${n - 1})::text;`);
const as = (id) => `set local request.jwt.claim.sub='${id}'; set local role authenticated;`;

// One stock upload: begin, stage 3 rows, publish in parts, commit. Prints the commit result.
const upload = (fp, stockDate, qty) => `
${as(owner)}
select begin_report_import((select id from stores where code='GP'),'stock',repeat('${fp}',64),'GP STOCK.xlsx',jsonb_build_array(jsonb_build_object('date','${month}','stock_date','${stockDate}','row_count',3,'summary','{}'::jsonb)),'stop',false) run \\gset
select :'run'::jsonb->>'id' id,:'run'::jsonb->>'file_path' path \\gset
reset role; insert into storage.objects(bucket_id,name) values('reports',:'path');
insert into report_import_chunks(import_id,chunk_no,rows) select :'id'::uuid, 0, jsonb_agg(jsonb_build_object('logical_date','${month}','item_name','ITEM '||i,'quantity',${qty},'raw_data',jsonb_build_object('LOT CODE','W'||i))) from generate_series(1,3) i;
${as(owner)}
select publish_stock_import_part(:'id')->>'ok';
select commit_stock_report_import(:'id')->>'message';
reset role;
`;
const current = "select report_date::text || '|' || (select coalesce(sum(quantity),0) from stock_rows k where k.report_id = r.id) from reports r where r.store_id=(select id from stores where code='GP') and r.report_type='stock' and r.period_month='" + month + "' and r.is_current;";

test("weekly stock: a newer stock of the month replaces the current one (kept as history); an older one is refused", () => {
  const out = sql(`begin;
${upload("a", day(3), 5)}
${current}
${upload("b", day(10), 4)}
${current}
select count(*) from reports where store_id=(select id from stores where code='GP') and report_type='stock' and period_month='${month}';
${upload("c", day(6), 9)}
${current}
rollback;`).split("\n").filter(Boolean);
  assert.deepEqual(out.slice(0, 3), ["true", "Import processed. Original evidence retained.", `${day(3)}|15`]);
  assert.equal(out[3], "true");
  assert.match(out[4], /uploaded; it replaces the stock of .* \(kept as history\)/);
  assert.equal(out[5], `${day(10)}|12`, "the 10th is now current");
  assert.equal(out[6], "2", "the 3rd is kept");
  assert.equal(out[7], "false", "older stock refused at the first part");
  assert.equal(out.at(-1), `${day(10)}|12`, "current unchanged");
});

test("count totals: expected pieces for the owner, hidden from a counting cashier", () => {
  const out = sql(`begin;
insert into stock_counts(id, store_id, title, status, created_by) values ('f0000000-0000-0000-0000-00000000c0c0', (select id from stores where code='GP'), 'UCB', 'counting', '${owner}');
insert into stock_count_lines(count_id, lot_code, item_name, expected_qty, counted_qty) values
  ('f0000000-0000-0000-0000-00000000c0c0','L1','A',3,2), ('f0000000-0000-0000-0000-00000000c0c0','L2','B',5,null);
${as(owner)} select stock_count_totals('f0000000-0000-0000-0000-00000000c0c0');
${as(cashier)} select stock_count_totals('f0000000-0000-0000-0000-00000000c0c0');
rollback;`).split("\n").filter(Boolean);
  const [ownerView, cashierView] = out.map((line) => JSON.parse(line));
  assert.deepEqual([ownerView.items, Number(ownerView.expected), Number(ownerView.counted)], [2, 8, 2]);
  assert.deepEqual([cashierView.items, cashierView.expected, Number(cashierView.counted)], [2, null, 2]);
});

test("delete a stock count: counting ones by store staff (logged); submitted ones only by the owner", () => {
  const seed = `begin;
insert into stock_counts(id, store_id, title, status, created_by) values
  ('f0000000-0000-0000-0000-00000000d0d1', (select id from stores where code='GP'), '3 CONCEPT', 'counting', '${owner}'),
  ('f0000000-0000-0000-0000-00000000d0d2', (select id from stores where code='GP'), 'Done count', 'submitted', '${owner}');
insert into stock_count_lines(count_id, lot_code, item_name, expected_qty) values ('f0000000-0000-0000-0000-00000000d0d1','L1','A',2);`;
  assert.equal(sql(`${seed}
${as(cashier)} select delete_stock_count('f0000000-0000-0000-0000-00000000d0d1');
reset role; select (select count(*) from stock_counts where id='f0000000-0000-0000-0000-00000000d0d1') || '|' || (select count(*) from audit_logs where action='stock_count_deleted' and entity_id='f0000000-0000-0000-0000-00000000d0d1');
rollback;`).split("\n").filter(Boolean).at(-1), "0|1");
  assert.throws(() => sql(`${seed} ${as(cashier)} select delete_stock_count('f0000000-0000-0000-0000-00000000d0d2'); rollback;`), /Only the owner can delete a submitted count/);
  assert.equal(sql(`${seed} ${as(owner)} select delete_stock_count('f0000000-0000-0000-0000-00000000d0d2'); reset role; select count(*) from stock_counts where id='f0000000-0000-0000-0000-00000000d0d2'; rollback;`).split("\n").filter(Boolean).at(-1), "0");
});

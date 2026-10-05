import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

test("background rebuild needs no signed-in person, rebuilds once per change, and is not callable by users", () => {
  const GP = `'${sql("select id from stores where code='GP';")}'::uuid`;
  const out = sql(`begin;
insert into reports(id, store_id, report_type, report_date, period_month, status, row_count, is_current) values ('f0000000-0000-0000-0000-0000000000b9', ${GP}, 'stock', india_today() - 1, date_trunc('month', india_today())::date, 'processed', 1, true);
insert into stock_rows(report_id, store_id, stock_month, item_name, quantity, mrp, raw_data) values ('f0000000-0000-0000-0000-0000000000b9', ${GP}, date_trunc('month', india_today())::date, 'BG ITEM', 4, 999, '{"LOT CODE":"BG1"}'::jsonb);
select public.refresh_stock_position_system(${GP});
select public.refresh_stock_position_system(${GP});
select on_hand from stock_position_cache where store_id = ${GP} and lot_code = 'BG1';
rollback;`).split("\n").filter(Boolean);
  assert.deepEqual(out, ["t", "f", "4"]);
  assert.equal(sql("select has_function_privilege('authenticated','public.refresh_all_stock_positions_system()','EXECUTE') or has_function_privilege('authenticated','public.refresh_stock_position_system(uuid)','EXECUTE');"), "f");
});

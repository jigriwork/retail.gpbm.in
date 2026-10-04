import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// Fixed disposable database (scripts/test-accounts-local.mjs); never production.
const args = ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = text => execFileSync("psql", args, { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const as = actor => `reset role; set local request.jwt.claim.sub=${quote(actor)}; set local request.jwt.claim.role='authenticated'; set local role authenticated;`;
const owner = "e0000000-0000-0000-0000-000000000001";
const gpManager = "e0000000-0000-0000-0000-000000000003";
const bmManager = "e0000000-0000-0000-0000-000000000004";
const people = [[owner, "owner"], [gpManager, "manager"], [bmManager, "manager"]];
const gp = sql("select id from stores where code='GP'");
const bm = sql("select id from stores where code='BM'");
sql(`insert into auth.users(id,email) values ${people.map(([id], i) => `(${quote(id)},'incentive-${i}@example.invalid')`).join(",")} on conflict(id) do nothing;
update profiles set role=v.role,is_active=true from (values ${people.map(([id, role]) => `(${quote(id)}::uuid,${quote(role)})`).join(",")}) v(id,role) where profiles.id=v.id;
insert into store_users(store_id,user_id) values(${quote(gp)},${quote(gpManager)}),(${quote(bm)},${quote(bmManager)}) on conflict do nothing;`);
const scheme = (store) => `insert into incentive_schemes(store_id,name,valid_from,basis,payout,slabs) values(${store ? quote(store) : "null"},'Scheme','2026-10-01','sales_amount','whole','[{"from":0,"rate":1}]')`;

test("only the owner sets schemes; managers read their store's and all-store schemes", () => {
  assert.throws(() => sql(`begin; ${as(gpManager)} ${scheme(gp)}; rollback;`), /row-level security/);
  const out = sql(`begin; ${as(owner)} ${scheme(gp)}; ${scheme(bm)}; ${scheme(null)};
    ${as(gpManager)} select count(*) from incentive_schemes; ${as(bmManager)} select count(*) from incentive_schemes where store_id = ${quote(gp)}; rollback;`);
  assert.deepEqual(out.split("\n").filter(Boolean), ["2", "0"]);
});

test("the owner and the store's managers set that store's staff targets", () => {
  sql(`begin; ${as(gpManager)} insert into staff_targets(store_id,month,staff_name,target) values(${quote(gp)},'2026-10-01','MD RAHIM',300000); rollback;`);
  assert.throws(() => sql(`begin; ${as(gpManager)} insert into staff_targets(store_id,month,staff_name,target) values(${quote(bm)},'2026-10-01','ROJI',100000); rollback;`), /row-level security/);
  assert.equal(sql(`begin; ${as(owner)} insert into staff_targets(store_id,month,staff_name,target) values(${quote(bm)},'2026-10-01','ROJI',100000);
    ${as(gpManager)} select count(*) from staff_targets; rollback;`).split("\n").filter(Boolean).at(-1), "0");
});

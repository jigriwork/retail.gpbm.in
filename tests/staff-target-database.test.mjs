import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const last = (out) => out.split("\n").filter(Boolean).at(-1);
const owner = "00000000-0000-0000-0000-000000000091";
const staffUser = "00000000-0000-0000-0000-000000000092";
const BM = `'${sql("select id from stores where code='BM';")}'::uuid`;
const as = (id) => `set local request.jwt.claim.sub='${id}'; set local role authenticated;`;

// The manager set the target under the sales-bill name "Puja ( Roji )"; the staff list calls her "PUJA".
const seed = `begin;
insert into auth.users(id,email) values ('${owner}','tg-owner@example.invalid'),('${staffUser}','tg-staff@example.invalid') on conflict do nothing;
update profiles set role='owner', is_active=true where id='${owner}';
update profiles set role='staff', is_active=true where id='${staffUser}';
insert into employee_contacts(id, store_id, staff_name, normalized_staff_name, is_active) values ('f5000000-0000-0000-0000-000000000001', ${BM}, 'PUJA', 'puja', true);
insert into employee_auth_links(employee_contact_id, auth_user_id, store_id, login_email, approved_by) values ('f5000000-0000-0000-0000-000000000001', '${staffUser}', ${BM}, 'tg-staff@example.invalid', '${owner}');
insert into staff_name_aliases(store_id, canonical_staff_name, normalized_canonical_staff_name, source_name, normalized_source_name, source_type, is_active, employee_contact_id, verification_status)
  values (${BM}, 'Puja ( Roji )', 'puja ( roji )', 'PUJA ( ROJI ) S', 'puja ( roji ) s', 'sales_report', true, 'f5000000-0000-0000-0000-000000000001', 'verified');
insert into staff_targets(store_id, month, staff_name, target, set_by) values (${BM}, date_trunc('month', india_today())::date, 'Puja ( Roji )', 200000, '${owner}');
`;

test("a staff member sees the target set under their sales name, and who set it", () => {
  const target = JSON.parse(last(sql(`${seed} ${as(staffUser)} select my_target(); rollback;`)));
  assert.equal(Number(target.target), 200000);
  assert.ok(target.days_left >= 1);
  assert.equal(last(sql(`${seed} select staff_login_for_sales_name(${BM}, 'puja ( roji )'); rollback;`)), staffUser);
  assert.throws(() => sql(`${seed} ${as(staffUser)} select staff_login_for_sales_name(${BM}, 'x'); rollback;`), /permission denied/);
});

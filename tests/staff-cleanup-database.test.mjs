import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const last = (out) => out.split("\n").filter(Boolean).at(-1);
const owner = "00000000-0000-0000-0000-000000000051";
const manager = "00000000-0000-0000-0000-000000000052";
const cashier = "00000000-0000-0000-0000-000000000053";
const staffUser = "00000000-0000-0000-0000-000000000054";
const GP = `'${sql("select id from stores where code='GP';")}'::uuid`;
const as = (id) => `set local request.jwt.claim.sub='${id}'; set local role authenticated;`;
const ids = { rahim: "f0000000-0000-0000-0000-0000000000c1", shabaz: "f0000000-0000-0000-0000-0000000000c2", newbie: "f0000000-0000-0000-0000-0000000000c3", login: "f0000000-0000-0000-0000-0000000000c4" };

// Payslip rows are inserted before the staff exist, so they start unlinked.
const seed = `begin;
insert into auth.users(id,email) values ('${owner}','sc-owner@example.invalid'),('${manager}','sc-manager@example.invalid'),('${cashier}','sc-cashier@example.invalid'),('${staffUser}','sc-staff@example.invalid') on conflict do nothing;
update profiles set role='owner', is_active=true where id='${owner}';
update profiles set role='manager', is_active=true where id='${manager}';
update profiles set role='cashier', is_active=true where id='${cashier}';
update profiles set role='staff', is_active=true where id='${staffUser}';
insert into store_users(user_id, store_id) select u, id from stores, unnest(array['${manager}','${cashier}']::uuid[]) u where code='GP' and not exists (select 1 from store_users where user_id=u);
insert into payslip_batches(salary_month, source_file_name) values ('2026-08-01', 'aug.xlsx') returning id as b \\gset
insert into payslip_rows(batch_id, store_id, firm_name, store_name, salary_month, staff_name, salary_amount) values
  (:'b', ${GP}, 'Go Planet', 'Go Planet', '2026-08-01', 'MD  Rahim', 9000), (:'b', ${GP}, 'Go Planet', 'Go Planet', '2026-08-01', 'RAHIM BHAI', 8000);
insert into employee_contacts(id, store_id, staff_name, normalized_staff_name, is_active) values
  ('${ids.rahim}', ${GP}, 'MD RAHIM', 'md rahim', true), ('${ids.shabaz}', ${GP}, 'SHABAZ', 'shabaz', true),
  ('${ids.newbie}', ${GP}, 'NEW JOINER', 'new joiner', true), ('${ids.login}', ${GP}, 'HAS LOGIN', 'has login', true);
insert into employee_auth_links(employee_contact_id, auth_user_id, store_id, login_email, approved_by) values ('${ids.login}', '${staffUser}', ${GP}, 'sc-staff@example.invalid', '${owner}');
`;

test("same-name payslips link automatically (background and on new uploads)", () => {
  assert.equal(last(sql(`${seed} select auto_link_payslip_names(null); select employee_contact_id from payslip_rows where staff_name='MD  Rahim'; rollback;`)), ids.rahim);
  assert.equal(last(sql(`${seed} insert into payslip_rows(batch_id, store_id, firm_name, store_name, salary_month, staff_name) values (:'b', ${GP}, 'Go Planet', 'Go Planet', '2026-09-01', 'Shabaz') returning employee_contact_id; rollback;`)), ids.shabaz);
});

test("manager/cashier suggest a payslip link, the owner approves; the owner links directly", () => {
  const overview = JSON.parse(last(sql(`${seed} select auto_link_payslip_names(null); ${as(cashier)} select payslip_link_overview(${GP}); rollback;`)));
  assert.deepEqual(overview.unlinked.map((n) => n.name), ["RAHIM BHAI"]);
  assert.equal(JSON.stringify(overview).includes("8000"), false, "no salary amounts");

  for (const who of [cashier, manager]) {
    const out = sql(`${seed} ${as(who)} select link_payslip_name(${GP}, 'rahim bhai', '${ids.rahim}');
select n->>'requested' from jsonb_array_elements(payslip_link_overview(${GP})->'unlinked') n where n->>'name'='RAHIM BHAI'; reset role;
select count(*) from payslip_rows where batch_id = :'b' and employee_contact_id is not null; rollback;`).split("\n");
    assert.deepEqual(out, ["requested", "MD RAHIM", "0"]);
  }
  const approved = sql(`${seed} ${as(manager)} select link_payslip_name(${GP}, 'RAHIM BHAI', '${ids.rahim}'); reset role;
select id as req from payslip_link_requests where status='pending' \\gset
${as(owner)} select jsonb_array_length(payslip_link_overview(${GP})->'requests');
select decide_payslip_link(:'req', true); reset role;
select count(*) from payslip_rows where employee_contact_id='${ids.rahim}'; rollback;`).split("\n");
  assert.deepEqual(approved, ["requested", "1", "", "1"]);
  assert.throws(() => sql(`${seed} ${as(manager)} select link_payslip_name(${GP}, 'RAHIM BHAI', '${ids.rahim}'); reset role;
select id as req from payslip_link_requests \\gset
${as(manager)} select decide_payslip_link(:'req', true); rollback;`), /Only the owner approves/);
  assert.equal(last(sql(`${seed} ${as(owner)} select link_payslip_name(${GP}, 'RAHIM BHAI', '${ids.rahim}'); rollback;`)), "linked");
  assert.throws(() => sql(`${seed} ${as(cashier)} select link_payslip_name(${GP}, 'NOBODY', '${ids.rahim}'); rollback;`), /not on the salary slips/);
});

test("remove staff who left: manager yes, cashier no; delete only without history; login stops", () => {
  assert.equal(last(sql(`${seed} ${as(manager)} select remove_staff('${ids.newbie}', 'never joined'); reset role; select count(*) from employee_contacts where id='${ids.newbie}'; rollback;`)), "0");
  const kept = sql(`${seed} ${as(manager)} select remove_staff('${ids.rahim}', 'left on 30 Sep'); reset role;
select is_active || '|' || (left_on is not null) from employee_contacts where id='${ids.rahim}'; rollback;`).split("\n");
  assert.deepEqual(kept, ["removed", "false|true"], "salary slips under the name keep the record");
  const login = sql(`${seed} ${as(owner)} select remove_staff('${ids.login}', 'left'); reset role;
select status from employee_auth_links where employee_contact_id='${ids.login}'; rollback;`).split("\n");
  assert.deepEqual(login, ["removed", "inactive"]);
  assert.throws(() => sql(`${seed} ${as(cashier)} select remove_staff('${ids.newbie}', 'left'); rollback;`), /Only the owner or the store manager/);
  assert.throws(() => sql(`${seed} ${as(manager)} select remove_staff('${ids.newbie}', ''); rollback;`), /Write why/);
  assert.equal(sql("select has_function_privilege('anon','public.remove_staff(uuid,text)','EXECUTE') or has_function_privilege('authenticated','public.apply_payslip_link(uuid,text,uuid)','EXECUTE');"), "f");
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const last = (out) => out.split("\n").filter(Boolean).at(-1);
const owner = "00000000-0000-0000-0000-000000000081";
const manager = "00000000-0000-0000-0000-000000000082";
const staffUser = "00000000-0000-0000-0000-000000000083";
const other = "00000000-0000-0000-0000-000000000084";
const GP = `'${sql("select id from stores where code='GP';")}'::uuid`;
const as = (id) => `set local request.jwt.claim.sub='${id}'; set local role authenticated;`;

const seed = `begin;
insert into auth.users(id,email) values ('${owner}','nt-owner@example.invalid'),('${manager}','nt-manager@example.invalid'),('${staffUser}','nt-staff@example.invalid'),('${other}','nt-other@example.invalid') on conflict do nothing;
update profiles set role='owner', is_active=true where id='${owner}';
update profiles set role='manager', is_active=true where id='${manager}';
update profiles set role='staff', is_active=true where id='${staffUser}';
update profiles set role='manager', is_active=true where id='${other}';
insert into store_users(user_id, store_id) values ('${manager}', ${GP});
insert into employee_contacts(id, store_id, staff_name, normalized_staff_name, is_active) values ('f4000000-0000-0000-0000-000000000001', ${GP}, 'NT STAFF', 'nt staff', true);
insert into employee_auth_links(employee_contact_id, auth_user_id, store_id, login_email, approved_by) values ('f4000000-0000-0000-0000-000000000001', '${staffUser}', ${GP}, 'nt-staff@example.invalid', '${owner}');
insert into notifications(user_id, kind, title) values ('${manager}', 'task', 'New task'), ('${manager}', 'broadcast', 'Sale Friday'), ('${other}', 'task', 'Not yours');
`;

test("inbox: each person sees and clears only their own notifications", () => {
  const out = sql(`${seed} ${as(manager)} select my_unread_notifications(); select jsonb_array_length(my_notifications(50)->'items');
select mark_notifications_read(); select my_unread_notifications(); reset role; select count(*) from notifications where user_id='${other}' and read_at is null; rollback;`).split("\n").filter(Boolean);
  assert.deepEqual(out, ["2", "2", "0", "1"]);
  assert.throws(() => sql(`${seed} ${as(manager)} select * from notifications; rollback;`), /permission denied/);
});

test("phone subscriptions: saved for the signed-in person; moving a phone to another login re-owns it", () => {
  const sub = "'https://fcm.googleapis.com/fcm/send/abc123456789', 'BPx0000000000000000000000000000000000000000', 'auth00000000'";
  const out = sql(`${seed} ${as(manager)} select save_push_subscription(${sub}, 'UA'); reset role; ${as(other)} select save_push_subscription(${sub}, 'UA'); reset role;
select user_id from push_subscriptions; rollback;`).split("\n").filter(Boolean);
  assert.deepEqual(out, [other]);
});

test("requests: staff and managers write, owners see all and answer; others cannot answer", () => {
  const out = sql(`${seed} ${as(staffUser)} select create_team_request('stock', 'UCB tee M finished') is not null; reset role;
${as(manager)} select create_team_request('supplies', 'Hangers needed') is not null; select jsonb_array_length(my_team_requests()); reset role;
${as(owner)} select jsonb_array_length(owner_team_requests()); select (owner_team_requests()->0->>'store');
select answer_team_request((select (r->>'id')::uuid from jsonb_array_elements(owner_team_requests()) r where r->>'message' = 'Hangers needed'), 'done', 'Sent today') = '${manager}'; reset role;
${as(manager)} select my_team_requests()->0->>'reply'; rollback;`).split("\n").filter(Boolean);
  assert.deepEqual(out, ["t", "t", "1", "2", "Go Planet", "t", "Sent today"]);
  assert.throws(() => sql(`${seed} ${as(manager)} select owner_team_requests(); rollback;`), /Only the owner/);
  assert.throws(() => sql(`${seed} ${as(owner)} select create_team_request('stock', 'x y z'); rollback;`), /for staff, managers and cashiers/);
});

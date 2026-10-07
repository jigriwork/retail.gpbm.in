import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const lines = (out) => out.split("\n").filter(Boolean);
const last = (out) => lines(out).at(-1);
const owner = "00000000-0000-0000-0000-0000000000c1";
const gpManager = "00000000-0000-0000-0000-0000000000c2";
const bmManager = "00000000-0000-0000-0000-0000000000c3";
const gpStaff = "00000000-0000-0000-0000-0000000000c4";
const GP = `'${sql("select id from stores where code='GP';")}'::uuid`;
const BM = `'${sql("select id from stores where code='BM';")}'::uuid`;
const as = (id) => `set local request.jwt.claim.sub='${id}'; set local role authenticated;`;
// Room ids are looked up before signing in (people cannot read the rooms table directly).
const room = (kind, store) => `:'${kind}_${store === GP ? "gp" : store === BM ? "bm" : "x"}'`;

const seed = `begin;
insert into auth.users(id,email) values ('${owner}','ch-owner@example.invalid'),('${gpManager}','ch-gpm@example.invalid'),('${bmManager}','ch-bmm@example.invalid'),('${gpStaff}','ch-staff@example.invalid') on conflict do nothing;
update profiles set role='owner', is_active=true, full_name='Adib' where id='${owner}';
update profiles set role='manager', is_active=true, full_name='Sharukh' where id='${gpManager}';
update profiles set role='manager', is_active=true, full_name='Rahul' where id='${bmManager}';
update profiles set role='staff', is_active=true where id='${gpStaff}';
insert into store_users(user_id, store_id) values ('${gpManager}', ${GP}), ('${bmManager}', ${BM});
insert into employee_contacts(id, store_id, staff_name, normalized_staff_name, is_active) values ('f6000000-0000-0000-0000-000000000001', ${GP}, 'SAMEER', 'sameer', true);
insert into employee_auth_links(employee_contact_id, auth_user_id, store_id, login_email, approved_by) values ('f6000000-0000-0000-0000-000000000001', '${gpStaff}', ${GP}, 'ch-staff@example.invalid', '${owner}');
select ensure_chat_rooms();
select id as store_team_gp from chat_rooms where kind='store_team' and store_id=${GP} \\gset
select id as store_management_gp from chat_rooms where kind='store_management' and store_id=${GP} \\gset
select id as owners_x from chat_rooms where kind='owners' \\gset
`;

test("who sees which chat: owner all groups; manager own store's two; staff own store's team only", () => {
  const titles = (id) => JSON.parse(last(sql(`${seed} ${as(id)} select jsonb_agg(r->>'title' order by r->>'title') from jsonb_array_elements(my_chat_rooms()) r; rollback;`)));
  assert.deepEqual(titles(owner), ["Brand Mark management", "Brand Mark team", "Go Planet management", "Go Planet team", "Owners"]);
  assert.deepEqual(titles(gpManager), ["Go Planet management", "Go Planet team"]);
  assert.deepEqual(titles(gpStaff), ["Go Planet team"]);
  assert.throws(() => sql(`${seed} ${as(gpStaff)} select chat_room(${room("store_management", GP)}); rollback;`), /not in this chat/);
  assert.throws(() => sql(`${seed} ${as(bmManager)} select send_chat_message(${room("store_team", GP)}, 'hi', '{}'); rollback;`), /not in this chat/);
});

test("send with @mention, unread counts, keep and delete rules, announcements only", () => {
  const out = lines(sql(`${seed} ${as(gpManager)} select (send_chat_message(${room("store_team", GP)}, 'Hi @SAMEER please check rack 3', array['${gpStaff}','${bmManager}']::uuid[])->'mentions')::text; reset role;
${as(gpStaff)} select chat_unread_total(); select (chat_room(${room("store_team", GP)})->'messages'->0->'mentions')::text; select mark_chat_read(${room("store_team", GP)}); select chat_unread_total(); reset role;
${as(gpManager)} reset role; select id as msg from chat_messages limit 1 \\gset
${as(gpManager)} select keep_chat_message(:'msg', true); reset role;
select kept from chat_messages limit 1; rollback;`));
  assert.deepEqual(out, [`["${gpStaff}"]`, "1", `["${gpStaff}"]`, "0", "t"], "a mention of someone outside the chat is dropped");
  assert.throws(() => sql(`${seed} ${as(gpManager)} select send_chat_message(${room("store_team", GP)}, 'x', '{}'); reset role; select id as msg from chat_messages limit 1 \\gset
${as(gpStaff)} select keep_chat_message(:'msg', true); rollback;`), /Only owners and managers/);
  assert.throws(() => sql(`${seed} ${as(gpManager)} select send_chat_message(${room("store_team", GP)}, 'x', '{}'); reset role; select id as msg from chat_messages limit 1 \\gset
${as(gpStaff)} select delete_chat_message(:'msg'); rollback;`), /only your own/);
  assert.throws(() => sql(`${seed} ${as(owner)} select set_chat_announcements(${room("store_team", GP)}, true); reset role; ${as(gpStaff)} select send_chat_message(${room("store_team", GP)}, 'x', '{}'); rollback;`), /Only the owners can post/);
});

test("private chats are with an owner; old messages go after 90 days unless kept", () => {
  const out = lines(sql(`${seed} ${as(gpStaff)} select open_direct_chat('${owner}') is not null; select jsonb_array_length(my_chat_rooms()); rollback;`));
  assert.deepEqual(out, ["t", "2"]);
  assert.throws(() => sql(`${seed} ${as(gpStaff)} select open_direct_chat('${gpManager}'); rollback;`), /with an owner/);
  const purged = lines(sql(`${seed} insert into chat_messages(room_id, sender_id, body, created_at, kept) values (${room("owners")}, '${owner}', 'old', now() - interval '100 days', false), (${room("owners")}, '${owner}', 'old kept', now() - interval '100 days', true), (${room("owners")}, '${owner}', 'new', now(), false);
select purge_old_chat_messages(); select string_agg(body, ',' order by body) from chat_messages; rollback;`));
  assert.deepEqual(purged, ["1", "new,old kept"]);
});

test("live updates: members can read their chat's messages, others cannot", () => {
  const out = lines(sql(`${seed} ${as(gpManager)} select send_chat_message(${room("store_team", GP)}, 'hello team', '{}') is not null; reset role;
${as(gpStaff)} select count(*) from chat_messages; reset role; ${as(bmManager)} select count(*) from chat_messages; rollback;`));
  assert.deepEqual(out, ["t", "1", "0"]);
});

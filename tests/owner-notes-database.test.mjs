import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;

assert.ok(url && anonKey && serviceRoleKey, "Local Supabase credentials are required");
const parsedUrl = new URL(url);
assert.ok(
  parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost",
  `Refusing to run database policy tests against non-local URL: ${url}`,
);

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceRoleKey, clientOptions);
const anonymous = createClient(url, anonKey, clientOptions);
const runId = randomUUID();
const password = `${randomUUID()}Aa9!`;

const actors = [
  { key: "owner1", role: "owner", active: true },
  { key: "owner2", role: "owner", active: true },
  { key: "manager", role: "manager", active: true },
  { key: "staff", role: "staff", active: true },
  { key: "inactive", role: "owner", active: false },
];

function value(result, context) {
  assert.equal(result.error, null, `${context}: ${result.error?.message}`);
  return result.data;
}

for (const actor of actors) {
  actor.email = `phase1-${actor.key}-${runId}@example.invalid`;
  const created = value(
    await admin.auth.admin.createUser({
      email: actor.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Phase 1 ${actor.key}` },
    }),
    `create ${actor.key}`,
  );
  actor.id = created.user.id;
  value(
    await admin
      .from("profiles")
      .update({ role: actor.role, is_active: actor.active })
      .eq("id", actor.id),
    `configure ${actor.key}`,
  );
  actor.client = createClient(url, anonKey, clientOptions);
  value(
    await actor.client.auth.signInWithPassword({ email: actor.email, password }),
    `sign in ${actor.key}`,
  );
}

const byKey = Object.fromEntries(actors.map((actor) => [actor.key, actor]));
const { owner1, owner2, manager, staff, inactive } = byKey;
const stores = value(await admin.from("stores").select("id,code"), "load stores");
const gp = stores.find((store) => store.code === "GP");
assert.ok(gp, "Go Planet store fixture is missing");
value(
  await admin.from("store_users").insert([
    { store_id: gp.id, user_id: manager.id, role: "manager" },
    { store_id: gp.id, user_id: staff.id, role: "staff" },
  ]),
  "assign manager and staff",
);

const firstNote = value(
  await owner1.client
    .from("owner_notes")
    .insert({
      title: "Check repeat-customer follow-up",
      content: "Confirm that consent is recorded before any follow-up.",
      created_by: owner1.id,
      updated_by: owner1.id,
    })
    .select()
    .single(),
  "owner 1 creates note",
);

const owner2Read = value(
  await owner2.client.from("owner_notes").select("*").eq("id", firstNote.id).single(),
  "owner 2 reads owner 1 note",
);
assert.equal(owner2Read.created_by, owner1.id);

const edited = value(
  await owner2.client
    .from("owner_notes")
    .update({
      title: "Verify repeat-customer follow-up",
      content: "Confirm consent is recorded before any message is sent.",
      updated_by: owner2.id,
    })
    .eq("id", firstNote.id)
    .select()
    .single(),
  "owner 2 edits shared note",
);
assert.equal(edited.updated_by, owner2.id);

const archivedAt = new Date().toISOString();
const archived = value(
  await owner1.client
    .from("owner_notes")
    .update({ archived_at: archivedAt, updated_by: owner1.id })
    .eq("id", firstNote.id)
    .select()
    .single(),
  "owner 1 archives note",
);
assert.ok(archived.archived_at);

const restored = value(
  await owner2.client
    .from("owner_notes")
    .update({ archived_at: null, updated_by: owner2.id })
    .eq("id", firstNote.id)
    .select()
    .single(),
  "owner 2 restores note",
);
assert.equal(restored.archived_at, null);

const secondNote = value(
  await owner2.client
    .from("owner_notes")
    .insert({
      title: "Verify Brand Mark billing firm",
      content: "Treat the GP Fashion mapping as a separate checked change.",
      created_by: owner2.id,
      updated_by: owner2.id,
    })
    .select()
    .single(),
  "owner 2 creates note",
);
value(
  await owner1.client
    .from("owner_notes")
    .update({ content: "Verify the 31 July 2026 effective date before changing mapping.", updated_by: owner1.id })
    .eq("id", secondNote.id)
    .select()
    .single(),
  "owner 1 edits owner 2 note",
);

const deniedActors = [
  ["manager", manager.client],
  ["staff", staff.client],
  ["inactive", inactive.client],
  ["anonymous", anonymous],
];
const denialMatrix = [];
for (const [name, client] of deniedActors) {
  const read = await client.from("owner_notes").select("id").eq("id", firstNote.id);
  if (name === "anonymous") assert.ok(read.error, "anonymous SELECT must lack table privilege");
  else {
    assert.equal(read.error, null, `${name} SELECT should be safely filtered`);
    assert.deepEqual(read.data, [], `${name} must not read owner notes`);
  }

  const insert = await client.from("owner_notes").insert({
    title: `Forbidden ${name}`,
    content: "Must not be stored",
    created_by: name === "anonymous" ? owner1.id : byKey[name].id,
  });
  assert.ok(insert.error, `${name} must not create owner notes`);

  const update = await client
    .from("owner_notes")
    .update({ title: `Tampered by ${name}` })
    .eq("id", firstNote.id)
    .select("id");
  if (!update.error) assert.deepEqual(update.data, [], `${name} must not edit owner notes`);

  const convert = await client.rpc("convert_owner_note_to_task", { p_note_id: firstNote.id });
  assert.ok(convert.error, `${name} must not convert owner notes`);
  denialMatrix.push({ actor: name, read: "denied", create: "denied", edit: "denied", convert: "denied" });
}

const firstConversion = value(
  await owner1.client.rpc("convert_owner_note_to_task", { p_note_id: firstNote.id }),
  "first note-to-task conversion",
);
const repeatedConversion = value(
  await owner2.client.rpc("convert_owner_note_to_task", { p_note_id: firstNote.id }),
  "repeat note-to-task conversion",
);
assert.equal(repeatedConversion, firstConversion, "repeat conversion must return the same task");
const linkedTasks = value(
  await admin.from("tasks").select("*").eq("id", firstConversion),
  "load converted task",
);
assert.equal(linkedTasks.length, 1, "only one linked task may exist");
assert.equal(linkedTasks[0].category, "owner-note");
assert.equal(linkedTasks[0].is_private, true);
const managerTaskRead = value(
  await manager.client.from("tasks").select("id").eq("id", firstConversion),
  "manager attempts to read converted private task",
);
assert.deepEqual(managerTaskRead, []);

const ownerDelete = await owner1.client.from("owner_notes").delete().eq("id", firstNote.id);
assert.ok(ownerDelete.error, "notes are archived, not deleted");

const chat = value(
  await owner1.client
    .from("ai_chats")
    .insert({ user_id: owner1.id, role: "user", content: "Private owner-one Secretary fixture" })
    .select()
    .single(),
  "owner 1 creates private Secretary chat",
);
const owner2ChatRead = value(
  await owner2.client.from("ai_chats").select("id").eq("id", chat.id),
  "owner 2 attempts to read owner 1 Secretary chat",
);
assert.deepEqual(owner2ChatRead, [], "Secretary history must remain private per owner");

// Seed only the disposable local database for a meaningful Today-page walkthrough.
value(
  await admin.from("reports").insert([
    { store_id: gp.id, uploaded_by: owner1.id, report_type: "sales", report_date: "2026-09-27", file_name: "local-gp.xlsx", row_count: 12, summary: { totalSales: 48250, unmatchedStaffCount: 1 } },
    { store_id: stores.find((store) => store.code === "BM").id, uploaded_by: owner1.id, report_type: "sales", report_date: "2026-09-26", file_name: "local-bm.xlsx", row_count: 8, summary: { totalSales: 31700, unmatchedStaffCount: 0 } },
  ]),
  "seed local sales freshness fixtures",
);
value(
  await admin.from("tasks").insert({
    store_id: gp.id,
    created_by: owner1.id,
    assigned_to: manager.id,
    title: "Review pending customer follow-ups",
    description: "Local visual fixture",
    due_date: "2026-09-27",
    priority: "high",
    status: "pending",
    source: "manual",
    is_private: false,
  }),
  "seed local task fixture",
);

const browserFixturePath = "/tmp/retail-phase1-browser.json";
writeFileSync(
  browserFixturePath,
  JSON.stringify({
    owner: { email: owner1.email, password },
    manager: { email: manager.email, password },
  }),
  { mode: 0o600 },
);

console.log(JSON.stringify({
  database: "local Supabase",
  owners: {
    owner1: ["create", "read", "edit", "archive", "restore", "convert"],
    owner2: ["create", "read", "edit", "restore", "repeat conversion returned same task"],
  },
  denied: denialMatrix,
  duplicateTaskPrevented: true,
  secretaryHistoryPrivate: true,
  browserFixturePath,
}, null, 2));

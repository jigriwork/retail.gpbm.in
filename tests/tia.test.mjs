import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./helpers/app-fixture.mjs";

const task = (overrides = {}) => ({
  id: "t1",
  title: "Call GP Fashion about invoice",
  category: "owner-todo",
  created_by: "actor",
  assigned_to: "actor",
  is_private: true,
  store_id: null,
  status: "pending",
  due_date: "2020-01-01",
  completed_at: null,
  created_at: "2026-09-01T00:00:00Z",
  ...overrides,
});

function ownerTia() {
  const f = fixture({ role: "owner" });
  f.db.tasks.push(
    task(),
    task({ id: "other-owner-todo", title: "Second owner's private call", created_by: "other-owner" }),
    task({ id: "store-task", title: "Fix trial room AC", category: null, store_id: "gp", is_private: false }),
  );
  f.db.ai_memories = [];
  const { createTiaExecutor } = f.load("@/lib/secretary/tools");
  const tia = createTiaExecutor({ profile: f.db.profiles[0], stores: f.db.stores });
  return { f, tia };
}

test("Tia replies in the language of the latest message", () => {
  const { detectReplyLanguage } = fixture({ role: "owner" }).load("@/lib/secretary/context");
  assert.equal(detectReplyLanguage("What's pending today?"), "english");
  assert.equal(detectReplyLanguage("Add a to-do for tomorrow: call the Spykar rep"), "english");
  assert.equal(detectReplyLanguage("Aur Go Planet mein kaun sabse aage hai?"), "hinglish");
  assert.equal(detectReplyLanguage("GP Fashion wala call ho gaya, done kar do"), "hinglish");
  assert.equal(detectReplyLanguage("आज क्या बाकी है?"), "devanagari");
});

test("Tia sees store tasks and her owner's to-dos, never another owner's to-dos", async () => {
  const { tia } = ownerTia();
  const result = await tia.execute("list_tasks", { filter: "all_open" });
  const ids = JSON.parse(JSON.stringify(result.tasks)).map((item) => item.id).sort();
  assert.deepEqual(ids, ["store-task", "t1"]);
  const refused = await tia.execute("complete_task", { task_id: "other-owner-todo" });
  assert.equal(refused.ok, false);
});

test("Tia marks a to-do done and records it for undo", async () => {
  const { f, tia } = ownerTia();
  const result = await tia.execute("complete_task", { task_id: "t1" });
  assert.equal(result.ok, true);
  assert.equal(f.db.tasks[0].status, "done");
  assert.ok(f.db.tasks[0].completed_at);
  assert.equal(tia.actions.length, 1);
  assert.equal(tia.actions[0].kind, "completed");
  assert.equal(tia.actions[0].previous.status, "pending");
});

test("Tia adds private owner to-dos and reschedules tasks", async () => {
  const { f, tia } = ownerTia();
  const added = await tia.execute("add_todo", { title: "Order Diwali banners", due_date: "2026-10-05" });
  assert.equal(added.ok, true);
  const row = f.db.tasks.at(-1);
  assert.equal(row.title, "Order Diwali banners");
  assert.equal(row.category, "owner-todo");
  assert.equal(row.is_private, true);
  assert.equal(row.store_id, null);
  assert.equal(row.created_by, "actor");
  assert.equal(row.due_date, "2026-10-05");

  assert.equal((await tia.execute("add_todo", { title: "Bad date", due_date: "next week" })).ok, false);

  const moved = await tia.execute("reschedule_task", { task_id: "store-task", due_date: "2026-10-01" });
  assert.equal(moved.ok, true);
  assert.equal(f.db.tasks.find((item) => item.id === "store-task").due_date, "2026-10-01");
  assert.equal(JSON.stringify(tia.actions.map((action) => action.kind)), JSON.stringify(["added", "rescheduled"]));
});

test("Tia remembers facts once per owner", async () => {
  const { f, tia } = ownerTia();
  await tia.execute("remember_fact", { title: "Invoice day", fact: "GP Fashion invoices arrive on the 5th." });
  await tia.execute("remember_fact", { title: "Invoice day", fact: "GP Fashion invoices arrive on the 5th." });
  assert.equal(f.db.ai_memories.length, 1);
  assert.equal(f.db.ai_memories[0].user_id, "actor");
});

test("Undo state follows the task as it is now", () => {
  const { isTiaActionUndone } = fixture({ role: "owner" }).load("@/lib/secretary/tools");
  const completed = { kind: "completed", taskId: "t1", title: "x" };
  assert.equal(isTiaActionUndone(completed, { status: "done", due_date: null }), false);
  assert.equal(isTiaActionUndone(completed, { status: "pending", due_date: null }), true);
  const added = { kind: "added", taskId: "t2", title: "x" };
  assert.equal(isTiaActionUndone(added, { status: "pending", due_date: null }), false);
  assert.equal(isTiaActionUndone(added, { status: "cancelled", due_date: null }), true);
  const moved = { kind: "rescheduled", taskId: "t3", title: "x", dueDate: "2026-10-01" };
  assert.equal(isTiaActionUndone(moved, { status: "pending", due_date: "2026-10-01" }), false);
  assert.equal(isTiaActionUndone(moved, { status: "pending", due_date: "2026-09-29" }), true);
});

for (const role of ["manager", "staff"]) {
  test(`${role} cannot use Tia's speech or undo`, async () => {
    const f = fixture({ role });
    f.db.ai_chats = [];
    const actions = f.load("@/lib/secretary/actions");
    assert.equal((await actions.speakSecretaryReply("any")).ok, false);
    assert.equal((await actions.undoSecretaryAction("any", 0)).ok, false);
    const reply = await actions.sendSecretaryMessage({ ok: false, message: "" }, new FormData());
    assert.equal(reply.ok, false);
  });
}

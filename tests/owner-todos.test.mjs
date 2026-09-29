import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./helpers/app-fixture.mjs";

const state = { ok: false, message: "" };
const form = entries => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};
const todo = (overrides = {}) => ({
  id: "todo-1",
  title: "Call GP Fashion",
  category: "owner-todo",
  created_by: "actor",
  assigned_to: "actor",
  is_private: true,
  store_id: null,
  status: "pending",
  due_date: "2026-09-29",
  completed_at: null,
  ...overrides,
});

test("Owner to-do is saved as a private, store-less task for the owner", async () => {
  const f = fixture({ role: "owner" });
  const result = await f.load("@/lib/owner/todo-actions").addOwnerTodo(state, form({ title: "  Order Diwali banners  ", due: "none" }));
  assert.equal(result.ok, true, result.message);
  assert.equal(f.db.tasks.length, 1);
  const [task] = f.db.tasks;
  assert.equal(task.title, "Order Diwali banners");
  assert.equal(task.category, "owner-todo");
  assert.equal(task.is_private, true);
  assert.equal(task.store_id, null);
  assert.equal(task.created_by, "actor");
  assert.equal(task.assigned_to, "actor");
  assert.equal(task.due_date, null);
});

test("Owner to-do needs a title", async () => {
  const f = fixture({ role: "owner" });
  const result = await f.load("@/lib/owner/todo-actions").addOwnerTodo(state, form({ title: "   " }));
  assert.equal(result.ok, false);
  assert.equal(f.db.tasks.length, 0);
});

test("Owner can tick, reopen and remove only their own to-dos", async () => {
  const f = fixture({ role: "owner" });
  f.db.tasks.push(todo(), todo({ id: "other-owner-todo", created_by: "other-owner" }), todo({ id: "store-task", category: null }));
  const { setOwnerTodoStatus } = f.load("@/lib/owner/todo-actions");

  assert.equal((await setOwnerTodoStatus(form({ todoId: "todo-1", status: "done" }))).ok, true);
  assert.equal(f.db.tasks[0].status, "done");
  assert.ok(f.db.tasks[0].completed_at);

  assert.equal((await setOwnerTodoStatus(form({ todoId: "todo-1", status: "pending" }))).ok, true);
  assert.equal(f.db.tasks[0].status, "pending");
  assert.equal(f.db.tasks[0].completed_at, null);

  assert.equal((await setOwnerTodoStatus(form({ todoId: "todo-1", status: "deleted" }))).ok, false);

  await setOwnerTodoStatus(form({ todoId: "other-owner-todo", status: "done" }));
  await setOwnerTodoStatus(form({ todoId: "store-task", status: "done" }));
  assert.equal(f.db.tasks[1].status, "pending", "another owner's to-do is untouched");
  assert.equal(f.db.tasks[2].status, "pending", "ordinary tasks are untouched");
});

for (const role of ["manager", "staff"]) {
  test(`${role} cannot read, add or change owner to-dos`, async () => {
    const f = fixture({ role });
    f.db.tasks.push(todo({ created_by: "owner-1" }));
    const before = JSON.stringify(f.db);
    const read = await f.load("@/lib/owner/todos").getOwnerTodos();
    assert.equal(JSON.stringify(read), JSON.stringify({ doneToday: [], open: [] }));
    const actions = f.load("@/lib/owner/todo-actions");
    assert.equal((await actions.addOwnerTodo(state, form({ title: "Sneaky" }))).ok, false);
    assert.equal((await actions.setOwnerTodoStatus(form({ todoId: "todo-1", status: "done" }))).ok, false);
    assert.equal(JSON.stringify(f.db), before);
  });
}

test("Owner workboard leaves personal to-dos to the to-do list", async () => {
  const f = fixture({ role: "owner" });
  f.db.tasks.push(
    todo({ due_date: "2020-01-01" }),
    todo({ id: "store-task", category: null, store_id: "gp", is_private: false, due_date: "2020-01-01" }),
  );
  const board = await f.load("@/lib/tasks/queries").getOwnerTaskWorkboard();
  assert.equal(JSON.stringify(board.overdue.map(task => task.id)), JSON.stringify(["store-task"]));
});

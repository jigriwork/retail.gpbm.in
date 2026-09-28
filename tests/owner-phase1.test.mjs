import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fixture } from "./helpers/app-fixture.mjs";

const state = { ok: false, message: "" };
const form = entries => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};

test("Phase 1 both active owners can read and edit a shared note", async () => {
  const f = fixture({ role: "owner" });
  f.db.owner_notes.push({
    id: "shared-note",
    title: "Brand Mark firm",
    content: "Verify GP Fashion effective date",
    created_by: "other-owner",
    updated_by: "other-owner",
    converted_task_id: null,
    archived_at: null,
    created_at: "2026-09-28T00:00:00Z",
    updated_at: "2026-09-28T00:00:00Z",
  });

  const result = await f.load("@/lib/owner/notes").getSharedOwnerNotes();
  assert.equal(result.available, true);
  assert.equal(result.notes[0].id, "shared-note");

  const update = await f.load("@/lib/owner/note-actions").updateOwnerNote(state, form({
    noteId: "shared-note",
    title: "Brand Mark firm mapping",
    content: "Confirm legal name before changing Settings",
  }));
  assert.equal(update.ok, true, update.message);
  assert.equal(f.db.owner_notes[0].title, "Brand Mark firm mapping");
  assert.equal(f.db.owner_notes[0].updated_by, "actor");
});

for (const role of ["manager", "staff"]) {
  test(`Phase 1 ${role} cannot read or mutate shared owner notes`, async () => {
    const f = fixture({ role });
    f.db.owner_notes.push({
      id: "private-business-note",
      title: "Owner strategy",
      content: "Sensitive",
      created_by: "owner-1",
      archived_at: null,
      converted_task_id: null,
      created_at: "2026-09-28T00:00:00Z",
      updated_at: "2026-09-28T00:00:00Z",
      updated_by: null,
    });
    const before = JSON.stringify(f.db);
    const read = await f.load("@/lib/owner/notes").getSharedOwnerNotes();
    assert.equal(read.available, false);
    assert.equal(read.notes.length, 0);
    const actions = f.load("@/lib/owner/note-actions");
    for (const action of [actions.createOwnerNote, actions.updateOwnerNote, actions.archiveOwnerNote, actions.convertOwnerNoteToTask]) {
      const result = await action(state, form({ noteId: "private-business-note", title: "Changed", content: "Changed" }));
      assert.equal(result.ok, false);
    }
    assert.equal(JSON.stringify(f.db), before);
  });
}

test("Phase 1 converting a note uses the existing private owner task system", async () => {
  const f = fixture({ role: "owner" });
  f.db.owner_notes.push({
    id: "note-to-task",
    title: "Check customer follow-up pilot",
    content: "Review consent capture before sending messages.",
    created_by: "other-owner",
    archived_at: null,
    converted_task_id: null,
    created_at: "2026-09-28T00:00:00Z",
    updated_at: "2026-09-28T00:00:00Z",
    updated_by: null,
  });
  f.client.rpc = async (name, args) => {
    assert.equal(name, "convert_owner_note_to_task");
    const note = f.db.owner_notes.find(item => item.id === args.p_note_id);
    if (note.converted_task_id) return { data: note.converted_task_id, error: null };
    const task = {
      id: "converted-task",
      assigned_to: "actor",
      category: "owner-note",
      created_by: "actor",
      description: note.content,
      due_date: "2026-09-28",
      is_private: true,
      priority: "normal",
      source: "manual",
      status: "pending",
      title: note.title,
    };
    f.db.tasks.push(task);
    note.converted_task_id = task.id;
    return { data: task.id, error: null };
  };

  const result = await f.load("@/lib/owner/note-actions").convertOwnerNoteToTask(
    state,
    form({ noteId: "note-to-task" }),
  );
  assert.equal(result.ok, true, result.message);
  assert.equal(f.db.tasks.length, 1);
  assert.equal(f.db.tasks[0].title, "Check customer follow-up pilot");
  assert.equal(f.db.tasks[0].is_private, true);
  assert.equal(f.db.tasks[0].assigned_to, "actor");
  assert.equal(f.db.owner_notes[0].converted_task_id, f.db.tasks[0].id);
});

test("Phase 1 priority engine labels incomplete comparisons as uncertain and caps output", () => {
  const f = fixture({ role: "owner" });
  const { buildDailyPriorities } = f.load("@/lib/owner/priorities");
  const priorities = buildDailyPriorities({
    coverage: [
      { storeId: "gp", available: true, currentMonthDays: 3, previousMonthDays: 25 },
      { storeId: "bm", available: true, currentMonthDays: 2, previousMonthDays: 0 },
    ],
    overdueTasks: [{ due_date: "2026-09-01" }],
    salesStatuses: [
      { store: { id: "gp", name: "Go Planet", code: "GP" }, latestReport: { report_date: "2026-09-27", summary: { unmatchedStaffCount: 2 } } },
      { store: { id: "bm", name: "Brand Mark", code: "BM" }, latestReport: { report_date: "2026-09-26", summary: { unmatchedStaffCount: 1 } } },
    ],
    stores: [
      { id: "gp", name: "Go Planet", code: "GP", firm_name: "Go Planet" },
      { id: "bm", name: "Brand Mark", code: "BM", firm_name: "Go Planet" },
    ],
    urgentUpdates: 1,
  });
  assert.ok(priorities.length <= 5);
  assert.ok(priorities.some(item => item.id === "comparison-coverage" && item.uncertain));
  assert.ok(priorities.some(item => item.id === "brand-mark-firm"));
  assert.ok(priorities.every(item => item.evidence && item.action && item.owner && item.review));
});

test("Phase 1 migration grants notes only through owner policies", () => {
  const sql = readFileSync("supabase/migrations/20260928120000_owner_notes_phase1.sql", "utf8");
  assert.match(sql, /public\.is_owner\(\)/);
  assert.match(sql, /owner_notes_active_required/);
  assert.match(sql, /ai_chats_owner_select_own/);
  assert.match(sql, /ai_memories_owner_select_own/);
  assert.match(sql, /user_id = auth\.uid\(\)/);
  assert.match(sql, /convert_owner_note_to_task/);
  assert.match(sql, /for update/);
  assert.doesNotMatch(sql, /manager.*owner_notes|staff.*owner_notes/i);
  assert.doesNotMatch(sql, /grant\s+delete/i);
});

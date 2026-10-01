"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Archive, ArchiveRestore, CheckSquare, Loader2, NotebookPen, Save, Search } from "lucide-react";

import {
  archiveOwnerNote,
  convertOwnerNoteToTask,
  createOwnerNote,
  restoreOwnerNote,
  updateOwnerNote,
  type OwnerNoteActionState,
} from "@/lib/owner/note-actions";
import type { OwnerNote } from "@/lib/owner/notes";

const initialState: OwnerNoteActionState = { ok: false, message: "" };

function ActionMessage({ state }: { state: OwnerNoteActionState }) {
  return state.message ? (
    <p className={state.ok ? "text-xs font-medium text-success" : "text-xs font-medium text-danger"}>
      {state.message}
    </p>
  ) : null;
}

function NoteCard({ archived, note }: { archived: boolean; note: OwnerNote }) {
  const [editState, editAction, editing] = useActionState(updateOwnerNote, initialState);
  const [archiveState, archiveAction, archiving] = useActionState(
    archived ? restoreOwnerNote : archiveOwnerNote,
    initialState,
  );
  const [taskState, taskAction, converting] = useActionState(convertOwnerNoteToTask, initialState);

  return (
    <article className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{note.title}</h3>
          {note.content ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{note.content}</p> : null}
        </div>
        {note.converted_task_id ? (
          <Link
            className="shrink-0 rounded-full border border-border px-2 py-1 text-[0.65rem] font-semibold text-muted"
            href={`/app/tasks/${note.converted_task_id}`}
          >
            Task created
          </Link>
        ) : null}
      </div>

      <details className="mt-4 rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-xs font-semibold text-muted">Edit note</summary>
        <form action={editAction} className="mt-3 space-y-3">
          <input name="noteId" type="hidden" value={note.id} />
          <input
            className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary"
            defaultValue={note.title}
            maxLength={120}
            name="title"
            required
          />
          <textarea
            className="min-h-24 w-full rounded-xl border border-border bg-card p-3 text-sm leading-6 outline-none focus:border-primary"
            defaultValue={note.content}
            maxLength={4000}
            name="content"
          />
          <button className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-white" disabled={editing}>
            {editing ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save changes
          </button>
          <ActionMessage state={editState} />
        </form>
      </details>

      <div className="mt-3 flex flex-wrap gap-2">
        {!archived && !note.converted_task_id ? (
          <form action={taskAction}>
            <input name="noteId" type="hidden" value={note.id} />
            <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold" disabled={converting}>
              {converting ? <Loader2 className="size-3.5 animate-spin" /> : <CheckSquare className="size-3.5" />}
              Make task
            </button>
          </form>
        ) : null}
        <form action={archiveAction}>
          <input name="noteId" type="hidden" value={note.id} />
          <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold" disabled={archiving}>
            {archiving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : archived ? (
              <ArchiveRestore className="size-3.5" />
            ) : (
              <Archive className="size-3.5" />
            )}
            {archived ? "Restore" : "Archive"}
          </button>
        </form>
      </div>
      <ActionMessage state={taskState.message ? taskState : archiveState} />
    </article>
  );
}

export function OwnerNotesPanel({
  archived,
  available,
  notes,
  search,
}: {
  archived: boolean;
  available: boolean;
  notes: OwnerNote[];
  search: string;
}) {
  const [createState, createAction, creating] = useActionState(createOwnerNote, initialState);

  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">Shared between active owners</p>
          <h2 className="mt-2 text-2xl font-semibold">Owner notes</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Business notes live here. Secretary chat history remains private to the owner who created it.
          </p>
        </div>
        <NotebookPen className="size-5 shrink-0 text-muted" />
      </div>

      {!available ? (
        <div className="mt-4 rounded-2xl border border-warning/40 bg-warning/5 p-4 text-sm leading-6">
          Shared notes are ready in code. Apply the local owner-notes migration when a local database is available; production was not changed.
        </div>
      ) : (
        <>
          {!archived ? (
            <form action={createAction} className="mt-5 grid gap-3 rounded-2xl border border-border bg-background p-4">
              <input
                className="h-11 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary"
                maxLength={120}
                name="title"
                placeholder="Short note title"
                required
              />
              <textarea
                className="min-h-24 rounded-xl border border-border bg-card p-3 text-sm leading-6 outline-none focus:border-primary"
                maxLength={4000}
                name="content"
                placeholder="Idea, follow-up, buying thought, or manager point…"
              />
              <button className="inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white" disabled={creating}>
                {creating ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save note
              </button>
              <ActionMessage state={createState} />
            </form>
          ) : null}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <form className="flex min-w-0 flex-1 gap-2" method="get">
              <input name="notesView" type="hidden" value={archived ? "archived" : "active"} />
              <input
                className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary"
                defaultValue={search}
                maxLength={80}
                name="notesQuery"
                placeholder="Search owner notes"
              />
              <button aria-label="Search notes" className="inline-flex size-10 items-center justify-center rounded-xl border border-border">
                <Search className="size-4" />
              </button>
            </form>
            <Link
              className="text-xs font-semibold text-muted"
              href={archived ? "/app/today" : "/app/today?notesView=archived"}
            >
              {archived ? "Show active notes" : "Show archived notes"}
            </Link>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {notes.length ? notes.map((note) => <NoteCard archived={archived} key={note.id} note={note} />) : (
              <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted">
                {search ? "No notes match this search." : archived ? "No archived notes." : "No shared notes yet."}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

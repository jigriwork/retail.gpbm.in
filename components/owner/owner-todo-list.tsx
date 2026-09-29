"use client";

import Link from "next/link";
import { useActionState, useOptimistic, useTransition } from "react";
import { Check, ListChecks, Loader2, Plus, RotateCcw, X } from "lucide-react";

import { addOwnerTodo, setOwnerTodoStatus, type OwnerTodoActionState } from "@/lib/owner/todo-actions";
import type { OwnerTodo } from "@/lib/owner/todos";
import { cn } from "@/lib/utils/cn";

const initialState: OwnerTodoActionState = { ok: false, message: "" };

function dueLabel(dueDate: string | null, today: string, tomorrow: string) {
  if (!dueDate) return null;
  if (dueDate < today) {
    const label = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(
      new Date(`${dueDate}T00:00:00+05:30`),
    );
    return { className: "border-danger/40 text-danger", text: `Overdue · ${label}` };
  }
  if (dueDate === today) return { className: "border-border text-muted", text: "Today" };
  if (dueDate === tomorrow) return { className: "border-border text-muted", text: "Tomorrow" };
  return {
    className: "border-border text-muted",
    text: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(
      new Date(`${dueDate}T00:00:00+05:30`),
    ),
  };
}

export function OwnerTodoList({
  doneToday,
  open,
  today,
  tomorrow,
}: {
  doneToday: OwnerTodo[];
  open: OwnerTodo[];
  today: string;
  tomorrow: string;
}) {
  const [addState, addAction, adding] = useActionState(addOwnerTodo, initialState);
  const [, startTransition] = useTransition();
  // Hide a to-do the moment it is ticked or removed; the server refresh confirms it.
  const [hidden, hide] = useOptimistic<string[], string>([], (current, id) => [...current, id]);
  const visible = open.filter((todo) => !hidden.includes(todo.id));
  const done = doneToday.filter((todo) => !hidden.includes(todo.id));

  function change(todoId: string, status: "cancelled" | "done" | "pending") {
    const formData = new FormData();
    formData.set("todoId", todoId);
    formData.set("status", status);
    startTransition(async () => {
      hide(todoId);
      await setOwnerTodoStatus(formData);
    });
  }

  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
          <ListChecks className="size-5 text-muted" /> My to-do
          {visible.length ? (
            <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted">
              {visible.length}
            </span>
          ) : null}
        </h2>
        <Link className="text-xs font-semibold text-muted" href="/app/tasks">
          All tasks
        </Link>
      </div>

      <form action={addAction} className="mt-3 flex flex-wrap gap-2">
        <input
          aria-label="New to-do"
          className="h-11 min-w-0 flex-1 basis-48 rounded-xl border border-border bg-background px-3 text-base outline-none focus:border-foreground sm:text-sm"
          maxLength={200}
          name="title"
          placeholder="Add something to do…"
          required
        />
        <div className="flex flex-1 gap-2 sm:flex-none">
          <select
            aria-label="When"
            className="h-11 flex-1 rounded-xl border border-border bg-background px-2 text-sm font-semibold sm:flex-none"
            defaultValue="today"
            name="due"
          >
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="none">No date</option>
          </select>
          <button
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50"
            disabled={adding}
            type="submit"
          >
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add
          </button>
        </div>
      </form>
      {!addState.ok && addState.message ? (
        <p className="mt-2 text-xs font-medium text-danger">{addState.message}</p>
      ) : null}

      {visible.length ? (
        <ul className="mt-3 divide-y divide-border">
          {visible.map((todo) => {
            const due = dueLabel(todo.due_date, today, tomorrow);
            return (
              <li className="flex items-center gap-3 py-2" key={todo.id}>
                <button
                  aria-label={`Mark "${todo.title}" done`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-border text-transparent transition hover:border-foreground hover:text-foreground"
                  onClick={() => change(todo.id, "done")}
                  type="button"
                >
                  <Check className="size-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium leading-5">{todo.title}</p>
                  {due ? (
                    <span className={cn("mt-1 inline-block rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold", due.className)}>
                      {due.text}
                    </span>
                  ) : null}
                </div>
                <button
                  aria-label={`Remove "${todo.title}"`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-black/[0.04] hover:text-foreground"
                  onClick={() => change(todo.id, "cancelled")}
                  type="button"
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">Nothing on your list. Add anything you want to remember to do.</p>
      )}

      {done.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-muted">Done today ({done.length})</summary>
          <ul className="mt-2 space-y-1">
            {done.map((todo) => (
              <li className="flex items-center gap-3" key={todo.id}>
                <Check className="size-4 shrink-0 text-success" />
                <p className="min-w-0 flex-1 text-sm text-muted line-through">{todo.title}</p>
                <button
                  aria-label={`Undo "${todo.title}"`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
                  onClick={() => change(todo.id, "pending")}
                  type="button"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

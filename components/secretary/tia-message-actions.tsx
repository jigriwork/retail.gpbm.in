"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check, Loader2, Plus, Square, Undo2, Volume2 } from "lucide-react";

import { playWav, speakWithPhoneVoice, stopSpeaking, unlockAudio } from "@/components/secretary/tia-audio";
import { speakSecretaryReply, undoSecretaryAction } from "@/lib/secretary/actions";
import type { TiaAction } from "@/lib/secretary/tools";

type SpeakState = "idle" | "loading" | "speaking";

/** Fetches a reply as Tia's voice and plays it; falls back to the phone's voice. */
export async function speakReply(chatId: string, setState: (state: SpeakState) => void) {
  setState("loading");
  const result = await speakSecretaryReply(chatId);
  const done = () => setState("idle");
  if (result.audio) {
    setState("speaking");
    if (await playWav(result.audio, done)) return;
  }
  if (result.text) {
    setState("speaking");
    speakWithPhoneVoice(result.text, done);
    return;
  }
  done();
}

export function SpeakButton({ chatId }: { chatId: string }) {
  const [state, setState] = useState<SpeakState>("idle");

  return (
    <button
      aria-label={state === "speaking" ? "Stop" : "Listen to Tia"}
      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border px-2.5 text-xs font-semibold text-muted transition hover:text-foreground disabled:opacity-50"
      disabled={state === "loading"}
      onClick={() => {
        if (state === "speaking") {
          stopSpeaking();
          setState("idle");
          return;
        }
        unlockAudio();
        void speakReply(chatId, setState);
      }}
      type="button"
    >
      {state === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : state === "speaking" ? <Square className="size-3.5" /> : <Volume2 className="size-3.5" />}
      {state === "speaking" ? "Stop" : "Listen"}
    </button>
  );
}

const icons = { added: Plus, completed: Check, rescheduled: CalendarClock };

function actionLabel(action: TiaAction) {
  if (action.kind === "added") return `Added “${action.title}”${action.dueDate ? ` for ${action.dueDate}` : ""}`;
  if (action.kind === "completed") return `Marked “${action.title}” done`;
  return `Moved “${action.title}” to ${action.dueDate}`;
}

export function TiaActionList({ actions, chatId }: { actions: TiaAction[]; chatId: string }) {
  const [pending, startTransition] = useTransition();
  const [undone, setUndone] = useState<number[]>([]);

  return (
    <ul className="mt-3 space-y-1.5">
      {actions.map((action, index) => {
        const Icon = icons[action.kind];
        const isUndone = action.undone || undone.includes(index);
        return (
          <li className="flex items-center gap-2 rounded-xl border border-success/25 bg-success/5 px-3 py-2 text-xs" key={`${action.taskId}-${index}`}>
            <Icon className="size-3.5 shrink-0 text-success" />
            <span className={isUndone ? "min-w-0 flex-1 text-muted line-through" : "min-w-0 flex-1 font-medium"}>{actionLabel(action)}</span>
            {isUndone ? (
              <span className="shrink-0 font-semibold text-muted">Undone</span>
            ) : (
              <button
                className="inline-flex shrink-0 items-center gap-1 font-semibold underline disabled:opacity-50"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await undoSecretaryAction(chatId, index);
                    if (result.ok) setUndone((current) => [...current, index]);
                  })
                }
                type="button"
              >
                <Undo2 className="size-3" /> Undo
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

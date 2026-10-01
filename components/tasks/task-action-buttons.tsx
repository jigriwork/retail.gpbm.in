"use client";

import { useActionState, useRef } from "react";
import {
  Check,
  Clock,
  Loader2,
  PauseCircle,
  Play,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { celebrateFrom } from "@/components/app/celebrate";
import {
  moveTaskToTomorrow,
  setTaskStatus,
} from "@/lib/tasks/actions";
import { cn } from "@/lib/utils/cn";

type ActionState = {
  ok: boolean;
  message: string;
};

const initialState: ActionState = {
  ok: false,
  message: "",
};

function ActionButton({
  taskId,
  label,
  status,
  icon: Icon,
  variant = "light",
}: {
  taskId: string;
  label: string;
  status?: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "dark" | "light";
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const action = status
    ? async (_state: ActionState, formData: FormData) => {
        const result = await setTaskStatus(formData);
        if (status === "done" && result.ok) celebrateFrom(buttonRef.current);
        return result;
      }
    : async (_state: ActionState, formData: FormData) => moveTaskToTomorrow(formData);
  const [, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <input name="taskId" type="hidden" value={taskId} />
      {status ? <input name="status" type="hidden" value={status} /> : null}
      <button
        aria-label={label}
        ref={buttonRef}
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-2xl border border-border text-sm font-semibold transition disabled:opacity-50",
          variant === "dark"
            ? "bg-primary text-white hover:bg-primary-deep"
            : "bg-card text-foreground hover:bg-black/[0.03]",
        )}
        disabled={pending}
        title={label}
        type="submit"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      </button>
    </form>
  );
}

export function TaskActionButtons({ taskId }: { taskId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        icon={Check}
        label="Mark done"
        status="done"
        taskId={taskId}
        variant="dark"
      />
      <ActionButton icon={Clock} label="Move to tomorrow" taskId={taskId} />
      <ActionButton icon={PauseCircle} label="Mark waiting" status="waiting" taskId={taskId} />
      <ActionButton icon={Play} label="Mark in progress" status="in_progress" taskId={taskId} />
      <ActionButton icon={XCircle} label="Cancel task" status="cancelled" taskId={taskId} />
      <ActionButton icon={RotateCcw} label="Reopen task" status="pending" taskId={taskId} />
    </div>
  );
}

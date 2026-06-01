import { Activity, Dumbbell, Moon, Smile, Sun, Trophy } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { Button } from "@/components/ui/button";
import { requireOwner } from "@/lib/auth/session";
import {
  markSleepNow,
  markWakeNow,
  saveLifeFlow,
  toggleGymDone,
  toggleNoScrolling,
  toggleSportsDone,
} from "@/lib/life/actions";
import { getLifeFlowSummary, type LifeLog } from "@/lib/life/queries";

const moods = ["Fresh", "Normal", "Lazy", "Tired", "Focused", "Low"];
const energies = ["High", "Medium", "Low"];
const sleepQualities = ["Good", "Okay", "Poor"];

function formatTime(value?: string | null) {
  if (!value) return "Not marked";

  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function statusText(done?: boolean | null) {
  return done ? "Done" : "Open";
}

function ChoiceGroup({
  name,
  options,
  value,
}: {
  name: string;
  options: string[];
  value?: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          className={
            value === option
              ? "cursor-pointer rounded-2xl border border-foreground bg-foreground px-4 py-3 text-sm font-semibold text-background"
              : "cursor-pointer rounded-2xl border border-border px-4 py-3 text-sm font-semibold transition hover:bg-black/[0.03]"
          }
          key={option}
        >
          <input className="sr-only" defaultChecked={value === option} name={name} type="radio" value={option} />
          {option}
        </label>
      ))}
    </div>
  );
}

function ToggleForm({
  action,
  done,
  label,
  icon: Icon,
}: {
  action: (formData: FormData) => Promise<void>;
  done?: boolean | null;
  label: string;
  icon: typeof Dumbbell;
}) {
  return (
    <form action={action}>
      <input name="next" type="hidden" value={done ? "false" : "true"} />
      <button className="flex min-h-24 w-full items-center gap-3 rounded-[1.35rem] border border-border bg-card p-4 text-left shadow-sm transition hover:border-foreground">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border">
          <Icon className="size-5" />
        </span>
        <span>
          <span className="block font-semibold">{label}</span>
          <span className={done ? "mt-1 block text-sm font-medium text-success" : "mt-1 block text-sm font-medium text-muted"}>
            {statusText(done)}
          </span>
        </span>
      </button>
    </form>
  );
}

function HistoryRow({ log }: { log: LifeLog }) {
  return (
    <div className="rounded-2xl border border-border p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{log.log_date}</p>
          <p className="mt-1 text-muted">
            {log.mood ?? "No mood"} · {log.energy ?? "No energy"}
          </p>
        </div>
        <p className="text-right text-xs font-semibold text-muted">
          Gym {log.gym_done ? "yes" : "open"} · Sports {log.sports_done ? "yes" : "open"}
        </p>
      </div>
    </div>
  );
}

export default async function LifePage() {
  const session = await requireOwner();

  if (!session?.profile) {
    return <AccessDenied message="Life Flow is owner-only." />;
  }

  const summary = await getLifeFlowSummary();
  const todayLog = summary?.todayLog ?? null;

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Owner Life Flow</p>
            <h1 className="mt-2 text-3xl font-semibold">Small daily rhythm</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Light tracking for wake, gym, sports, sleep, mood and energy.
            </p>
          </div>
          <Activity className="size-5 text-muted" />
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Wake</p>
            <p className="mt-1 font-semibold">{formatTime(todayLog?.wake_time)}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Sleep</p>
            <p className="mt-1 font-semibold">{formatTime(todayLog?.sleep_time)}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Estimated sleep</p>
            <p className="mt-1 font-semibold">{summary?.sleepDurationText ?? "Not clear yet"}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Mood / energy</p>
            <p className="mt-1 font-semibold">
              {todayLog?.mood ?? "Open"} · {todayLog?.energy ?? "Open"}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <form action={markWakeNow}>
          <button className="flex min-h-24 w-full items-center gap-3 rounded-[1.35rem] border border-border bg-card p-4 text-left shadow-sm transition hover:border-foreground">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border">
              <Sun className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">Mark wake up now</span>
              <span className="mt-1 block text-sm text-muted">A simple start marker.</span>
            </span>
          </button>
        </form>
        <form action={markSleepNow}>
          <button className="flex min-h-24 w-full items-center gap-3 rounded-[1.35rem] border border-border bg-card p-4 text-left shadow-sm transition hover:border-foreground">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border">
              <Moon className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">Mark sleep now</span>
              <span className="mt-1 block text-sm text-muted">Good enough is useful.</span>
            </span>
          </button>
        </form>
        <ToggleForm action={toggleGymDone} done={todayLog?.gym_done} icon={Dumbbell} label="Gym done" />
        <ToggleForm action={toggleSportsDone} done={todayLog?.sports_done} icon={Trophy} label="Outdoor sports done" />
        <ToggleForm
          action={toggleNoScrolling}
          done={todayLog?.no_useless_scrolling}
          icon={Smile}
          label="No useless scrolling"
        />
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <form action={saveLifeFlow} className="space-y-5">
          <div>
            <p className="mb-3 text-sm font-medium text-muted">Mood</p>
            <ChoiceGroup name="mood" options={moods} value={todayLog?.mood} />
          </div>
          <div>
            <p className="mb-3 text-sm font-medium text-muted">Energy</p>
            <ChoiceGroup name="energy" options={energies} value={todayLog?.energy} />
          </div>
          <div>
            <p className="mb-3 text-sm font-medium text-muted">Sleep quality</p>
            <ChoiceGroup name="sleepQuality" options={sleepQualities} value={todayLog?.sleep_quality} />
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Notes</span>
            <textarea
              className="min-h-24 w-full resize-y rounded-2xl border border-border bg-card p-4 text-sm leading-6 outline-none focus:border-foreground"
              defaultValue={todayLog?.notes ?? ""}
              name="notes"
              placeholder="Tiny note for the day..."
            />
          </label>
          <Button size="lg">Save today</Button>
        </form>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Last 7 days</h2>
        <div className="mt-4 space-y-3">
          {summary?.recentLogs.length ? (
            summary.recentLogs.map((log) => <HistoryRow key={log.id} log={log} />)
          ) : (
            <p className="text-sm leading-6 text-muted">No Life Flow history yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

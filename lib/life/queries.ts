import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { addDays, getIndiaToday } from "@/lib/tasks/dates";

export type LifeLog = Tables<"life_logs">;

export type LifeFlowSummary = {
  today: string;
  todayLog: LifeLog | null;
  yesterdayLog: LifeLog | null;
  recentLogs: LifeLog[];
  sleepDurationText: string | null;
};

function durationText(milliseconds: number) {
  if (milliseconds <= 0) return null;

  const totalMinutes = Math.round(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 1 && minutes < 1) return null;
  if (hours < 1) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function calculateSleepDuration(
  todayLog: Pick<LifeLog, "wake_time" | "sleep_time"> | null,
  yesterdayLog?: Pick<LifeLog, "sleep_time"> | null,
) {
  if (!todayLog?.wake_time) return null;

  const wake = new Date(todayLog.wake_time);
  const todaySleep = todayLog.sleep_time ? new Date(todayLog.sleep_time) : null;
  const yesterdaySleep = yesterdayLog?.sleep_time ? new Date(yesterdayLog.sleep_time) : null;
  const sleep =
    todaySleep && wake.getTime() > todaySleep.getTime()
      ? todaySleep
      : yesterdaySleep && wake.getTime() > yesterdaySleep.getTime()
        ? yesterdaySleep
        : null;

  if (!sleep) return null;

  return durationText(wake.getTime() - sleep.getTime());
}

export async function getLifeFlowSummary(): Promise<LifeFlowSummary | null> {
  const session = await requireOwner();

  if (!session?.profile) return null;

  const today = getIndiaToday();
  const yesterday = addDays(today, -1);
  const weekStart = addDays(today, -6);
  const supabase = await createClient();
  const { data: recentLogs } = await supabase
    .from("life_logs")
    .select("*")
    .eq("user_id", session.profile.id)
    .gte("log_date", weekStart)
    .lte("log_date", today)
    .order("log_date", { ascending: false });
  const logs = (recentLogs ?? []) as LifeLog[];
  const todayLog = logs.find((log) => log.log_date === today) ?? null;
  const yesterdayLog = logs.find((log) => log.log_date === yesterday) ?? null;

  return {
    today,
    todayLog,
    yesterdayLog,
    recentLogs: logs,
    sleepDurationText: calculateSleepDuration(todayLog, yesterdayLog),
  };
}

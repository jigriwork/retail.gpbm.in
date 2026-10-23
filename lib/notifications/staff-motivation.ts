import "server-only";

import { dailyQuote } from "@/lib/motivation/lines";
import { notifyUsers } from "@/lib/notifications/send";
import { createAdminClient } from "@/lib/supabase/server";
import { getIndiaToday } from "@/lib/tasks/dates";

export type StaffMotivationSlot = "morning" | "evening";

const eveningLines = [
  "Your effort today matters. Open GPBM, check your progress, and finish strong!",
  "One more focused customer conversation can change the whole day. Keep going!",
  "Take a moment to check your progress. Small wins today build a great month.",
  "Strong finishes create proud days. Check your progress and give your best till closing.",
  "You showed up and put in the work. Review your day and end it on a high note!",
  "Every customer you helped today counts. Check your progress and keep the momentum going.",
  "The day is not over yet. Stay positive, stay helpful, and finish with confidence!",
];

function firstName(fullName: string | null) {
  return fullName?.trim().split(/\s+/)[0]?.slice(0, 30) || "there";
}

function dayIndex(day: string, length: number) {
  const [year, month, date] = day.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, date) / 86_400_000) % length;
}

export function staffMotivationMessage(slot: StaffMotivationSlot, day: string, fullName: string | null) {
  const name = firstName(fullName);
  return slot === "morning"
    ? { body: dailyQuote(day), title: `☀️ Good morning, ${name}!` }
    : { body: eveningLines[dayIndex(day, eveningLines.length)], title: `⭐ ${name}, finish strong!` };
}

function titlePattern(slot: StaffMotivationSlot) {
  return slot === "morning" ? "☀️ Good morning,%" : "⭐ %, finish strong!";
}

/** Sends one personalised in-app notice and push per active staff login. */
export async function runStaffMotivation(slot: StaffMotivationSlot, now = new Date()) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Secure notification service is unavailable.");

  // Vercel may retry a cron. Track recent recipients individually so an
  // interrupted run resumes for the remaining staff without duplicating pushes.
  const recent = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
  const { data: existing, error: existingError } = await admin
    .from("notifications")
    .select("user_id")
    .eq("kind", "alert")
    .ilike("title", titlePattern(slot))
    .gte("created_at", recent);
  if (existingError) throw existingError;
  const alreadyNotified = new Set((existing ?? []).map((notice) => notice.user_id));

  const { data: staff, error } = await admin
    .from("profiles")
    .select("id,full_name")
    .eq("role", "staff")
    .eq("is_active", true)
    .order("id");
  if (error) throw error;

  const day = getIndiaToday();
  let sent = 0;
  const eligible = staff ?? [];
  const recipients = eligible.filter((person) => !alreadyNotified.has(person.id));
  if (!recipients.length) return { alreadySent: true, eligible: eligible.length, sent: 0, slot };
  for (let offset = 0; offset < recipients.length; offset += 8) {
    const batch = recipients.slice(offset, offset + 8);
    const results = await Promise.all(batch.map((person) => {
      const message = staffMotivationMessage(slot, day, person.full_name);
      return notifyUsers([person.id], {
        ...message,
        kind: "alert",
        tag: `staff-motivation-${slot}`,
        url: "/staff",
      });
    }));
    sent += results.reduce((sum, count) => sum + count, 0);
  }

  return { alreadySent: false, day, eligible: eligible.length, sent, slot };
}

/** One release announcement to every active login, with push where enabled. */
export async function runReleaseAnnouncement(version: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Secure notification service is unavailable.");
  const title = `✨ GPBM Retail ${version} is ready`;
  const { data: existing, error: existingError } = await admin.from("notifications").select("id").eq("title", title).limit(1);
  if (existingError) throw existingError;
  if (existing?.length) return { alreadySent: true, eligible: 0, sent: 0, version };

  const { data: people, error } = await admin.from("profiles").select("id").eq("is_active", true);
  if (error) throw error;
  const ids = (people ?? []).map((person) => person.id);
  const sent = await notifyUsers(ids, {
    body: "The app has been refreshed with personalised staff motivation and the latest improvements. Open GPBM to see it.",
    kind: "broadcast",
    tag: `gpbm-release-${version}`,
    title,
    url: "/",
  });
  return { alreadySent: false, eligible: ids.length, sent, version };
}

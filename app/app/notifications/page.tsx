import { NotificationInbox } from "@/components/notifications/inbox";
import Link from "next/link";

import { requireProfile } from "@/lib/auth/session";

export default async function NotificationsPage() {
  const { profile } = await requireProfile();
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">🔔 Notifications</h1>
      <div className="flex flex-wrap gap-2">
        {profile.role === "owner" ? (
          <>
            <Link className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white" href="/app/owner/notify">📣 Send a notification</Link>
            <Link className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold" href="/app/requests">Requests from the team</Link>
          </>
        ) : <Link className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white" href="/app/requests">✍️ Request to owner</Link>}
      </div>
      <NotificationInbox />
    </div>
  );
}

import { NotificationInbox } from "@/components/notifications/inbox";
import Link from "next/link";

import { requireProfile } from "@/lib/auth/session";

export default async function NotificationsPage() {
  await requireProfile();
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">🔔 Notifications</h1>
      <Link className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white" href="/staff/requests">✍️ Request to owner</Link>
      <NotificationInbox />
    </div>
  );
}

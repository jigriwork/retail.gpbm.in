import Link from "next/link";
import { Bell } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

/** 🔔 with the number of unread notifications. */
export async function NotificationBell({ href }: { href: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_unread_notifications");
  const unread = Number(data ?? 0);
  return (
    <Link aria-label={unread ? `${unread} new notifications` : "Notifications"} className="relative flex size-9 shrink-0 items-center justify-center rounded-xl text-muted hover:text-foreground" href={href}>
      <Bell className="size-4" />
      {unread ? <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.6rem] font-bold leading-4 text-white">{unread > 9 ? "9+" : unread}</span> : null}
    </Link>
  );
}

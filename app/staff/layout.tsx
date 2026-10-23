import Image from "next/image";
import { redirect } from "next/navigation";

import { InstallApp } from "@/components/app/install-app";
import { ChatLink } from "@/components/chat/chat-link";
import { NotificationBell } from "@/components/notifications/bell";
import { EnableNotifications } from "@/components/notifications/enable-notifications";
import { PushListener } from "@/components/notifications/push-listener";
import { StaffBottomNav } from "@/components/staff/staff-bottom-nav";
import { SetPinScreen } from "@/components/auth/set-pin-screen";
import { signOut } from "@/lib/auth/actions";
import { requireProfile } from "@/lib/auth/session";
import { getStaffProfileSummary } from "@/lib/staff/portal";
import packageJson from "@/package.json";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  if (profile.role !== "staff") redirect("/app/today");
  const staff = await getStaffProfileSummary();
  if (!staff || staff.account_status !== "active") redirect("/login?error=inactive");

  if ((profile.login_phone && !profile.pin_set_at) || staff.must_change_password) return <SetPinScreen name={profile.full_name} />;

  return <div className="min-h-dvh bg-background pb-24 text-foreground"><header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur"><div className="mx-auto flex max-w-xl items-center justify-between"><div className="flex items-center gap-3"><Image alt="" className="rounded-lg" height={30} src="/icon-192.png" width={30} /><div><p className="font-semibold">GPBM Staff</p><p className="text-xs text-muted">{staff.store.name} · v{packageJson.version}</p></div></div><div className="flex items-center gap-1"><ChatLink href="/staff/chat" /><NotificationBell href="/staff/notifications" /><form action={signOut}><button className="rounded-xl border border-border px-3 py-2 text-xs font-semibold">Logout</button></form></div></div></header><main className="mx-auto max-w-xl px-4 py-5"><InstallApp /><EnableNotifications required />{children}</main><StaffBottomNav /><PushListener /></div>;
}

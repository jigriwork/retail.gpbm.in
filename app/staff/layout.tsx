import Image from "next/image";
import { redirect } from "next/navigation";

import { StaffBottomNav } from "@/components/staff/staff-bottom-nav";
import { StaffChangePasswordForm } from "@/components/staff/change-password-form";
import { signOut } from "@/lib/auth/actions";
import { requireProfile } from "@/lib/auth/session";
import { getStaffProfileSummary } from "@/lib/staff/portal";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  if (profile.role !== "staff") redirect("/app/today");
  const staff = await getStaffProfileSummary();
  if (!staff || staff.account_status !== "active") redirect("/login?error=inactive");

  if (staff.must_change_password) {
    return <main className="min-h-dvh bg-background px-5 py-8"><section className="mx-auto max-w-md rounded-[1.35rem] border border-border bg-card p-5 shadow-sm"><Image alt="GPBM Retail" className="rounded-xl" height={40} src="/icon-192.png" width={40} /><p className="mt-6 text-sm font-medium text-muted">First login or password reset</p><h1 className="mt-2 text-3xl font-semibold">Create your private password</h1><p className="mb-6 mt-3 text-sm leading-6 text-muted">Dashboard access remains locked until you replace the temporary code.</p><StaffChangePasswordForm /><form action={signOut} className="mt-4"><button className="h-11 w-full rounded-2xl border border-border text-sm font-semibold">Log out</button></form></section></main>;
  }

  return <div className="min-h-dvh bg-background pb-24 text-foreground"><header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur"><div className="mx-auto flex max-w-xl items-center justify-between"><div className="flex items-center gap-3"><Image alt="" className="rounded-lg" height={30} src="/icon-192.png" width={30} /><div><p className="font-semibold">GPBM Staff</p><p className="text-xs text-muted">{staff.store.name}</p></div></div><form action={signOut}><button className="rounded-xl border border-border px-3 py-2 text-xs font-semibold">Logout</button></form></div></header><main className="mx-auto max-w-xl px-4 py-5">{children}</main><StaffBottomNav /></div>;
}

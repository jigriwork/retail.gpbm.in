import Image from "next/image";
import Link from "next/link";
import { LockKeyhole, LogOut, Settings, ShieldCheck, UsersRound } from "lucide-react";

import { BottomNav } from "@/components/app/bottom-nav";
import { ChromeMeasure } from "@/components/app/chrome-measure";
import { LiveClock } from "@/components/app/live-clock";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { requireProfile } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import packageJson from "@/package.json";

export default async function ProtectedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireProfile();

  if (profile?.role === "staff") {
    redirect("/staff");
  }

  if (!profile) {
    return (
      <main className="min-h-dvh bg-background px-5 py-6 text-foreground">
        <div className="mx-auto max-w-xl rounded-[1.35rem] border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary text-white">
            <ShieldCheck className="size-5" />
          </div>
          <h1 className="text-2xl font-semibold">Access issue</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Your account is not fully activated. Contact owner/admin.
          </p>
          <form action={signOut} className="mt-6">
            <Button variant="secondary">Log out</Button>
          </form>
        </div>
      </main>
    );
  }

  if (profile.is_active === false) {
    return (
      <main className="min-h-dvh bg-background px-5 py-6 text-foreground">
        <div className="mx-auto max-w-xl rounded-[1.35rem] border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary text-white">
            <LockKeyhole className="size-5" />
          </div>
          <h1 className="text-2xl font-semibold">Account blocked</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Your account is inactive. Contact owner/admin.
          </p>
          <form action={signOut} className="mt-6">
            <Button variant="secondary">Log out</Button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-24 text-foreground">
      <header id="app-header" className="sticky top-0 z-20 border-b border-border bg-background/95 px-3 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)] backdrop-blur sm:px-4 sm:py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <Link
              className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-normal sm:text-lg"
              href="/app/today"
            >
              <Image alt="" className="shrink-0 rounded-lg" height={28} src="/icon-192.png" width={28} />
              <span className="min-w-0 truncate">GPBM Retail</span>
              <span className="shrink-0 rounded-full border border-border bg-card px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-muted sm:px-2 sm:text-[0.65rem]">
                <span className="sm:hidden">v{packageJson.version}</span>
                <span className="hidden sm:inline">Version {packageJson.version}</span>
              </span>
            </Link>
            <div className="mt-1 hidden flex-wrap items-center gap-2 text-xs font-medium text-muted sm:flex">
              <span className="rounded-full border border-border bg-card px-2 py-1 capitalize">
                {profile.role}
              </span>
              {profile.role === "owner" ? (
                <Link className="font-semibold text-foreground" href="/app/users">
                  Users
                </Link>
              ) : null}
            </div>
          </div>
          <LiveClock className="hidden shrink-0 text-right sm:block" compact />
          {profile.role === "owner" ? (
            <Link
              aria-label="Users"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted hover:text-foreground sm:hidden"
              href="/app/users"
            >
              <UsersRound className="size-4" />
            </Link>
          ) : null}
          <Link
            aria-label="Settings"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted hover:text-foreground"
            href={["accountant", "cashier"].includes(profile.role) ? "/app/settings/account" : "/app/settings"}
          >
            <Settings className="size-4" />
          </Link>
          <form action={signOut} className="shrink-0">
            <Button aria-label="Log out" className="h-9 rounded-xl px-2.5 text-xs sm:h-10 sm:px-3" variant="secondary">
              <LogOut className="size-4 sm:hidden" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-5">{children}</main>
      <BottomNav role={profile.role} />
      <ChromeMeasure />
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { LockKeyhole, Settings, ShieldCheck } from "lucide-react";

import { BottomNav } from "@/components/app/bottom-nav";
import { LiveClock } from "@/components/app/live-clock";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { requireProfile } from "@/lib/auth/session";

export default async function ProtectedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireProfile();

  if (!profile) {
    return (
      <main className="min-h-dvh bg-background px-5 py-6 text-foreground">
        <div className="mx-auto max-w-xl rounded-[1.35rem] border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-foreground text-background">
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
          <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-foreground text-background">
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
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <Link
              className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold tracking-normal sm:text-lg"
              href="/app/today"
            >
              <Image alt="" className="shrink-0 rounded-lg" height={28} src="/icon-192.png" width={28} />
              <span className="min-w-0 truncate">GPBM Retail</span>
              <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[0.6rem] font-bold uppercase text-muted sm:hidden">
                v6.0.0
              </span>
              <span className="hidden rounded-full border border-border bg-card px-2 py-0.5 text-[0.65rem] font-bold uppercase text-muted sm:inline-flex">
                Version 6.0.0
              </span>
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
              <span className="rounded-full border border-border bg-card px-2 py-1 capitalize">
                {profile.role}
              </span>
              {profile.role === "owner" ? (
                <Link className="font-semibold text-foreground" href="/app/users">
                  Users
                </Link>
              ) : null}
              <Link aria-label="Settings" href="/app/settings">
                <Settings className="size-4" />
              </Link>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end sm:gap-3">
            <LiveClock compact />
            <form action={signOut}>
              <Button className="h-9 rounded-xl px-3 text-xs sm:h-10" variant="secondary">
                Logout
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-5">{children}</main>
      <BottomNav role={profile.role} />
    </div>
  );
}

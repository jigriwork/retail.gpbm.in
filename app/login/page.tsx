import Image from "next/image";
import { InstallApp } from "@/components/app/install-app";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { managerHoursLabel } from "@/lib/auth/access";
import { signOut } from "@/lib/auth/actions";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/session";
import packageJson from "@/package.json";

function InactiveAccount() {
  return (
    <main className="min-h-dvh bg-background px-5 py-6 text-foreground">
      <section className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="rounded-[1.35rem] border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary text-white">
            <LockKeyhole className="size-5" />
          </div>
          <h1 className="text-2xl font-semibold">Account inactive</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            This account is not active, so no store or business information is available. Contact the owner if you
            think this is a mistake.
          </p>
          <form action={signOut} className="mt-6">
            <button className="h-11 w-full rounded-2xl border border-border text-sm font-semibold" type="submit">
              Log out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

/** "Good morning" / "Good afternoon" / "Good evening" by India time. */
function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  // If the login cannot be checked (connection problem), just show the form.
  const user = await getCurrentUser().catch(() => null);

  if (user) {
    // A signed-in but deactivated account is shown a clear message here instead of
    // being redirected back into the app (which previously looped). Data access is
    // still blocked independently by requireProfile and database RLS.
    const profile = await getCurrentProfile().catch(() => undefined);
    if (profile === undefined) redirect("/");
    if (!profile || profile.is_active !== true || error === "inactive") {
      return <InactiveAccount />;
    }
    redirect("/");
  }

  return (
    <main className="min-h-dvh bg-background px-5 py-6 text-foreground">
      <section className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-8 flex items-center gap-3">
          <Image alt="GPBM Retail" className="rounded-2xl" height={44} src="/icon-192.png" width={44} />
          <div>
            <p className="text-sm font-semibold text-muted">GPBM</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">Retail</h1>
              <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[0.65rem] font-bold uppercase text-muted">
                Version {packageJson.version}
              </span>
            </div>
          </div>
        </div>

        <InstallApp />
        <div className="rise-in rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted">Secure login</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-normal">
                {greeting()} 👋
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Private access for GPBM Retail users only.
              </p>
            </div>
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white">
              <LockKeyhole className="size-5" />
            </div>
          </div>
          {error === "hours" ? (
            <p className="mb-5 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-medium leading-6 text-accent-ink">
              Store hours are over, so managers and cashiers were logged out. You can log in again from {managerHoursLabel.split(" to ")[0]}.
            </p>
          ) : null}
          <LoginForm />
          <div className="mt-5 space-y-1.5 border-t border-border pt-4 text-xs leading-5 text-muted">
            <p>Managers and cashiers can log in from {managerHoursLabel}.</p>
            <p>Tip: add this app to your phone&apos;s home screen (browser menu → &ldquo;Add to Home Screen&rdquo;) to open it like an app.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

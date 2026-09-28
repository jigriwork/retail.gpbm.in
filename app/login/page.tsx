import Image from "next/image";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { signOut } from "@/lib/auth/actions";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/session";

function InactiveAccount() {
  return (
    <main className="min-h-dvh bg-background px-5 py-6 text-foreground">
      <section className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="rounded-[1.35rem] border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-foreground text-background">
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

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [user, { error }] = await Promise.all([getCurrentUser(), searchParams]);

  if (user) {
    // A signed-in but deactivated account is shown a clear message here instead of
    // being redirected back into the app (which previously looped). Data access is
    // still blocked independently by requireProfile and database RLS.
    const profile = await getCurrentProfile();
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
                Version 9.2.0
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted">Secure login</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-normal">
                Welcome back.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Private access for GPBM Retail users only.
              </p>
            </div>
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
              <LockKeyhole className="size-5" />
            </div>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}

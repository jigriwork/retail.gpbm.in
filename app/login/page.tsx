import { redirect } from "next/navigation";
import { LockKeyhole, Store } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/session";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/app/today");
  }

  return (
    <main className="min-h-dvh bg-background px-5 py-6 text-foreground">
      <section className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
            <Store className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-muted">GPBM</p>
            <h1 className="text-2xl font-semibold">Retail</h1>
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

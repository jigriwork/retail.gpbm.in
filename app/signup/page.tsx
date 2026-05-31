import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";

import { SignupForm } from "@/components/auth/signup-form";
import { getCurrentUser } from "@/lib/auth/session";

export default async function SignupPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/app/today");
  }

  return (
    <main className="min-h-dvh bg-background px-5 py-6 text-foreground">
      <section className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted">Create access</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">
                Join GPBM Retail.
              </h1>
            </div>
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
              <UserPlus className="size-5" />
            </div>
          </div>
          <SignupForm />
        </div>
      </section>
    </main>
  );
}

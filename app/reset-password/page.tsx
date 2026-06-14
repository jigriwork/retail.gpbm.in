import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { KeyRound } from "lucide-react";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="min-h-dvh bg-background px-5 py-6 text-foreground">
      <section className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-8 flex items-center gap-3">
          <Image alt="GPBM Retail" className="rounded-2xl" height={44} src="/icon-192.png" width={44} />
          <div>
            <p className="text-sm font-semibold text-muted">GPBM</p>
            <h1 className="text-2xl font-semibold">Retail</h1>
          </div>
        </div>

        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted">Password reset</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-normal">Set new password.</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Use the reset link from your email, then choose a new password.
              </p>
            </div>
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
              <KeyRound className="size-5" />
            </div>
          </div>
          <Suspense fallback={<p className="text-sm leading-6 text-muted">Preparing reset form...</p>}>
            <ResetPasswordForm />
          </Suspense>
          <Link className="mt-5 inline-flex text-sm font-semibold text-muted" href="/login">
            Back to login
          </Link>
        </div>
      </section>
    </main>
  );
}

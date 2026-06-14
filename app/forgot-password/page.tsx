import Image from "next/image";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { forgotPassword } from "@/lib/auth/actions";

export default function ForgotPasswordPage() {
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
              <p className="text-sm font-medium text-muted">Account recovery</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-normal">Forgot password?</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Enter your email. If an account exists, a reset link will be sent.
              </p>
            </div>
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
              <LockKeyhole className="size-5" />
            </div>
          </div>
          <ForgotPasswordForm action={forgotPassword} />
          <Link className="mt-5 inline-flex text-sm font-semibold text-muted" href="/login">
            Back to login
          </Link>
        </div>
      </section>
    </main>
  );
}

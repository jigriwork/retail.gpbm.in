import Link from "next/link";
import { KeyRound } from "lucide-react";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { changeOwnPassword } from "@/lib/auth/actions";
import { requireProfile } from "@/lib/auth/session";

export default async function AccountSettingsPage() {
  const { profile } = await requireProfile();

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/settings">
          Back to settings
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Account</p>
            <h1 className="mt-2 text-3xl font-semibold">Change My Password</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Signed in as {profile?.email ?? "your account"}. Passwords are changed in Supabase Auth and are not stored in GPBM Retail tables.
            </p>
          </div>
          <KeyRound className="size-5 text-muted" />
        </div>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <ChangePasswordForm action={changeOwnPassword} />
      </section>
    </div>
  );
}

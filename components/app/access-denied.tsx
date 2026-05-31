import Link from "next/link";
import { LockKeyhole } from "lucide-react";

export function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="rounded-[1.35rem] border border-border bg-card p-6 shadow-sm">
      <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-foreground text-background">
        <LockKeyhole className="size-5" />
      </div>
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        {message ?? "This area is reserved for the owner account."}
      </p>
      <Link
        className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-black/[0.03]"
        href="/app/today"
      >
        Back to today
      </Link>
    </div>
  );
}

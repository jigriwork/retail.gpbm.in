"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignupForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const fullName = String(formData.get("fullName") ?? "");
    const phone = String(formData.get("phone") ?? "");
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone || null,
        },
      },
    });

    setIsPending(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (data.session) {
      router.replace("/app/today");
      router.refresh();
      return;
    }

    setMessage("Signup created. Check email confirmation if it is enabled.");
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">
          Full name
        </span>
        <input
          autoComplete="name"
          className="h-[3.25rem] w-full rounded-2xl border border-border bg-card px-4 text-base outline-none transition focus:border-foreground"
          name="fullName"
          placeholder="Manager name"
          required
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Phone</span>
        <input
          autoComplete="tel"
          className="h-[3.25rem] w-full rounded-2xl border border-border bg-card px-4 text-base outline-none transition focus:border-foreground"
          name="phone"
          placeholder="Optional"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Email</span>
        <input
          autoComplete="email"
          className="h-[3.25rem] w-full rounded-2xl border border-border bg-card px-4 text-base outline-none transition focus:border-foreground"
          name="email"
          placeholder="manager@gpbm.in"
          required
          type="email"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">
          Password
        </span>
        <input
          autoComplete="new-password"
          className="h-[3.25rem] w-full rounded-2xl border border-border bg-card px-4 text-base outline-none transition focus:border-foreground"
          minLength={6}
          name="password"
          placeholder="Create password"
          required
          type="password"
        />
      </label>

      <p className="rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-6 text-muted">
        After first owner signup, run the owner bootstrap SQL once to promote the
        owner account.
      </p>

      {message ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground">
          {message}
        </p>
      ) : null}

      <Button className="w-full" disabled={isPending} size="lg">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Create account
        <ArrowRight className="size-4" />
      </Button>
      <p className="text-center text-sm text-muted">
        Already signed up?{" "}
        <Link className="font-semibold text-foreground" href="/login">
          Log in
        </Link>
      </p>
    </form>
  );
}

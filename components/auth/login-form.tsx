"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsPending(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace("/app/today");
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Email</span>
        <input
          autoComplete="email"
          className="h-[3.25rem] w-full rounded-2xl border border-border bg-card px-4 text-base outline-none transition focus:border-foreground"
          name="email"
          placeholder="owner@gpbm.in"
          required
          type="email"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">
          Password
        </span>
        <div className="relative">
          <input
            autoComplete="current-password"
            className="h-[3.25rem] w-full rounded-2xl border border-border bg-card px-4 pr-12 text-base outline-none transition focus:border-foreground"
            name="password"
            placeholder="Enter password"
            required
            type={showPassword ? "text" : "password"}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-xl text-muted transition hover:bg-black/[0.04] hover:text-foreground"
            onClick={() => setShowPassword((current) => !current)}
            type="button"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </label>

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Button className="w-full" disabled={isPending} size="lg">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Continue
        <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}

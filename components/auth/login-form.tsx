"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { rememberCookie, rememberedEmailKey } from "@/lib/auth/remember";
import { createClient } from "@/lib/supabase/client";

const rememberMaxAge = 400 * 24 * 60 * 60;

function readRememberedEmail() {
  try {
    return localStorage.getItem(rememberedEmailKey) ?? "";
  } catch {
    return "";
  }
}

function saveRememberedEmail(email: string | null) {
  try {
    if (email) localStorage.setItem(rememberedEmailKey, email);
    else localStorage.removeItem(rememberedEmailKey);
  } catch {
    // Private windows can block storage; the login itself still works.
  }
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const email = readRememberedEmail();
    if (email && emailRef.current && !emailRef.current.value) {
      emailRef.current.value = email;
      passwordRef.current?.focus();
    }
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const remember = formData.get("remember") === "on";
    // Set before signing in so the session cookies are written with (or
    // without) an expiry. Unticked, the login ends when the browser closes.
    document.cookie = remember
      ? `${rememberCookie}=1; Path=/; Max-Age=${rememberMaxAge}; SameSite=Lax`
      : `${rememberCookie}=0; Path=/; SameSite=Lax`;
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

    saveRememberedEmail(remember ? email : null);

    router.replace("/");
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Email</span>
        <input
          autoComplete="email"
          className="h-[3.25rem] w-full rounded-2xl border border-border bg-card px-4 text-base outline-none transition hover:border-muted/50 focus:border-primary focus:ring-4 focus:ring-foreground/5"
          name="email"
          placeholder="owner@gpbm.in"
          ref={emailRef}
          required
          type="email"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">
          Password / staff PIN
        </span>
        <div className="relative">
          <input
            autoComplete="current-password"
            className="h-[3.25rem] w-full rounded-2xl border border-border bg-card px-4 pr-12 text-base outline-none transition hover:border-muted/50 focus:border-primary focus:ring-4 focus:ring-foreground/5"
            name="password"
            placeholder="Enter password"
            ref={passwordRef}
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

      <label className="flex w-fit cursor-pointer items-start gap-2.5 text-sm font-medium text-muted">
        <input className="mt-0.5 size-4 accent-primary" defaultChecked name="remember" type="checkbox" />
        <span>
          Remember me
          <span className="block text-xs font-normal">Stay logged in on this device, even after closing the browser. Untick on a shared phone.</span>
        </span>
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
      <Link className="inline-flex text-sm font-semibold text-muted" href="/forgot-password">
        Forgot password?
      </Link>
    </form>
  );
}

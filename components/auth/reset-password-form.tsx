"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let active = true;

    async function prepareRecoverySession() {
      const supabase = createClient();
      const code = searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        if (error) {
          setMessage(error.message);
          setOk(false);
          setIsReady(false);
          return;
        }
      }

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        window.history.replaceState(null, "", window.location.pathname);
        if (!active) return;
        if (error) {
          setMessage(error.message);
          setOk(false);
          setIsReady(false);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setIsReady(Boolean(data.session));
      if (!data.session) {
        setMessage("Open the password reset link from your email again.");
        setOk(false);
      }
    }

    prepareRecoverySession();

    return () => {
      active = false;
    };
  }, [searchParams]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setOk(false);

    if (newPassword.length < 8) {
      setMessage("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("New password and confirmation do not match.");
      return;
    }

    setIsPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsPending(false);

    if (error) {
      setMessage(error.message);
      setOk(false);
      return;
    }

    await supabase.auth.signOut();
    setOk(true);
    setMessage("Password changed successfully. Please login again if asked.");
    setTimeout(() => router.replace("/login"), 1200);
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">New password</span>
        <input
          autoComplete="new-password"
          className="h-[3.25rem] w-full rounded-2xl border border-border bg-card px-4 text-base outline-none transition hover:border-muted/50 focus:border-foreground focus:ring-4 focus:ring-foreground/5"
          disabled={!isReady || isPending}
          minLength={8}
          onChange={(event) => setNewPassword(event.target.value)}
          required
          type="password"
          value={newPassword}
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Confirm new password</span>
        <input
          autoComplete="new-password"
          className="h-[3.25rem] w-full rounded-2xl border border-border bg-card px-4 text-base outline-none transition hover:border-muted/50 focus:border-foreground focus:ring-4 focus:ring-foreground/5"
          disabled={!isReady || isPending}
          minLength={8}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
      </label>
      <Button className="w-full" disabled={!isReady || isPending} size="lg">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Set new password
      </Button>
      {message ? (
        <p className={ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
          {message}
        </p>
      ) : null}
    </form>
  );
}

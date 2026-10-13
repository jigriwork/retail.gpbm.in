"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { loginWithCode, loginWithPin, resendLoginCode, startPhoneLogin } from "@/lib/auth/phone-actions";
import { rememberCookie } from "@/lib/auth/remember";

const phoneKey = "gpbm-login-phone";
const rememberMaxAge = 400 * 24 * 60 * 60;
type Step = "phone" | "pin" | "code";

/** Mobile number, then the password, or a WhatsApp code the first time / after "Forgot password". */
export function PhoneLoginForm() {
  const router = useRouter();
  const phoneRef = useRef<HTMLInputElement>(null);
  const [secret, setSecret] = useState("");
  const [step, setStep] = useState<Step>("phone");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  // The last number used on this device is filled in (without a re-render).
  useEffect(() => {
    try { if (phoneRef.current && !phoneRef.current.value) phoneRef.current.value = localStorage.getItem(phoneKey) ?? ""; } catch { /* storage blocked */ }
  }, []);
  const phone = () => phoneRef.current?.value ?? "";

  function run(action: () => Promise<{ ok: boolean; message: string; next?: string }>) {
    setMessage(null);
    start(async () => {
      const result = await action();
      if (!result.ok) return setMessage({ ok: false, text: result.message });
      if (result.next === "done") {
        try { localStorage.setItem(phoneKey, phone()); } catch { /* storage blocked */ }
        router.replace("/");
        router.refresh();
        return;
      }
      if (result.next === "pin" || result.next === "code") { setStep(result.next); setSecret(""); }
      if (result.message) setMessage({ ok: true, text: result.message });
    });
  }

  const input = "h-12 w-full rounded-2xl border border-border bg-background px-4 text-lg tracking-wide outline-none focus:border-primary";
  const button = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-white disabled:opacity-60";

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        document.cookie = `${rememberCookie}=1; Path=/; Max-Age=${rememberMaxAge}; SameSite=Lax`;
        if (step === "phone") run(() => startPhoneLogin(phone()));
        else if (step === "pin") run(() => loginWithPin(phone(), secret));
        else run(() => loginWithCode(phone(), secret));
      }}
    >
      <label className="block text-sm font-medium">Mobile number
        <input
          autoComplete="tel" className={`mt-1 ${input}`} inputMode="numeric" name="phone"
          placeholder="98765 43210" readOnly={step !== "phone"} ref={phoneRef} required
        />
      </label>
      {step !== "phone" ? (
        <label className="block text-sm font-medium">{step === "pin" ? "Your password" : "6-digit code from WhatsApp"}
          <input
            autoComplete={step === "pin" ? "current-password" : "one-time-code"} autoFocus className={`mt-1 ${input}`}
            inputMode={step === "pin" ? "text" : "numeric"} maxLength={step === "pin" ? 72 : 6}
            onChange={(event) => setSecret(step === "pin" ? event.target.value : event.target.value.replace(/\D/g, ""))}
            required type={step === "pin" ? "password" : "text"} value={secret}
          />
        </label>
      ) : null}
      {message ? <p className={`text-sm ${message.ok ? "text-success" : "text-danger"}`} role="status">{message.text}</p> : null}
      <button className={button} disabled={pending} type="submit">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {step === "phone" ? "Continue" : "Log in"}
      </button>
      {step !== "phone" ? (
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <button className="font-semibold text-muted" onClick={() => { setStep("phone"); setSecret(""); setMessage(null); }} type="button">Change number</button>
          <button className="font-semibold text-primary" disabled={pending} onClick={() => run(() => resendLoginCode(phone()))} type="button">
            {step === "pin" ? "Forgot password? Get a WhatsApp code" : "Send a new code"}
          </button>
        </div>
      ) : null}
    </form>
  );
}

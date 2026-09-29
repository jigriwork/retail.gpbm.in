"use client";

import { useActionState, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SecretaryChatState } from "@/lib/secretary/actions";

const initialState: SecretaryChatState = {
  ok: false,
  message: "",
};

const quickPrompts = [
  "What needs attention today?",
  "How are Go Planet and Brand Mark today?",
  "What is not selling?",
  "Which staff performed best?",
  "What is pending?",
  "What should I review today?",
  "Give me Monday audit summary",
  "Suggest one content idea only if useful",
];

const storeChips = ["All Stores", "Go Planet", "Brand Mark"];

export function SecretaryChat({
  action,
}: {
  action: (previous: SecretaryChatState, formData: FormData) => Promise<SecretaryChatState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [prompt, setPrompt] = useState("");
  const [asked, setAsked] = useState("");

  return (
    <div className="space-y-3">
      <form
        action={formAction}
        className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm"
        onSubmit={() => {
          setAsked(prompt.trim());
          setPrompt("");
        }}
      >
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">Ask AI Secretary</span>
          <textarea
            className="min-h-20 w-full resize-y rounded-2xl border border-border bg-card p-3 text-base leading-6 outline-none focus:border-foreground sm:text-sm"
            name="prompt"
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask what needs attention today..."
            value={prompt}
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {storeChips.map((chip) => (
              <button
                className="h-8 rounded-xl border border-border px-2.5 text-xs font-semibold transition hover:bg-black/[0.03]"
                key={chip}
                onClick={() => setPrompt((current) => `${current ? `${current} ` : ""}${chip}: `)}
                type="button"
              >
                {chip}
              </button>
            ))}
          </div>
          <Button className="ml-auto" disabled={pending || !prompt.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send
          </Button>
        </div>
      </form>

      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {quickPrompts.map((item) => (
          <form action={formAction} className="shrink-0" key={item} onSubmit={() => setAsked(item)}>
            <input name="prompt" type="hidden" value={item} />
            <button
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-2xl border border-border bg-card px-3 text-sm font-semibold shadow-sm transition hover:border-foreground disabled:opacity-50"
              disabled={pending}
              type="submit"
            >
              <Sparkles className="size-3.5 shrink-0 text-muted" />
              {item}
            </button>
          </form>
        ))}
      </div>

      {pending && asked ? (
        <section aria-live="polite" className="space-y-2">
          <p className="ml-auto w-fit max-w-[90%] rounded-[1.1rem] bg-foreground px-4 py-2.5 text-sm leading-6 text-background">
            {asked}
          </p>
          <p className="inline-flex items-center gap-2 rounded-[1.1rem] border border-border bg-card px-4 py-3 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Checking your store data… usually 5–15 seconds.
          </p>
        </section>
      ) : !state.ok && state.message ? (
        <p aria-live="polite" className="rounded-[1.1rem] border border-danger/30 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">
          {state.message} Try again in a minute.
        </p>
      ) : null}
    </div>
  );
}

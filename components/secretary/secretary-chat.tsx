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
  "How is Go Planet?",
  "How is Brand Mark?",
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {storeChips.map((chip) => (
          <button
            className="h-9 rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
            key={chip}
            onClick={() => setPrompt((current) => `${current ? `${current} ` : ""}${chip}: `)}
            type="button"
          >
            {chip}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {quickPrompts.map((item) => (
          <form action={formAction} key={item}>
            <input name="prompt" type="hidden" value={item} />
            <button
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm font-semibold shadow-sm transition hover:border-foreground"
              disabled={pending}
              type="submit"
            >
              <span>{item}</span>
              <Sparkles className="size-4 shrink-0 text-muted" />
            </button>
          </form>
        ))}
      </div>

      <form action={formAction} className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">Ask AI Secretary</span>
          <textarea
            className="min-h-28 w-full resize-y rounded-2xl border border-border bg-card p-4 text-sm leading-6 outline-none focus:border-foreground"
            name="prompt"
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask what needs attention today..."
            value={prompt}
          />
        </label>
        {state.message ? (
          <p className={state.ok ? "mt-3 text-sm font-medium text-success" : "mt-3 text-sm font-medium text-danger"}>
            {state.message}
          </p>
        ) : null}
        <Button className="mt-4" disabled={pending || !prompt.trim()} size="lg">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send
        </Button>
      </form>
    </div>
  );
}

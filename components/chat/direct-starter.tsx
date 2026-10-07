"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { openDirectChat } from "@/lib/chat/actions";

/** Start (or open) a private chat with one person. */
export function DirectStarter({ base, people }: { base: string; people: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!people.length) return null;
  async function open(id: string) {
    if (!id) return;
    setBusy(true);
    const result = await openDirectChat(id).catch(() => ({ error: "Connection problem." }) as { error?: string; roomId?: string });
    setBusy(false);
    if ("roomId" in result && result.roomId) router.push(`${base}/${result.roomId}`);
    else setError(result.error ?? "Could not open the chat.");
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <label className="block text-sm font-semibold">Private chat with
        <select className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" defaultValue="" disabled={busy} onChange={(event) => void open(event.target.value)}>
          <option value="">Choose a person…</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}
        </select>
      </label>
      {error ? <p className="mt-1 text-xs font-semibold text-danger">{error}</p> : null}
    </div>
  );
}

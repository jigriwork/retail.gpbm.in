"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addPartialPayment,
  markReceivableDisputed,
  markReceivablePending,
  markReceivableReceived,
  markReceivableWaived,
  syncNegativePayslips,
} from "@/lib/payslips/receivables";

export function SyncNegativePayslipsButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div>
      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85 disabled:opacity-50"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const res = await syncNegativePayslips();
            setResult(res.message);
            router.refresh();
          });
        }}
        type="button"
      >
        {isPending ? "Syncing…" : "Sync Negative Payslips"}
      </button>
      {result ? (
        <p className="mt-2 text-sm text-muted">{result}</p>
      ) : null}
    </div>
  );
}

export function ReceivableStatusActions({ receivableId, currentStatus, receivableAmount }: {
  receivableId: string;
  currentStatus: string | null;
  receivableAmount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialNote, setPartialNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState<"waived" | "disputed" | null>(null);
  const [noteText, setNoteText] = useState("");
  const router = useRouter();

  function doAction(fn: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const res = await fn();
      setFeedback(res.message);
      setShowPartial(false);
      setShowNoteInput(null);
      router.refresh();
    });
  }

  const status = currentStatus ?? "pending";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status !== "received" ? (
          <button
            className="inline-flex h-9 items-center rounded-xl bg-foreground px-3 text-xs font-semibold text-background transition hover:bg-black/85 disabled:opacity-50"
            disabled={isPending}
            onClick={() => doAction(() => markReceivableReceived(receivableId))}
            type="button"
          >
            Mark Received
          </button>
        ) : null}

        {status !== "received" && status !== "waived" ? (
          <button
            className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03] disabled:opacity-50"
            disabled={isPending}
            onClick={() => setShowPartial(!showPartial)}
            type="button"
          >
            Add Partial Payment
          </button>
        ) : null}

        {status !== "waived" ? (
          <button
            className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03] disabled:opacity-50"
            disabled={isPending}
            onClick={() => setShowNoteInput(showNoteInput === "waived" ? null : "waived")}
            type="button"
          >
            Mark Waived
          </button>
        ) : null}

        {status !== "disputed" ? (
          <button
            className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03] disabled:opacity-50"
            disabled={isPending}
            onClick={() => setShowNoteInput(showNoteInput === "disputed" ? null : "disputed")}
            type="button"
          >
            Mark Disputed
          </button>
        ) : null}

        {status !== "pending" ? (
          <button
            className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs font-semibold text-danger transition hover:bg-black/[0.03] disabled:opacity-50"
            disabled={isPending}
            onClick={() => doAction(() => markReceivablePending(receivableId))}
            type="button"
          >
            Reset to Pending
          </button>
        ) : null}
      </div>

      {showPartial ? (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border p-3">
          <div>
            <label className="block text-xs font-medium text-muted" htmlFor={`partial-${receivableId}`}>
              Amount (max ₹{receivableAmount})
            </label>
            <input
              className="mt-1 h-9 w-32 rounded-xl border border-border px-3 text-sm"
              id={`partial-${receivableId}`}
              max={receivableAmount}
              min={1}
              onChange={(e) => setPartialAmount(e.target.value)}
              placeholder="₹ Amount"
              type="number"
              value={partialAmount}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted" htmlFor={`partial-note-${receivableId}`}>
              Note (optional)
            </label>
            <input
              className="mt-1 h-9 w-48 rounded-xl border border-border px-3 text-sm"
              id={`partial-note-${receivableId}`}
              onChange={(e) => setPartialNote(e.target.value)}
              placeholder="Note"
              type="text"
              value={partialNote}
            />
          </div>
          <button
            className="inline-flex h-9 items-center rounded-xl bg-foreground px-3 text-xs font-semibold text-background transition hover:bg-black/85 disabled:opacity-50"
            disabled={isPending || !partialAmount}
            onClick={() =>
              doAction(() => addPartialPayment(receivableId, Number(partialAmount), partialNote))
            }
            type="button"
          >
            Save Payment
          </button>
        </div>
      ) : null}

      {showNoteInput ? (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border p-3">
          <div>
            <label className="block text-xs font-medium text-muted" htmlFor={`note-${receivableId}`}>
              Reason (optional)
            </label>
            <input
              className="mt-1 h-9 w-64 rounded-xl border border-border px-3 text-sm"
              id={`note-${receivableId}`}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add reason…"
              type="text"
              value={noteText}
            />
          </div>
          <button
            className="inline-flex h-9 items-center rounded-xl bg-foreground px-3 text-xs font-semibold text-background transition hover:bg-black/85 disabled:opacity-50"
            disabled={isPending}
            onClick={() =>
              doAction(() =>
                showNoteInput === "waived"
                  ? markReceivableWaived(receivableId, noteText)
                  : markReceivableDisputed(receivableId, noteText),
              )
            }
            type="button"
          >
            Confirm {showNoteInput === "waived" ? "Waived" : "Disputed"}
          </button>
        </div>
      ) : null}

      {feedback ? (
        <p className="text-xs text-muted">{feedback}</p>
      ) : null}
    </div>
  );
}

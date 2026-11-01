"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";

import { Field, inputClass } from "@/components/accounts/fields";
import { Button } from "@/components/ui/button";
import { closeCashDayFromGrid, saveCashDay, type GridField } from "@/lib/cash-book/actions";
import { fmt, missingLabel } from "@/lib/cash-book/format";
import { columnHelp } from "@/lib/cash-book/labels";
import type { CashRow } from "@/lib/cash-book/queries";

const labels: Record<GridField, string> = {
  book_sales: "Book Sales (₹)", card: "EDC / Card (₹)", upi: "UPI (₹)", deposit: "Bank deposit (₹)", counted: "Counted cash in the drawer (₹)",
};

/** The day's figures on a phone: one field under another, saved together, then Close. */
export function CashDayForm({ month, row, storeId }: { month: string; row: CashRow; storeId: string }) {
  const router = useRouter();
  const initial = (field: GridField) => (field === "deposit" ? (row.deposit_lines ? String(Number(row.deposit)) : "")
    : row[field] === null ? "" : String(Number(row[field])));
  const legacyEdc = row.edc_legacy > 0 || row.legacy_combined > 0;
  const shown: GridField[] = ["book_sales", ...(legacyEdc ? [] : (["card", "upi"] as GridField[])), ...(row.deposit_lines <= 1 ? (["deposit"] as GridField[]) : []), "counted"];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(shown.map((field) => [field, initial(field)])));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const changed = shown.filter((field) => values[field].trim() !== initial(field));

  const save = () => start(async () => {
    const result = await saveCashDay({
      date: row.date, month, revision: row.exists ? row.revision : null, storeId,
      values: Object.fromEntries(changed.map((field) => [field, values[field]])),
    });
    setMessage({ ok: result.ok, text: result.ok ? "Saved" : result.message });
    if (result.ok) router.refresh();
  });
  const close = () => start(async () => {
    const result = await closeCashDayFromGrid({ date: row.date, month, revision: row.revision, storeId });
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) router.refresh();
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {shown.map((field) => (
          <Field hint={columnHelp[field]} key={field} label={labels[field]}>
            <input
              className={`${inputClass} ${row.missing.includes(field) && values[field] === "" ? "border-danger/50" : ""}`}
              enterKeyHint="next"
              inputMode="decimal"
              name={field}
              onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
              placeholder={row.missing.includes(field) ? "Required: type 0 for none" : ""}
              value={values[field]}
            />
          </Field>
        ))}
      </div>
      {legacyEdc ? <p className="text-xs text-muted">This day has an old combined EDC (card + UPI) or imported line, so Card and UPI are not entered separately.</p> : null}
      <div className="rounded-2xl border border-border bg-background p-3 text-sm">
        <div className="flex justify-between"><span className="text-muted">Opening</span><span className="font-semibold tabular-nums">{fmt(row.opening)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Calculated closing</span><span className="font-semibold tabular-nums">{fmt(row.closing)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Cash difference</span><span className="font-semibold tabular-nums">{fmt(row.cash_difference)}</span></div>
        {row.missing.length ? <p className="mt-1 text-xs text-danger">Still needed: {row.missing.filter((item) => item !== "opening").map((item) => missingLabel[item] ?? item).join(", ")}</p> : null}
        {!row.previous_closed ? <p className="mt-1 text-xs text-accent-ink">The previous day is still open; this day can be closed after it.</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending || !changed.length} onClick={save} type="button">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {changed.length ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "Saved"}
        </Button>
        {row.can_close && !changed.length ? (
          <Button disabled={pending} onClick={close} type="button" variant="secondary">Close the day</Button>
        ) : null}
        {message ? (
          <p aria-live="polite" className={`inline-flex items-center gap-1 text-sm font-medium ${message.ok ? "text-success" : "text-danger"}`} role="status">
            {message.ok ? <Check className="size-4" /> : null}{message.text}
          </p>
        ) : changed.length ? <p className="text-sm text-accent-ink">Not saved yet</p> : null}
      </div>
    </div>
  );
}

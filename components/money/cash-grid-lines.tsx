"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";

import { addCashLineFromGrid, loadCashLines, removeCashLineFromGrid, type GridLines } from "@/lib/cash-book/actions";
import { fmt } from "@/lib/cash-book/format";
import { cashCategories, cashCategoryLabel, cashEntryLabel, cashEntryTypes, expensePaidFrom } from "@/lib/cash-book/labels";
import type { CashMonth } from "@/lib/cash-book/queries";

const small = "h-8 rounded-lg border border-border bg-card px-2 text-xs outline-none focus:border-primary";
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "");

/**
 * A day's lines inside the monthly grid: list with remove, and a one-row
 * quick entry (Enter adds). Totals and later balances refresh at once.
 */
export function GridDayLines({ canEdit, date, focusAdd, isCashier, isOwner, month, onMonth, otherStores, staff, storeId }: {
  canEdit: boolean; date: string; focusAdd: boolean; isCashier: boolean; isOwner: boolean; month: string;
  onMonth: (month: CashMonth) => void; otherStores: Array<{ id: string; name: string }>; staff: Array<{ id: string; name: string }>; storeId: string;
}) {
  const [lines, setLines] = useState<GridLines | null>(null);
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("tea_snacks");
  const [paidFrom, setPaidFrom] = useState("cash");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [otherStoreId, setOtherStoreId] = useState(otherStores[0]?.id ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const key = useRef<string | null>(null);
  const amountInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void loadCashLines({ date, storeId }).then((result) => { if (live) setLines(result.lines ?? { entries: [], paid_expenses: [] }); });
    return () => { live = false; };
  }, [date, storeId]);
  useEffect(() => { if (focusAdd && canEdit) amountInput.current?.focus(); }, [focusAdd, canEdit]);

  const options = cashEntryTypes.filter((item) => isOwner || !item.ownerOnly);
  const noteNeeded = type === "cash_in" || type === "other_out" || type.startsWith("adjustment") || (type === "expense" && category === "other");

  const add = () => {
    if (pending) return;
    key.current ??= newKey();
    start(async () => {
      const result = await addCashLineFromGrid({
        amount, category, clientKey: key.current ?? undefined, date, employeeId, month, note, otherStoreId, paidFrom, storeId, type,
      });
      if (result.month) onMonth(result.month);
      if (result.lines) setLines(result.lines);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        key.current = null;
        setAmount("");
        setNote("");
        amountInput.current?.focus();
      }
    });
  };
  const remove = (entryId: string) => start(async () => {
    const result = await removeCashLineFromGrid({ date, entryId, month, storeId });
    if (result.month) onMonth(result.month);
    if (result.lines) setLines(result.lines);
    setMessage({ ok: result.ok, text: result.message });
  });
  const onEnter = (event: React.KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); add(); } };

  return (
    <div className="space-y-2 text-xs">
      <p className="font-semibold">Lines {lines ? `(${lines.entries.length + lines.paid_expenses.length})` : ""}</p>
      {lines === null ? <p className="text-muted">Loading…</p> : lines.entries.length || lines.paid_expenses.length ? (
        <ul className="space-y-1">
          {lines.entries.map((entry) => (
            <li className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2 py-1" key={entry.id}>
              <span className="min-w-0 truncate">
                {entry.type === "expense" ? cashCategoryLabel(entry.category) : cashEntryLabel[entry.type]}
                {entry.staff_name ? ` · ${entry.staff_name}` : ""}{entry.other_store ? ` · ${entry.other_store}` : ""}{entry.note ? ` · ${entry.note}` : ""}
                <span className="text-muted"> · {entry.by ?? "—"}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span className={`font-semibold tabular-nums ${entry.direction === "in" ? "text-success" : ""}`}>{entry.direction === "in" ? "+" : "−"}{fmt(entry.amount)}</span>
                {canEdit && (entry.mine || !isCashier) && entry.type !== "legacy_combined" ? (
                  <button aria-label="Remove this line" className="rounded p-0.5 text-muted hover:text-danger" disabled={pending} onClick={() => remove(entry.id)} type="button"><X className="size-3.5" /></button>
                ) : null}
              </span>
            </li>
          ))}
          {lines.paid_expenses.map((item) => (
            <li className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-2 py-1 text-muted" key={item.id}>
              <span className="min-w-0 truncate">{cashCategoryLabel(item.category)} · paid by {item.paid_from === "upi" ? "UPI" : "bank"} (not from drawer){item.note ? ` · ${item.note}` : ""}</span>
              <span className="tabular-nums">{fmt(item.amount)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-muted">No lines yet.</p>}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card p-2">
          <select aria-label="What is it" className={small} onChange={(event) => setType(event.target.value)} value={type}>
            {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          {type === "expense" ? (
            <>
              <select aria-label="Expense type" className={small} onChange={(event) => setCategory(event.target.value)} value={category}>
                {cashCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select aria-label="Paid from" className={small} onChange={(event) => setPaidFrom(event.target.value)} value={paidFrom}>
                {expensePaidFrom.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </>
          ) : null}
          {type === "staff_payment" ? (
            <select aria-label="Staff member" className={small} onChange={(event) => setEmployeeId(event.target.value)} value={employeeId}>
              <option value="">Staff not in list (write name)</option>
              {staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          ) : null}
          {type === "to_store" ? (
            <select aria-label="Sent to" className={small} onChange={(event) => setOtherStoreId(event.target.value)} value={otherStoreId}>
              {otherStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          ) : null}
          <input aria-label="Amount" className={`${small} w-24 text-right`} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} onKeyDown={onEnter} placeholder="₹ amount" ref={amountInput} value={amount} />
          <input aria-label="Note" className={`${small} min-w-[8rem] flex-1`} onChange={(event) => setNote(event.target.value)} onKeyDown={onEnter} placeholder={noteNeeded ? "What for (required)" : "Note (optional)"} value={note} />
          <button className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-white disabled:opacity-60" disabled={pending} onClick={add} type="button">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Add"}
          </button>
        </div>
      ) : null}
      {message ? <p aria-live="polite" className={message.ok ? "text-success" : "text-danger"} role="status">{message.text}</p> : null}
    </div>
  );
}

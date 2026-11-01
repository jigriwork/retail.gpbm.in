"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Field, inputClass } from "@/components/accounts/fields";
import { Button } from "@/components/ui/button";
import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { cashCategories, cashEntryTypes, expensePaidFrom } from "@/lib/cash-book/labels";

const initial: AccountsActionState = { ok: false, message: "" };
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "");

/**
 * One cash book line. Only the fields that matter for the chosen type are
 * shown. Each new line gets its own key, so a double tap saves it once.
 */
export function CashEntryForm({ action, date, isOwner, staff, storeId, stores }: {
  action: (state: AccountsActionState, formData: FormData) => Promise<AccountsActionState>;
  date: string;
  isOwner: boolean;
  staff: Array<{ id: string; name: string }>;
  storeId: string;
  stores: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [type, setType] = useState("expense");
  const [paidFrom, setPaidFrom] = useState("cash");
  const [seen, setSeen] = useState(state);
  const form = useRef<HTMLFormElement>(null);
  const keyInput = useRef<HTMLInputElement>(null);
  // One key per line: kept across retries of the same line (so it saves
  // once), replaced after it is saved.
  const key = useRef<string | null>(null);

  if (seen !== state) {
    setSeen(state);
    if (state.ok) { setType("expense"); setPaidFrom("cash"); }
  }
  useEffect(() => {
    if (state.ok) { key.current = null; form.current?.reset(); }
  }, [state]);

  const options = cashEntryTypes.filter((item) => isOwner || !item.ownerOnly);
  const current = options.find((item) => item.value === type);
  const noteRequired = type === "cash_in" || type === "other_out" || type.startsWith("adjustment");

  return (
    <form
      action={formAction}
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={() => {
        key.current ??= newKey();
        if (keyInput.current) keyInput.current.value = key.current;
      }}
      ref={form}
    >
      <input name="storeId" type="hidden" value={storeId} />
      <input name="date" type="hidden" value={date} />
      <input defaultValue="" name="clientKey" ref={keyInput} type="hidden" />
      <Field hint={current?.hint} label="What is it">
        <select className={inputClass} name="type" onChange={(event) => setType(event.target.value)} value={type}>
          {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </Field>
      {type === "expense" ? (
        <>
          <Field label="Expense type">
            <select className={inputClass} defaultValue="tea_snacks" name="category">
              {cashCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
          <Field hint={paidFrom === "cash" ? "Reduces the cash in the drawer." : "Recorded once under Other expenses; drawer cash is not reduced."} label="Paid from">
            <select className={inputClass} name="paidFrom" onChange={(event) => setPaidFrom(event.target.value)} value={paidFrom}>
              {expensePaidFrom.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
        </>
      ) : null}
      {type === "staff_payment" ? (
        <Field hint="Or leave empty and write the name below." label="Staff member">
          <select className={inputClass} defaultValue="" name="employeeId">
            <option value="">Not in the list</option>
            {staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </Field>
      ) : null}
      {type === "to_store" ? (
        <Field label="Sent to">
          <select className={inputClass} name="otherStoreId" required>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </Field>
      ) : null}
      <Field label="Amount (₹)">
        <input className={inputClass} inputMode="decimal" name="amount" placeholder="0" required />
      </Field>
      <Field label={noteRequired ? (type.startsWith("adjustment") ? "Reason (required)" : "What was it for (required)") : "Note (optional)"}>
        <input className={inputClass} name="note" placeholder={type === "owner" ? "Adib" : type === "expense" ? "Tea for staff" : ""} required={noteRequired} />
      </Field>
      <Field label="Reference (optional)">
        <input className={inputClass} name="reference" placeholder="Bill no. / UTR" />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Add line
        </Button>
        {state.message ? (
          <p aria-live="polite" className={state.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"} role="status">{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}

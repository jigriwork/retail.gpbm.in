"use client";

import { useState } from "react";

import { Field, inputClass } from "@/components/accounts/fields";
import { cashCategories, cashEntryTypes } from "@/lib/cash-book/labels";

/** Fields for one cash book line; only the ones that matter for the chosen type are shown. */
export function CashEntryFields({ staff, stores }: { staff: Array<{ id: string; name: string }>; stores: Array<{ id: string; name: string }> }) {
  const [type, setType] = useState("expense");
  const current = cashEntryTypes.find((item) => item.value === type);
  const noteRequired = type === "cash_in" || type === "other_out";
  return (
    <>
      <Field hint={current?.hint} label="What is it">
        <select className={inputClass} name="type" onChange={(event) => setType(event.target.value)} value={type}>
          {cashEntryTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </Field>
      {type === "expense" ? (
        <Field label="Expense type">
          <select className={inputClass} defaultValue="tea_snacks" name="category">
            {cashCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
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
      <Field label={noteRequired ? "What was it for (required)" : "Note (optional)"}>
        <input className={inputClass} name="note" placeholder={type === "owner" ? "Adib" : type === "expense" ? "Tea for staff" : ""} required={noteRequired} />
      </Field>
    </>
  );
}

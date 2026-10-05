"use client";

import { useState } from "react";

import { inputClass } from "@/components/accounts/fields";

type Person = { id: string; name: string; store?: string };

/** Type a few letters to narrow the staff list; one match is chosen for you. */
export function StaffPicker({ name = "employeeId", showStore = false, staff }: { name?: string; showStore?: boolean; staff: Person[] }) {
  const [query, setQuery] = useState("");
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? staff.filter((person) => words.every((word) => person.name.toLowerCase().includes(word))) : staff;
  return (
    <>
      <input aria-label="Search staff" className={`${inputClass} max-w-44`} onChange={(event) => setQuery(event.target.value)} placeholder="Search staff…" type="search" value={query} />
      <select className={`${inputClass} max-w-64`} defaultValue={shown.length === 1 ? shown[0].id : ""} key={shown.length === 1 ? shown[0].id : query} name={name} required>
        <option disabled value="">{shown.length ? `Choose staff member (${shown.length})…` : "No staff with that name"}</option>
        {shown.map((person) => <option key={person.id} value={person.id}>{person.name}{showStore && person.store ? ` · ${person.store}` : ""}</option>)}
      </select>
    </>
  );
}

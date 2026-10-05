// Labels for the cash book (shared by the server page and the entry form).

export type CashEntryType =
  | "cash_in" | "from_store"
  | "edc" | "expense" | "staff_payment" | "owner" | "home" | "donation" | "bank_deposit" | "to_store" | "other_out";

/** What the cashier can choose when adding a line (cash from the other store arrives by "Received"). */
export const cashEntryTypes: Array<{ value: Exclude<CashEntryType, "from_store">; label: string; hint: string }> = [
  { value: "edc", label: "EDC (card / UPI machine)", hint: "Total of card and UPI payments on the machine for the day." },
  { value: "expense", label: "Shop expense", hint: "Tea, tiffin, courier, rickshaw, guard, room rent, agarbatti…" },
  { value: "staff_payment", label: "Staff salary / payment", hint: "Money paid to a staff member." },
  { value: "owner", label: "Given to owner", hint: "Cash taken by the owner (write who)." },
  { value: "home", label: "Sent home", hint: "Cash sent home (I.B Home)." },
  { value: "donation", label: "Donation / Sadqa", hint: "Charity paid from the counter." },
  { value: "bank_deposit", label: "Bank deposit", hint: "Cash deposited in the bank." },
  { value: "to_store", label: "Cash sent to other store", hint: "The other store confirms when it receives it." },
  { value: "other_out", label: "Other payment", hint: "Anything else paid out (write what)." },
  { value: "cash_in", label: "Cash received (other)", hint: "Cash that came into the drawer, not from a sale (write from where)." },
];

export const cashEntryLabel: Record<CashEntryType, string> = {
  ...Object.fromEntries(cashEntryTypes.map((type) => [type.value, type.label])),
  from_store: "Cash from other store",
} as Record<CashEntryType, string>;

export const cashCategories = [
  { value: "tea_snacks", label: "Tea & snacks" },
  { value: "food", label: "Tiffin / food" },
  { value: "water", label: "Water" },
  { value: "transport", label: "Rickshaw / transport" },
  { value: "courier", label: "Courier" },
  { value: "security", label: "Guard / security" },
  { value: "staff_room", label: "Staff room rent" },
  { value: "pooja", label: "Pooja / agarbatti" },
  { value: "marketing", label: "Marketing / social media" },
  { value: "repairs", label: "Repairs & maintenance" },
  { value: "packaging", label: "Bags & packaging" },
  { value: "cleaning", label: "Cleaning" },
  { value: "stationery", label: "Stationery & printing" },
  { value: "alteration", label: "Alteration" },
  { value: "electricity", label: "Electricity" },
  { value: "rent", label: "Shop rent" },
  { value: "internet_phone", label: "Internet & phone" },
  { value: "staff_welfare", label: "Staff welfare" },
  { value: "other", label: "Other (write what)" },
] as const;

/** Label for a saved line ("Other", without the form's "(write what)" hint). */
export function cashCategoryLabel(value: string | null | undefined) {
  return (cashCategories.find((item) => item.value === value)?.label ?? "").replace(/ \(write what\)$/, "");
}

/** Differences up to ₹10 count as matched. */
export const CASH_TOLERANCE = 10;

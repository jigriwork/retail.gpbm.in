// Labels for the cash book (shared by the server page and the entry forms).

export type CashEntryType =
  | "cash_in" | "from_store" | "adjustment_in"
  | "edc" | "expense" | "staff_payment" | "owner" | "home" | "donation" | "bank_deposit" | "to_store" | "other_out"
  | "adjustment_out" | "legacy_combined";

export type NewCashEntryType = "expense" | "staff_payment" | "owner" | "home" | "donation" | "bank_deposit" | "to_store" | "other_out" | "cash_in" | "adjustment_in" | "adjustment_out";

/**
 * What can be added as a line. Card and UPI are typed on the day (not as
 * lines); the old combined "EDC" line is kept only for days entered before.
 * Cash from the other store arrives by "Received". Adjustments are owner-only.
 */
export const cashEntryTypes: Array<{ value: NewCashEntryType; label: string; hint: string; ownerOnly?: boolean }> = [
  { value: "expense", label: "Shop expense", hint: "Tea, tiffin, courier, rickshaw, guard, room rent, agarbatti…" },
  { value: "staff_payment", label: "Staff salary / payment", hint: "Cash paid to a staff member." },
  { value: "owner", label: "Given to owner", hint: "Cash taken by the owner (write who). Not a shop expense." },
  { value: "home", label: "Sent home", hint: "Cash sent home (I.B Home). Not a shop expense." },
  { value: "donation", label: "Donation / Sadqa", hint: "Charity paid from the counter." },
  { value: "bank_deposit", label: "Bank deposit", hint: "Cash deposited in the bank. A transfer, not an expense." },
  { value: "to_store", label: "Cash sent to other store", hint: "A transfer. The other store confirms when it receives it." },
  { value: "other_out", label: "Other payment", hint: "Anything else paid out of the drawer (write what)." },
  { value: "cash_in", label: "Cash received (other)", hint: "Cash that came into the drawer, not from a sale (write from where)." },
  { value: "adjustment_in", label: "Adjustment: add cash", hint: "Owner only, with the reason. The difference stays visible in the history.", ownerOnly: true },
  { value: "adjustment_out", label: "Adjustment: remove cash", hint: "Owner only, with the reason. The difference stays visible in the history.", ownerOnly: true },
];

export const cashEntryLabel: Record<CashEntryType, string> = {
  ...Object.fromEntries(cashEntryTypes.map((type) => [type.value, type.label])),
  edc: "EDC (card + UPI, old combined line)",
  from_store: "Cash from other store",
  legacy_combined: "Legacy combined deduction (payments + expenses)",
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

/** How an expense was paid. Only cash from the drawer reduces drawer cash. */
export const expensePaidFrom = [
  { value: "cash", label: "Cash from the drawer" },
  { value: "upi", label: "UPI (not from the drawer)" },
  { value: "bank", label: "Bank transfer (not from the drawer)" },
] as const;

/** Label for a saved line ("Other", without the form's "(write what)" hint). */
export function cashCategoryLabel(value: string | null | undefined) {
  return (cashCategories.find((item) => item.value === value)?.label ?? "").replace(/ \(write what\)$/, "");
}

/** Differences up to ₹10 count as matched. */
export const CASH_TOLERANCE = 10;

/** What each typed column means, shown beside the inputs. */
export const columnHelp = {
  book_sales: "Total sale written in the paper book. Type 0 for no sale.",
  card: "Card swipes on the EDC machine only. UPI taken on the machine goes in UPI.",
  upi: "Every UPI payment: QR code and UPI on the EDC machine.",
  deposit: "Cash taken from the drawer to the bank.",
  counted: "Cash counted in the drawer at closing.",
} as const;

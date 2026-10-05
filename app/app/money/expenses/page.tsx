import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Badge, Empty, Field, inputClass, Panel } from "@/components/accounts/fields";
import { MoneyHeader, MoneyNav } from "@/components/money/money-nav";
import { indiaToday, labelFor, money, shortDate } from "@/lib/accounts/format";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { addExpense, deleteExpense, reviewExpense } from "@/lib/money/actions";
import { addDays, expenseCategories, monthLabel, monthStart, paidFromOptions } from "@/lib/money/format";
import { listExpenses } from "@/lib/money/queries";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const { profile } = await requireProfile();
  if (profile?.role === "cashier") return <AccessDenied message="Cash paid from the counter goes in the Cash book." />;
  if (!profile || !["owner", "manager"].includes(profile.role)) return <AccessDenied message="Other expenses are for the owner and store managers." />;
  const stores = await getAccessibleStores(profile);
  const params = await searchParams;
  const store = stores.find((item) => item.id === params.store) ?? stores[0];
  if (!store) return <AccessDenied message="No store is assigned to you." />;
  const isOwner = profile.role === "owner";
  const today = indiaToday();
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? `${params.month}-01` : monthStart(today);
  const expenses = await listExpenses(store.id, month);
  const counted = expenses.filter((item) => item.status !== "rejected");
  const total = counted.reduce((sum, item) => sum + Number(item.amount), 0);
  const byCategory = expenseCategories
    .map((category) => ({ ...category, amount: counted.filter((item) => item.category === category.value).reduce((sum, item) => sum + Number(item.amount), 0) }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-5">
      <MoneyHeader
        description="Store expenses paid by UPI, bank transfer or by the owner: rent, electricity, repairs and so on. Cash paid from the counter goes in the Cash book instead."
        title="Other expenses"
      />
      <MoneyNav active="/app/money/expenses" extra={{ month: month.slice(0, 7) }} isOwner={isOwner} storeId={store.id} stores={stores} />

      <Panel description={isOwner ? "You can enter any past date." : "Enter expenses on the day; the last 7 days are allowed."} title={`Add an expense · ${store.name}`}>
        <ActionForm action={addExpense} className="grid gap-4 sm:grid-cols-2" submitLabel="Save expense">
          <input name="storeId" type="hidden" value={store.id} />
          <Field label="Date"><input className={inputClass} defaultValue={today} max={today} min={isOwner ? undefined : addDays(today, -7)} name="expenseDate" required type="date" /></Field>
          <Field label="Amount (₹)"><input className={inputClass} inputMode="decimal" name="amount" required /></Field>
          <Field label="Spent on">
            <select className={inputClass} name="category" required>
              {expenseCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Paid from">
            <select className={inputClass} name="paidFrom" required>
              {paidFromOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Paid to (optional)"><input className={inputClass} name="paidTo" placeholder="Shop or person" /></Field>
          <Field label="Note"><input className={inputClass} name="note" placeholder="Required for “Other”" /></Field>
        </ActionForm>
      </Panel>

      <Panel
        action={
          <form className="flex items-end gap-2" method="get">
            <input name="store" type="hidden" value={store.id} />
            <Field label="Month"><input className={inputClass} defaultValue={month.slice(0, 7)} max={today.slice(0, 7)} name="month" type="month" /></Field>
            <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show</button>
          </form>
        }
        description={`${counted.length} expense${counted.length === 1 ? "" : "s"}${profile.role === "cashier" ? " entered by you" : ""} · rejected entries are not counted.`}
        title={`${monthLabel(month)}: ${money(total)}`}
      >
        {byCategory.length ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {byCategory.map((item) => <Badge key={item.value}>{item.label} {money(item.amount)}</Badge>)}
          </div>
        ) : null}
        {expenses.length ? (
          <div className="space-y-2">
            {expenses.map((item) => (
              <div className="rounded-2xl border border-border bg-background p-3 text-sm" key={item.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{money(item.amount)} · {labelFor(expenseCategories, item.category)}</span>
                  <span className="flex flex-wrap gap-2">
                    <Badge>{labelFor(paidFromOptions, item.paid_from)}</Badge>
                    <Badge tone={item.status === "checked" ? "good" : item.status === "rejected" ? "bad" : "muted"}>{item.status === "checked" ? "Checked" : item.status === "rejected" ? "Rejected" : "Not checked"}</Badge>
                  </span>
                </div>
                <p className="mt-1 text-muted">
                  {shortDate(item.expense_date)}{item.paid_to ? ` · ${item.paid_to}` : ""}{item.note ? ` · ${item.note}` : ""} · by {item.profiles?.full_name ?? "—"}
                  {item.reject_reason ? ` · Rejected: ${item.reject_reason}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {isOwner && item.status === "recorded" ? (
                    <>
                      <ActionForm action={reviewExpense} className="flex" submitLabel="Mark checked" variant="secondary">
                        <input name="expenseId" type="hidden" value={item.id} />
                        <input name="status" type="hidden" value="checked" />
                      </ActionForm>
                      <ActionForm action={reviewExpense} className="flex flex-wrap items-end gap-2" submitLabel="Reject" variant="secondary">
                        <input name="expenseId" type="hidden" value={item.id} />
                        <input name="status" type="hidden" value="rejected" />
                        <input className={`${inputClass} max-w-56`} name="reason" placeholder="Why" required />
                      </ActionForm>
                    </>
                  ) : null}
                  {item.status === "recorded" && (isOwner || item.created_by === profile.id) ? (
                    <ActionForm action={deleteExpense} className="flex" submitLabel="Remove" variant="secondary">
                      <input name="expenseId" type="hidden" value={item.id} />
                    </ActionForm>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : <Empty>No expenses in {monthLabel(month)}.</Empty>}
      </Panel>
    </div>
  );
}

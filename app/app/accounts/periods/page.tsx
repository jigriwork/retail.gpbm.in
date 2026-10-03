import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, inputClass, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { indiaToday } from "@/lib/accounts/format";
import { closeMonth, reopenMonth } from "@/lib/accounts/period-actions";
import { listFirms } from "@/lib/accounts/queries";
import { createClient } from "@/lib/supabase/server";

export default async function PeriodsPage() {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Months are visible to the owner and people with accounts access." />;
  const [firms, { data: periods }] = await Promise.all([listFirms(), (await createClient()).from("accounting_periods").select("*")]);
  const today = indiaToday();
  const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2 - index, 1)).toISOString().slice(0, 7));
  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/periods" session={session} />
      <AccountsHeader description="Close a month once its entries are checked. Nothing can be posted into a closed month; corrections are reversals dated in an open month. Only an owner can reopen, with a recorded reason." title="Months" />
      {firms.map((firm) => (
        <Panel key={firm.id} title={firm.name}>
          <div className="divide-y divide-border">
            {months.map((month) => {
              const period = (periods ?? []).find((item) => item.firm_id === firm.id && item.month.slice(0, 7) === month);
              const closed = period?.status === "closed";
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" key={month}>
                  <span className="font-semibold">{month}{period?.reopen_reason ? <span className="ml-2 font-normal text-muted">reopened: {period.reopen_reason}</span> : null}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={closed ? "good" : "muted"}>{closed ? "closed" : "open"}</Badge>
                    {!closed && session.can.close ? (
                      <ActionForm action={closeMonth} className="flex" submitLabel="Close month" variant="secondary"><input name="firmId" type="hidden" value={firm.id} /><input name="month" type="hidden" value={month} /></ActionForm>
                    ) : null}
                    {closed && session.isOwner ? (
                      <ActionForm action={reopenMonth} className="flex items-center gap-2" submitLabel="Reopen" variant="secondary">
                        <input name="firmId" type="hidden" value={firm.id} /><input name="month" type="hidden" value={month} />
                        <input className={`${inputClass} h-9 w-56`} name="reason" placeholder="Reason" required />
                      </ActionForm>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      ))}
    </div>
  );
}

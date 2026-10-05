import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Empty, Notice, Panel } from "@/components/accounts/fields";
import { StaffPicker } from "@/components/employees/staff-picker";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { autoMatchPayslips, autoMatchStaff, decidePayslipLink, linkPayslipName, linkStaffName } from "@/lib/staff-match/actions";
import { createClient } from "@/lib/supabase/server";

type Candidate = { id: string; name: string; reason: string; store: string };
type Overview = {
  certain: Array<{ id: string; lines: number; name: string; staff: string }>;
  likely: Array<{ candidates: Candidate[]; lines: number; name: string }>;
  linked: number;
  linked_names: Array<{ lines: number; name: string; staff: string }>;
  staff: Array<{ id: string; name: string; store: string }>;
  unmatched: Array<{ lines: number; name: string }>;
};
type Payslips = {
  linked: number;
  requests: Array<{ at: string; by: string | null; id: string; name: string; staff: string }>;
  staff: Array<{ id: string; name: string }>;
  unlinked: Array<{ last_month: string; months: number; name: string; requested: string | null }>;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (value: string) => `${MONTHS[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;

export default async function StaffMatchPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { profile } = await requireProfile();
  if (!["owner", "manager", "cashier"].includes(profile.role)) return <AccessDenied message="Matching staff names is for the owner, managers and cashiers." />;
  const stores = (await getAccessibleStores(profile)).filter((store) => store.is_active);
  const requested = (await searchParams).store;
  const store = stores.find((item) => item.id === requested) ?? stores[0];
  if (!store) return <AccessDenied message="No store is assigned to you." />;
  const supabase = await createClient();
  const [{ data }, { data: slipData }] = await Promise.all([
    supabase.rpc("staff_match_overview", { p_store: store.id }),
    supabase.rpc("payslip_link_overview", { p_store: store.id }),
  ]);
  const overview = data as unknown as Overview | null;
  const slips = (slipData as unknown as Payslips | null) ?? { linked: 0, requests: [], staff: [], unlinked: [] };
  if (!overview) return <AccessDenied message="Store access denied." />;
  const isOwner = profile.role === "owner";

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Link className="text-sm font-medium text-muted" href="/app/employees">← Staff</Link>
        <h1 className="mt-2 text-3xl font-semibold">Match staff names</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Names on the sales bills and on the salary slips are matched to the staff list, so each staff login shows its own sales, salary and payslips. Same names match automatically every hour; please confirm the rest.</p>
        {stores.length > 1 ? (
          <nav className="mt-3 flex flex-wrap gap-2">
            {stores.map((item) => (
              <Link className={`rounded-full px-3 py-1.5 text-xs font-semibold ${item.id === store.id ? "bg-primary text-white" : "border border-border"}`} href={`/app/staff-match?store=${item.id}`} key={item.id}>{item.name}</Link>
            ))}
          </nav>
        ) : null}
        <p className="mt-3 text-sm font-semibold">Sales names: {overview.linked} matched · {overview.certain.length} ready to match · {overview.likely.length} to confirm · {overview.unmatched.length} not found</p>
        <p className="mt-1 text-sm font-semibold">Salary slips: {slips.linked} names matched · {slips.unlinked.length} not matched{isOwner && slips.requests.length ? ` · ${slips.requests.length} waiting for your approval` : ""}</p>
      </section>

      <Panel description="Same name apart from capitals, spaces and the counter marks “S” or “1”." title="Ready to match automatically">
        {overview.certain.length ? (
          <div className="space-y-3">
            <ul className="space-y-1 text-sm">{overview.certain.map((item) => <li key={item.name}><b>{item.name}</b> → {item.staff} <span className="text-muted">({item.lines} bill lines)</span></li>)}</ul>
            <ActionForm action={autoMatchStaff} submitLabel={`Match these ${overview.certain.length} now`}>
              <input name="storeId" type="hidden" value={store.id} />
            </ActionForm>
          </div>
        ) : <Empty>Nothing waiting; same names are matched automatically.</Empty>}
      </Panel>

      <Panel description="Probably the same person (short/long name, spelling, or the other store). Tap the right one, or choose below." title="Please confirm">
        {overview.likely.length ? (
          <ul className="space-y-3">
            {overview.likely.map((item) => (
              <li className="rounded-2xl border border-border bg-background p-3 text-sm" key={item.name}>
                <p><b>{item.name}</b> <span className="text-muted">· {item.lines} bill lines</span></p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.candidates.map((candidate) => (
                    <ActionForm action={linkStaffName} className="flex items-center gap-2" key={candidate.id} submitLabel={`Yes: ${candidate.name}`} variant="secondary">
                      <input name="storeId" type="hidden" value={store.id} />
                      <input name="source" type="hidden" value={item.name} />
                      <input name="employeeId" type="hidden" value={candidate.id} />
                      <span className="text-xs text-muted">{candidate.reason}{candidate.store !== store.name ? ` · ${candidate.store}` : ""}</span>
                    </ActionForm>
                  ))}
                </div>
                <MatchPicker name={item.name} staff={overview.staff} storeId={store.id} />
              </li>
            ))}
          </ul>
        ) : <Empty>Nothing to confirm.</Empty>}
      </Panel>

      <Panel description="Shared logins like “SHOP GP” can be left as they are. Pick the staff member if you know who it is." title="Not found in the staff list">
        {overview.unmatched.length ? (
          <ul className="space-y-3">
            {overview.unmatched.map((item) => (
              <li className="rounded-2xl border border-border bg-background p-3 text-sm" key={item.name}>
                <p><b>{item.name}</b> <span className="text-muted">· {item.lines} bill lines</span></p>
                <MatchPicker name={item.name} staff={overview.staff} storeId={store.id} />
              </li>
            ))}
          </ul>
        ) : <Empty>Every name is matched.</Empty>}
        <Notice tone="info">If the staff member is missing from the list, add them under Staff first.</Notice>
      </Panel>

      {isOwner && slips.requests.length ? (
        <Panel description="Suggested by managers or cashiers. Approving links every salary slip with that name to the staff member." title="Salary slip matches to approve">
          <ul className="space-y-3">
            {slips.requests.map((item) => (
              <li className="rounded-2xl border border-border bg-background p-3 text-sm" key={item.id}>
                <p><b>{item.name}</b> → {item.staff} <span className="text-muted">· by {item.by ?? "staff"}</span></p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <ActionForm action={decidePayslipLink} className="flex" submitLabel="Approve">
                    <input name="requestId" type="hidden" value={item.id} />
                    <input name="decision" type="hidden" value="approve" />
                  </ActionForm>
                  <ActionForm action={decidePayslipLink} className="flex" submitLabel="Reject" variant="secondary">
                    <input name="requestId" type="hidden" value={item.id} />
                    <input name="decision" type="hidden" value="reject" />
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel description={isOwner ? "Pick the staff member for each salary slip name; it applies to all their months." : "Pick the staff member for each salary slip name. The owner approves it, then their login shows the salary."} title="Salary slip names not matched">
        {slips.unlinked.length ? (
          <ul className="space-y-3">
            {slips.unlinked.map((item) => (
              <li className="rounded-2xl border border-border bg-background p-3 text-sm" key={item.name}>
                <p><b>{item.name}</b> <span className="text-muted">· {item.months} month{item.months === 1 ? "" : "s"}, last {month(item.last_month)}</span></p>
                {item.requested ? <p className="mt-1 text-xs font-semibold text-warning">Waiting for owner: {item.requested}</p> : null}
                <ActionForm action={linkPayslipName} className="mt-2 flex flex-wrap items-center gap-2" submitLabel={isOwner ? "Match" : "Send to owner"} variant="secondary">
                  <input name="storeId" type="hidden" value={store.id} />
                  <input name="source" type="hidden" value={item.name} />
                  <StaffPicker staff={slips.staff} />
                </ActionForm>
              </li>
            ))}
          </ul>
        ) : <Empty>Every salary slip is matched to a staff member.</Empty>}
        <div className="mt-3">
          <ActionForm action={autoMatchPayslips} className="flex" submitLabel="Match same names now" variant="secondary">
            <input name="storeId" type="hidden" value={store.id} />
          </ActionForm>
        </div>
      </Panel>

      <Panel title={`Sales names matched (${overview.linked})`}>
        {overview.linked_names.length ? (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">{overview.linked_names.map((item) => <li key={item.name}>{item.name} → <b>{item.staff}</b></li>)}</ul>
        ) : <Empty>None yet.</Empty>}
      </Panel>
    </div>
  );
}

function MatchPicker({ name, staff, storeId }: { name: string; staff: Overview["staff"]; storeId: string }) {
  return (
    <ActionForm action={linkStaffName} className="mt-2 flex flex-wrap items-center gap-2" submitLabel="Match" variant="secondary">
      <input name="storeId" type="hidden" value={storeId} />
      <input name="source" type="hidden" value={name} />
      <StaffPicker showStore staff={staff} />
    </ActionForm>
  );
}

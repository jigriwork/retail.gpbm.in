import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Empty, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { autoMatchStaff, linkStaffName } from "@/lib/staff-match/actions";
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

export default async function StaffMatchPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { profile } = await requireProfile();
  if (!["owner", "manager", "cashier"].includes(profile.role)) return <AccessDenied message="Matching staff names is for the owner, managers and cashiers." />;
  const stores = (await getAccessibleStores(profile)).filter((store) => store.is_active);
  const requested = (await searchParams).store;
  const store = stores.find((item) => item.id === requested) ?? stores[0];
  if (!store) return <AccessDenied message="No store is assigned to you." />;
  const supabase = await createClient();
  const { data } = await supabase.rpc("staff_match_overview", { p_store: store.id });
  const overview = data as unknown as Overview | null;
  if (!overview) return <AccessDenied message="Store access denied." />;

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Link className="text-sm font-medium text-muted" href="/app/employees">← Staff</Link>
        <h1 className="mt-2 text-3xl font-semibold">Match staff names</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Names on the sales bills are matched to the staff list (payslips), so each staff login shows its own sales and incentives are right. Same names match automatically every hour; please confirm the rest.</p>
        {stores.length > 1 ? (
          <nav className="mt-3 flex flex-wrap gap-2">
            {stores.map((item) => (
              <Link className={`rounded-full px-3 py-1.5 text-xs font-semibold ${item.id === store.id ? "bg-primary text-white" : "border border-border"}`} href={`/app/staff-match?store=${item.id}`} key={item.id}>{item.name}</Link>
            ))}
          </nav>
        ) : null}
        <p className="mt-3 text-sm font-semibold">{overview.linked} matched · {overview.certain.length} ready to match · {overview.likely.length} to confirm · {overview.unmatched.length} not found</p>
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

      <Panel title={`Matched (${overview.linked})`}>
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
      <select className={`${inputClass} max-w-64`} defaultValue="" name="employeeId">
        <option disabled value="">Choose staff member…</option>
        {staff.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.store}</option>)}
      </select>
    </ActionForm>
  );
}

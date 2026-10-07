import { ActionForm } from "@/components/accounts/action-form";
import { inputClass } from "@/components/accounts/fields";
import { AccessDenied } from "@/components/app/access-denied";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { sendBroadcast } from "@/lib/notifications/actions";
import { createClient } from "@/lib/supabase/server";

/** Owner: send a notice (with sound) to everyone, a store, a role, or one person. */
export default async function NotifyPage() {
  const { profile } = await requireProfile();
  if (profile.role !== "owner") return <AccessDenied message="Only the owner can send notifications." />;
  const supabase = await createClient();
  const [stores, { data: team }, { data: staff }] = await Promise.all([
    getAccessibleStores(profile),
    supabase.from("profiles").select("id,full_name,role").eq("is_active", true).in("role", ["owner", "manager", "cashier"]).order("full_name"),
    supabase.from("employee_auth_links").select("auth_user_id, employee_contacts(staff_name), stores(name)").eq("status", "active"),
  ]);
  const people = [
    ...(team ?? []).filter((person) => person.id !== profile.id).map((person) => ({ id: person.id, label: `${person.full_name ?? "—"} (${person.role})` })),
    ...(staff ?? []).map((row) => {
      const link = row as unknown as { auth_user_id: string; employee_contacts: { staff_name: string } | null; stores: { name: string } | null };
      return { id: link.auth_user_id, label: `${link.employee_contacts?.staff_name ?? "Staff"} (staff${link.stores ? `, ${link.stores.name}` : ""})` };
    }),
  ].sort((left, right) => left.label.localeCompare(right.label));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold">📣 Send a notification</h1>
        <p className="mt-2 text-sm leading-6 text-muted">It rings on their phone (if they turned notifications on) and stays in their 🔔 inbox. Between 10:30 PM and 9 AM it arrives without sound.</p>
      </div>
      <ActionForm action={sendBroadcast} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm" submitLabel="Send">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">To
            <select className={`${inputClass} mt-1`} defaultValue="everyone" name="audience">
              <option value="everyone">Everyone</option>
              <option value="managers">Managers and cashiers</option>
              <option value="staff">Staff</option>
              <option value="person">One person (choose below)</option>
            </select>
          </label>
          <label className="block text-sm font-medium">Store
            <select className={`${inputClass} mt-1`} defaultValue="" name="store">
              <option value="">Both stores</option>
              {stores.filter((store) => store.is_active).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium">Person (for “One person”)
          <select className={`${inputClass} mt-1`} defaultValue="" name="person">
            <option value="">—</option>
            {people.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Title
          <input className={`${inputClass} mt-1`} maxLength={80} name="title" placeholder="e.g. Sale starts Friday" required />
        </label>
        <label className="block text-sm font-medium">Message
          <textarea className="mt-1 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" maxLength={500} name="body" placeholder="Details (optional)" />
        </label>
      </ActionForm>
    </div>
  );
}

import { StaffChangePasswordForm } from "@/components/staff/change-password-form";
import { getStaffProfileSummary } from "@/lib/staff/portal";

export default async function StaffProfilePage() {
  const profile = await getStaffProfileSummary();
  if (!profile) return null;
  return <div className="space-y-5"><div><p className="text-sm font-medium text-muted">My account</p><h1 className="mt-2 text-3xl font-semibold">Profile</h1></div><section className="grid gap-3 rounded-[1.35rem] border border-border bg-card p-5">{[["Name", profile.name], ["Designation", profile.designation ?? "Not set"], ["Store", profile.store.name], ["Login email", profile.email], ["Account", profile.account_status]].map(([label, entry]) => <div className="border-b border-border pb-3 last:border-0 last:pb-0" key={label}><p className="text-xs text-muted">{label}</p><p className="mt-1 font-semibold">{entry}</p></div>)}</section><section className="rounded-[1.35rem] border border-border bg-card p-5"><h2 className="text-xl font-semibold">Change PIN</h2><div className="mt-4"><StaffChangePasswordForm /></div></section></div>;
}

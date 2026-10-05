import Link from "next/link";
import { Search, ShieldCheck, UserCheck, UserRoundPlus, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { AccountActionForm, PasswordFields } from "@/components/staff/account-action-form";
import { requireProfile } from "@/lib/auth/session";
import {
  createStaffAccount,
  decideStaffRequest,
  hasCredentialManagementGrant,
  requestStaffAccount,
  resetStaffTemporaryPassword,
  setStaffAccountActive,
  verifyCredentialManagementPassword,
  verifySalesAlias,
} from "@/lib/staff/actions";
import { getStaffAccountAdminData } from "@/lib/staff/admin";

export default async function StaffAccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const { profile } = await requireProfile();
  const { q = "", show = "" } = await searchParams;
  if (!profile || !["owner", "manager"].includes(profile.role)) return <AccessDenied />;
  const data = await getStaffAccountAdminData(profile);
  const credentialActionsUnlocked = await hasCredentialManagementGrant();
  const linkByEmployee = new Map(data.links.map((link) => [link.employee_contact_id, link]));
  const openRequestByEmployee = new Map(data.requests.filter((request) => ["pending", "approved"].includes(request.status)).map((request) => [request.employee_contact_id, request]));
  const aliasesByEmployee = new Map<string, typeof data.aliases>();
  for (const alias of data.aliases) {
    if (!alias.employee_contact_id) continue;
    aliasesByEmployee.set(alias.employee_contact_id, [...(aliasesByEmployee.get(alias.employee_contact_id) ?? []), alias]);
  }
  const active = data.links.filter((link) => link.status === "active").length;
  const inactive = data.links.filter((link) => link.status === "inactive").length;
  const pending = data.requests.filter((request) => request.status === "pending").length;
  // Staff who left are hidden unless asked for; search matches every word of the name or login email.
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const showLeft = show === "left";
  const shownEmployees = data.employees.filter((employee) => {
    if (!showLeft && employee.is_active === false) return false;
    const haystack = `${employee.staff_name} ${linkByEmployee.get(employee.id)?.login_email ?? ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">{profile.role === "owner" ? "Owner administration" : "Assigned stores"}</p>
        <h1 className="mt-2 text-3xl font-semibold">Staff Accounts</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Personal email/password accounts linked exactly to existing employees. Passwords are never stored or logged.</p>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        {credentialActionsUnlocked ? (
          <div><p className="font-semibold text-success">Password actions unlocked</p><p className="mt-1 text-sm text-muted">You can set up or reset multiple staff accounts for 15 minutes without entering your password again.</p></div>
        ) : (
          <AccountActionForm action={verifyCredentialManagementPassword} submitLabel="Unlock password actions for 15 minutes">
            <p className="text-sm text-muted">Enter your own password once, then set up multiple staff accounts.</p>
            <label className="grid gap-1 text-xs font-semibold text-muted">Your current password<input autoComplete="current-password" className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground" name="currentPassword" required type="password" /></label>
          </AccountActionForm>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ["Employees", data.employees.length, UsersRound],
          ["Active accounts", active, UserCheck],
          ["Pending requests", pending, UserRoundPlus],
          ["Inactive accounts", inactive, ShieldCheck],
        ] satisfies Array<[string, number, LucideIcon]>).map(([label, count, Icon]) => (
          <div className="rounded-2xl border border-border bg-card p-4" key={String(label)}>
            <Icon className="size-4 text-muted" />
            <p className="mt-3 text-2xl font-semibold">{String(count)}</p>
            <p className="text-xs font-medium text-muted">{String(label)}</p>
          </div>
        ))}
      </section>

      {profile.role === "owner" && data.requests.some((request) => request.status === "pending") ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Pending manager requests</h2>
          {data.requests.filter((request) => request.status === "pending").map((request) => {
            const employee = data.employees.find((item) => item.id === request.employee_contact_id);
            return (
              <div className="rounded-2xl border border-border bg-card p-4" key={request.id}>
                <p className="font-semibold">{employee?.staff_name ?? "Employee"}</p>
                <p className="mt-1 text-sm text-muted">{request.requested_email}</p>
                <p className="mt-1 text-xs text-muted">The manager has already issued the temporary code. Approval activates the blocked account.</p>
                <form action={decideStaffRequest} className="mt-3 flex flex-wrap gap-2">
                  <input name="requestId" type="hidden" value={request.id} />
                  <button className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={!credentialActionsUnlocked} name="decision" value="approved">Approve</button>
                  <button className="rounded-xl border border-border px-4 py-2 text-xs font-semibold disabled:opacity-50" disabled={!credentialActionsUnlocked} name="decision" value="rejected">Reject</button>
                </form>
              </div>
            );
          })}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Employees</h2>
        <form action="/app/staff-accounts" className="flex flex-wrap gap-2">
          <label className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input className="h-11 w-full rounded-2xl border border-border bg-card pl-10 pr-3 text-sm outline-none focus:border-primary" defaultValue={q} name="q" placeholder="Search staff name or email" type="search" />
          </label>
          <label className="flex h-11 items-center gap-2 rounded-2xl border border-border bg-card px-3 text-sm font-semibold">
            <input className="size-4 accent-black" defaultChecked={showLeft} name="show" type="checkbox" value="left" /> Show staff who left
          </label>
          <button className="h-11 rounded-2xl bg-primary px-5 text-sm font-semibold text-white" type="submit">Search</button>
          {q || showLeft ? <Link className="inline-flex h-11 items-center rounded-2xl border border-border px-4 text-sm font-semibold" href="/app/staff-accounts">Clear</Link> : null}
        </form>
        <p className="text-xs text-muted">{shownEmployees.length} of {data.employees.length} staff shown</p>
        {!shownEmployees.length ? <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">No staff found{q ? ` for “${q}”` : ""}.</p> : null}
        {shownEmployees.map((employee) => {
          const link = linkByEmployee.get(employee.id);
          const request = openRequestByEmployee.get(employee.id);
          const employeeAliases = aliasesByEmployee.get(employee.id) ?? [];
          const verifiedAliasCount = employeeAliases.filter((alias) => alias.verification_status === "verified" && alias.is_active).length;
          const store = data.stores.find((item) => item.id === employee.store_id);
          return (
            <details className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={employee.id}>
              <summary className="cursor-pointer list-none">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold">{employee.staff_name}{employee.is_active === false ? <span className="ml-2 text-xs font-semibold text-danger">Left</span> : null}</p><p className="mt-1 text-xs text-muted">{store?.name ?? "No store"} · {employee.designation ?? "Designation not set"}</p></div>
                  <div className="text-right text-xs font-semibold"><p>{link ? (link.status === "active" ? "Active account" : "Inactive account") : request ? `${request.status} request` : "Account not created"}</p><p className={verifiedAliasCount ? "mt-1 text-success" : "mt-1 text-warning"}>{verifiedAliasCount ? `${verifiedAliasCount} verified sales alias${verifiedAliasCount === 1 ? "" : "es"}` : "Sales linkage requires owner verification"}</p></div>
                </div>
              </summary>
              <div className="mt-5 grid gap-5 border-t border-border pt-5 lg:grid-cols-2">
                {!link && !request && credentialActionsUnlocked ? (
                  <AccountActionForm action={requestStaffAccount} submitLabel={profile.role === "owner" ? "Create staff account" : "Set password and request approval"}>
                    <input name="employeeId" type="hidden" value={employee.id} />
                    <label className="grid gap-1 text-xs font-semibold text-muted">Personal email<input autoComplete="email" className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground" name="email" required type="email" /></label>
                    <PasswordFields includeCurrent={false} />
                  </AccountActionForm>
                ) : null}
                {!link && request?.status === "approved" && credentialActionsUnlocked ? (
                  <AccountActionForm action={createStaffAccount} submitLabel="Create account and issue password">
                    <input name="employeeId" type="hidden" value={employee.id} />
                    <input name="requestId" type="hidden" value={request.id} />
                    <input name="email" type="hidden" value={request.requested_email} />
                    <p className="text-sm font-semibold">{request.requested_email}</p>
                    <PasswordFields includeCurrent={false} />
                  </AccountActionForm>
                ) : null}
                {link && credentialActionsUnlocked ? (
                  <AccountActionForm action={resetStaffTemporaryPassword} submitLabel="Reset temporary code">
                    <input name="employeeId" type="hidden" value={employee.id} />
                    <p className="text-sm font-semibold">{link.login_email}</p>
                    <PasswordFields includeCurrent={false} />
                  </AccountActionForm>
                ) : null}
                {profile.role === "owner" && link && credentialActionsUnlocked ? (
                  <form action={setStaffAccountActive} className="grid gap-3">
                    <input name="employeeId" type="hidden" value={employee.id} />
                    <input name="active" type="hidden" value={link.status === "active" ? "false" : "true"} />
                    <input className="h-11 rounded-xl border border-border bg-background px-3 text-sm" name="reason" placeholder="Reason" required={link.status === "active"} />
                    <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">{link.status === "active" ? "Deactivate account" : "Reactivate account"}</button>
                  </form>
                ) : null}
                {!credentialActionsUnlocked ? <p className="text-sm text-muted">Unlock password actions at the top of this page to set up or manage this account.</p> : null}
              </div>
            </details>
          );
        })}
      </section>

      {profile.role === "owner" ? (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Unverified sales aliases</h2>
            {data.aliases.filter((alias) => alias.verification_status !== "verified").slice(0, 100).map((alias) => (
              <form action={verifySalesAlias} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" key={alias.id}>
                <div><p className="text-xs text-muted">Source sales name</p><p className="font-semibold">{alias.source_name}</p></div>
                <label className="grid gap-1 text-xs font-semibold text-muted">Exact employee<select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" defaultValue={alias.employee_contact_id ?? ""} name="employeeId" required><option value="">Select exact employee</option>{data.employees.filter((employee) => employee.store_id === alias.store_id).map((employee) => <option key={employee.id} value={employee.id}>{employee.staff_name}</option>)}</select></label>
                <input name="aliasId" type="hidden" value={alias.id} /><button className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white">Owner verify</button>
              </form>
            ))}
          </section>
          <Link className="flex items-center justify-between gap-3 rounded-[1.35rem] border border-border bg-card p-4 text-sm font-semibold shadow-sm transition hover:border-primary" href="/app/staff-match">
            <span>🔗 Salary slips not matched to staff: {data.payrollRows.length}{data.payrollRows.length === 250 ? "+" : ""} rows. Same names match automatically; match or approve the rest here.</span>
            <span aria-hidden>→</span>
          </Link>
          <section className="space-y-3"><h2 className="text-xl font-semibold">Security history</h2>{data.events.slice(0, 50).map((event) => <div className="rounded-2xl border border-border bg-card p-4 text-sm" key={event.id}><p className="font-semibold">{event.event_type.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted">{new Date(event.created_at).toLocaleString("en-IN")} · {event.outcome}</p></div>)}</section>
        </>
      ) : null}
    </div>
  );
}

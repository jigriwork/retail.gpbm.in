import { ShieldCheck, UserCheck, UserRoundPlus, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { AccountActionForm, PasswordFields } from "@/components/staff/account-action-form";
import { requireProfile } from "@/lib/auth/session";
import {
  createStaffAccount,
  decideStaffRequest,
  hasCredentialManagementGrant,
  linkPayrollRow,
  requestStaffAccount,
  resetStaffTemporaryPassword,
  setStaffAccountActive,
  verifyCredentialManagementPassword,
  verifySalesAlias,
} from "@/lib/staff/actions";
import { getStaffAccountAdminData } from "@/lib/staff/admin";

export default async function StaffAccountsPage() {
  const { profile } = await requireProfile();
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
                  <button className="rounded-xl bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-50" disabled={!credentialActionsUnlocked} name="decision" value="approved">Approve</button>
                  <button className="rounded-xl border border-border px-4 py-2 text-xs font-semibold disabled:opacity-50" disabled={!credentialActionsUnlocked} name="decision" value="rejected">Reject</button>
                </form>
              </div>
            );
          })}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Employees</h2>
        {data.employees.map((employee) => {
          const link = linkByEmployee.get(employee.id);
          const request = openRequestByEmployee.get(employee.id);
          const employeeAliases = aliasesByEmployee.get(employee.id) ?? [];
          const verifiedAliasCount = employeeAliases.filter((alias) => alias.verification_status === "verified" && alias.is_active).length;
          const store = data.stores.find((item) => item.id === employee.store_id);
          return (
            <details className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={employee.id}>
              <summary className="cursor-pointer list-none">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold">{employee.staff_name}</p><p className="mt-1 text-xs text-muted">{store?.name ?? "No store"} · {employee.designation ?? "Designation not set"}</p></div>
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
                <input name="aliasId" type="hidden" value={alias.id} /><button className="h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">Owner verify</button>
              </form>
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Unlinked payroll rows</h2>
            <p className="text-sm text-muted">Link only after exact owner review. No name-based automatic authorization is used.</p>
            {data.payrollRows.slice(0, 100).map((row) => (
              <form action={linkPayrollRow} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" key={row.id}>
                <div><p className="font-semibold">{row.staff_name ?? "Unnamed"}</p><p className="text-xs text-muted">{row.salary_month}</p></div>
                <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" name="employeeId" required><option value="">Select exact employee</option>{data.employees.filter((employee) => employee.store_id === row.store_id).map((employee) => <option key={employee.id} value={employee.id}>{employee.staff_name}</option>)}</select>
                <input name="payslipRowId" type="hidden" value={row.id} /><button className="h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">Link payroll</button>
              </form>
            ))}
          </section>
          <section className="space-y-3"><h2 className="text-xl font-semibold">Security history</h2>{data.events.slice(0, 50).map((event) => <div className="rounded-2xl border border-border bg-card p-4 text-sm" key={event.id}><p className="font-semibold">{event.event_type.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted">{new Date(event.created_at).toLocaleString("en-IN")} · {event.outcome}</p></div>)}</section>
        </>
      ) : null}
    </div>
  );
}

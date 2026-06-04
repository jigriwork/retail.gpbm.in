import { AccessDenied } from "@/components/app/access-denied";
import {
  AssignStoreForm,
  CreateManagerForm,
  ManagerStoreAssignmentsForm,
  ProfileActiveForm,
} from "@/components/users/action-form";
import {
  assignManagerToStore,
  createManager,
  setProfileActive,
  updateManagerStoreAssignments,
} from "@/lib/auth/actions";
import { requireOwner, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function UsersPage() {
  const { profile } = await requireProfile();
  const owner = await requireOwner();

  if (!owner || profile?.role !== "owner") {
    return <AccessDenied />;
  }

  const supabase = await createClient();
  const [{ data: profiles }, { data: stores }, { data: assignments }] =
    await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("stores").select("id,name,code").eq("is_active", true).order("name"),
      supabase
        .from("store_users")
        .select("id,user_id,store_id,role,stores(id,name,code)")
        .order("created_at", { ascending: false }),
    ]);

  const managers = (profiles ?? []).filter((item) => item.role === "manager");
  const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-muted">Owner only</p>
        <h1 className="mt-2 text-3xl font-semibold">User management</h1>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Create manager</h2>
        <div className="mt-4">
          <CreateManagerForm
            action={createManager}
            disabled={!serviceRoleConfigured}
          />
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Quick assign manager to store</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Manager cards below support one or more assigned stores.
        </p>
        <div className="mt-4">
          <AssignStoreForm
            action={assignManagerToStore}
            managers={managers}
            stores={stores ?? []}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Profiles</h2>
        {(profiles ?? []).map((userProfile) => {
          const userAssignments = (assignments ?? []).filter(
            (assignment) => assignment.user_id === userProfile.id,
          );

          return (
            <div
              className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm"
              key={userProfile.id}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">
                    {userProfile.full_name ?? userProfile.email ?? "Unnamed user"}
                  </h3>
                  <p className="mt-1 text-sm text-muted">{userProfile.email}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full border border-border px-3 py-1 capitalize text-muted">
                      {userProfile.role}
                    </span>
                    <span className="rounded-full border border-border px-3 py-1 text-muted">
                      {userProfile.is_active === false ? "Inactive" : "Active"}
                    </span>
                  </div>
                  <div className="mt-4 text-sm leading-6 text-muted">
                    {userAssignments.length ? (
                      <div className="flex flex-wrap gap-2">
                        {userAssignments.map((assignment) => {
                          const store = Array.isArray(assignment.stores)
                            ? assignment.stores[0]
                            : assignment.stores;

                          return (
                            <span
                              className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted"
                              key={assignment.id}
                            >
                              {store?.name ?? "Store"}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p>No store assignments.</p>
                    )}
                  </div>
                  {userProfile.role === "manager" ? (
                    <div className="mt-4">
                      <ManagerStoreAssignmentsForm
                        action={updateManagerStoreAssignments}
                        assignedStoreIds={userAssignments
                          .map((assignment) => assignment.store_id)
                          .filter((storeId): storeId is string => Boolean(storeId))}
                        managerId={userProfile.id}
                        stores={stores ?? []}
                      />
                    </div>
                  ) : null}
                </div>
                {userProfile.role === "manager" ? (
                  <ProfileActiveForm
                    action={setProfileActive}
                    isActive={userProfile.is_active !== false}
                    userId={userProfile.id}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

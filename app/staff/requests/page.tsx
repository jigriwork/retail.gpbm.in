import { MyRequests, RequestForm } from "@/components/notifications/request-form";
import { createClient } from "@/lib/supabase/server";

export default async function StaffRequestsPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_team_requests");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold">Requests to owner</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Need something for the store, a day off, or have an idea? Write it here: the owner gets a notification and replies.</p>
      </div>
      <RequestForm />
      <h2 className="text-xl font-semibold">My requests</h2>
      <MyRequests items={(data ?? []) as never} />
    </div>
  );
}

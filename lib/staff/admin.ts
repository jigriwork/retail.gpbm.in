import "server-only";

import { getAccessibleStores, type Profile } from "@/lib/auth/session";
import { completeQuery } from "@/lib/supabase/complete-query";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export async function getStaffAccountAdminData(profile: Profile) {
  const supabase = await createClient();
  const stores = await getAccessibleStores(profile);
  const storeIds = stores.map((store) => store.id);
  if (!storeIds.length) return { aliases: [], employees: [], events: [], links: [], payrollRows: [], requests: [], stores };

  const [employees, links, requests, aliases] = await Promise.all([
    completeQuery(supabase.from("employee_contacts").select("id,staff_name,designation,store_id,is_active").in("store_id", storeIds).order("staff_name")),
    completeQuery(supabase.from("employee_auth_links").select("*").in("store_id", storeIds).order("created_at", { ascending: false })),
    completeQuery(supabase.from("staff_account_requests").select("*").in("store_id", storeIds).order("created_at", { ascending: false })),
    completeQuery(supabase.from("staff_name_aliases").select("id,source_name,employee_contact_id,store_id,verification_status,is_active").in("store_id", storeIds).eq("source_type", "sales_report").order("source_name")),
  ]);

  let events: Tables<"staff_security_events">[] = [];
  let payrollRows: Array<{ id: string; salary_month: string; staff_name: string | null; store_id: string | null }> = [];
  if (profile.role === "owner") {
    const [eventResult, payrollResult] = await Promise.all([
      completeQuery(supabase.from("staff_security_events").select("*").order("created_at", { ascending: false }).limit(100)),
      completeQuery(supabase.from("payslip_rows").select("id,salary_month,staff_name,store_id").is("employee_contact_id", null).in("store_id", storeIds).order("salary_month", { ascending: false }).limit(250)),
    ]);
    events = eventResult.data;
    payrollRows = payrollResult.data;
  }

  return {
    aliases: aliases.data,
    employees: employees.data,
    events,
    links: links.data,
    payrollRows,
    requests: requests.data,
    stores,
  };
}

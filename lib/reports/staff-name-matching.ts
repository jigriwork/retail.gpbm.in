import "server-only";
import { completeQuery } from "@/lib/supabase/complete-query";
import { staffNameKey } from "@/lib/employees/utils";
import { createClient } from "@/lib/supabase/server";

export async function getKnownSalesStaffNameKeys({
  client,
  staffNames,
  storeIds,
}: {
  /** Server-only client to use instead of the viewer's (cashiers cannot read staff lists). */
  client?: Awaited<ReturnType<typeof createClient>>;
  staffNames: string[];
  storeIds: string[];
}) {
  const normalizedNames = [...new Set(staffNames.map(staffNameKey).filter(Boolean))];
  const uniqueStoreIds = [...new Set(storeIds.filter(Boolean))];

  if (!normalizedNames.length || !uniqueStoreIds.length) {
    return new Set<string>();
  }

  const supabase = client ?? await createClient();
  const [aliasesResult, contactsResult] = await Promise.all([
    completeQuery(supabase
      .from("staff_name_aliases")
      .select("store_id,normalized_source_name", { count: "exact" })
      .in("store_id", uniqueStoreIds)
      .eq("source_type", "sales_report")
      .in("normalized_source_name", normalizedNames)),
    completeQuery(supabase
      .from("employee_contacts")
      .select("store_id,normalized_staff_name", { count: "exact" })
      .in("store_id", uniqueStoreIds)
      .in("normalized_staff_name", normalizedNames)),
  ]);

  const known = new Set<string>();

  for (const alias of aliasesResult.data ?? []) {
    if (alias.store_id && alias.normalized_source_name) {
      known.add(`${alias.store_id}:${alias.normalized_source_name}`);
    }
  }

  for (const contact of contactsResult.data ?? []) {
    if (contact.store_id && contact.normalized_staff_name) {
      known.add(`${contact.store_id}:${contact.normalized_staff_name}`);
    }
  }

  return known;
}

import { staffNameKey } from "@/lib/employees/utils";
import { createClient } from "@/lib/supabase/server";

export async function getKnownSalesStaffNameKeys({
  staffNames,
  storeIds,
}: {
  staffNames: string[];
  storeIds: string[];
}) {
  const normalizedNames = [...new Set(staffNames.map(staffNameKey).filter(Boolean))];
  const uniqueStoreIds = [...new Set(storeIds.filter(Boolean))];

  if (!normalizedNames.length || !uniqueStoreIds.length) {
    return new Set<string>();
  }

  const supabase = await createClient();
  const [aliasesResult, contactsResult] = await Promise.all([
    supabase
      .from("staff_name_aliases")
      .select("store_id,normalized_source_name")
      .in("store_id", uniqueStoreIds)
      .eq("source_type", "sales_report")
      .in("normalized_source_name", normalizedNames),
    supabase
      .from("employee_contacts")
      .select("store_id,normalized_staff_name")
      .in("store_id", uniqueStoreIds)
      .in("normalized_staff_name", normalizedNames),
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

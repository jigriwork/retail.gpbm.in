import { createClient } from "@/lib/supabase/server";
import { getAccessibleStores, type Profile } from "@/lib/auth/session";

export async function getActiveEmployeeStores(profile?: Profile | null) {
  const stores = await getAccessibleStores(profile);
  return stores.filter((store) => store.is_active && ["GP", "BM"].includes(store.code));
}

export async function getEmployeeContacts({
  query = "",
  storeId = "",
  missingOnly = false,
}: {
  missingOnly?: boolean;
  query?: string;
  storeId?: string;
}) {
  const supabase = await createClient();
  let builder = supabase
    .from("employee_contacts")
    .select("*, stores(id,name,code)")
    .order("staff_name");

  if (storeId) {
    builder = builder.eq("store_id", storeId);
  }

  const { data } = await builder;
  const normalizedQuery = query.trim().toLowerCase();
  const contacts = (data ?? []).filter((contact) =>
    missingOnly ? contact.is_active !== false && !contact.whatsapp_phone : true,
  );

  if (!normalizedQuery) {
    return contacts;
  }

  return contacts.filter((contact) => {
    const haystack = [
      contact.staff_name,
      contact.phone,
      contact.normalized_phone,
      contact.whatsapp_phone,
      contact.stores?.name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export async function getMissingEmployeePhoneCount(storeIds: string[]) {
  if (!storeIds.length) return 0;

  const supabase = await createClient();
  const { count } = await supabase
    .from("employee_contacts")
    .select("id", { count: "exact", head: true })
    .in("store_id", storeIds)
    .eq("is_active", true)
    .is("whatsapp_phone", null);

  return count ?? 0;
}

export async function getEmployeeContact(employeeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_contacts")
    .select("*, stores(id,name,code)")
    .eq("id", employeeId)
    .maybeSingle();

  return data;
}

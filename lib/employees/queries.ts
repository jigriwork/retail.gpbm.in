import { createClient } from "@/lib/supabase/server";

export async function getActiveEmployeeStores() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stores")
    .select("*")
    .eq("is_active", true)
    .in("code", ["GP", "BM"])
    .order("name");

  return data ?? [];
}

export async function getEmployeeContacts({
  query = "",
  storeId = "",
}: {
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
  const contacts = data ?? [];

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

export async function getEmployeeContact(employeeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_contacts")
    .select("*, stores(id,name,code)")
    .eq("id", employeeId)
    .maybeSingle();

  return data;
}

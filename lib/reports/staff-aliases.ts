import { revalidatePath } from "next/cache";

import { canAccessStore, getAccessibleStores, requireProfile, type Profile } from "@/lib/auth/session";
import { normalizeStaffName, staffNameKey } from "@/lib/employees/utils";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type StaffAliasState = {
  ok: boolean;
  message: string;
};

export type StaffAliasRow = Tables<"staff_name_aliases"> & {
  employee_contacts: Pick<Tables<"employee_contacts">, "id" | "staff_name"> | null;
  stores: { id: string; name: string; code: string } | null;
};

export type StaffContactOption = Pick<
  Tables<"employee_contacts">,
  "id" | "staff_name" | "store_id" | "is_active"
>;

export type UnmatchedStaffName = {
  storeId: string;
  sourceName: string;
  normalizedSourceName: string;
  rowCount: number;
  totalSale: number;
};

const sourceType = "sales_report";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function getWritableStores(profile: Profile) {
  return (await getAccessibleStores(profile)).filter((store) => store.is_active);
}

export async function getStaffAliasPageData({
  profile,
  search = "",
  storeId = "",
}: {
  profile: Profile | null;
  search?: string;
  storeId?: string;
}) {
  const stores = await getAccessibleStores(profile);
  const activeStoreIds = stores.map((store) => store.id);
  const selectedStoreIds =
    storeId && activeStoreIds.includes(storeId) ? [storeId] : activeStoreIds;

  if (!selectedStoreIds.length) {
    return {
      aliases: [] as StaffAliasRow[],
      contacts: [] as StaffContactOption[],
      stores,
      unmatched: [] as UnmatchedStaffName[],
    };
  }

  const supabase = await createClient();
  const [aliasesResult, contactsResult, salesResult] = await Promise.all([
    supabase
      .from("staff_name_aliases")
      .select("*, stores(id,name,code), employee_contacts(id,staff_name)")
      .in("store_id", selectedStoreIds)
      .eq("source_type", sourceType)
      .order("source_name"),
    supabase
      .from("employee_contacts")
      .select("id,staff_name,store_id,is_active")
      .in("store_id", selectedStoreIds)
      .order("staff_name"),
    supabase
      .from("sales_rows")
      .select("store_id,staff_name,net_sale")
      .in("store_id", selectedStoreIds)
      .not("staff_name", "is", null)
      .limit(5000),
  ]);

  const normalizedSearch = search.trim().toLowerCase();
  const aliases = ((aliasesResult.data ?? []) as StaffAliasRow[]).filter((alias) => {
    if (!normalizedSearch) return true;
    return [alias.source_name, alias.canonical_staff_name, alias.stores?.name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);
  });
  const contacts = ((contactsResult.data ?? []) as StaffContactOption[]).filter(
    (contact) => contact.is_active !== false,
  );
  const activeAliases = new Set(
    (aliasesResult.data ?? [])
      .filter((alias) => alias.is_active !== false)
      .map((alias) => `${alias.store_id}:${alias.normalized_source_name}`),
  );
  const unmatchedMap = new Map<string, UnmatchedStaffName>();

  for (const row of salesResult.data ?? []) {
    if (!row.store_id || !row.staff_name?.trim()) {
      continue;
    }

    const sourceName = normalizeStaffName(row.staff_name);
    const normalizedSourceName = staffNameKey(sourceName);
    const key = `${row.store_id}:${normalizedSourceName}`;

    if (activeAliases.has(key)) {
      continue;
    }

    const current =
      unmatchedMap.get(key) ??
      {
        storeId: row.store_id,
        sourceName,
        normalizedSourceName,
        rowCount: 0,
        totalSale: 0,
      };
    current.rowCount += 1;
    current.totalSale += Number(row.net_sale ?? 0);
    unmatchedMap.set(key, current);
  }

  const unmatched = [...unmatchedMap.values()]
    .filter((item) => {
      if (!normalizedSearch) return true;
      return item.sourceName.toLowerCase().includes(normalizedSearch);
    })
    .sort((a, b) => b.rowCount - a.rowCount);

  return { aliases, contacts, stores, unmatched };
}

export async function saveStaffAlias(
  _previous: StaffAliasState,
  formData: FormData,
): Promise<StaffAliasState> {
  const { profile } = await requireProfile();

  if (!profile || !["owner", "manager"].includes(profile.role) || profile.is_active === false) {
    return { ok: false, message: "Your account is not active." };
  }

  const storeId = readString(formData, "storeId");
  const sourceName = normalizeStaffName(readString(formData, "sourceName"));
  const employeeContactId = readString(formData, "employeeContactId");
  const isActive = formData.get("isActive") === "on";
  const createContact = employeeContactId === "__new";
  const supabase = await createClient();

  if (!storeId || !sourceName) {
    return { ok: false, message: "Choose a store and enter the source sales name." };
  }

  if (profile.role !== "owner" && !(await canAccessStore(storeId, profile))) {
    return { ok: false, message: "You can map aliases only for your assigned stores." };
  }

  const writableStores = await getWritableStores(profile);
  if (!writableStores.some((store) => store.id === storeId)) {
    return { ok: false, message: "Choose an active assigned store." };
  }

  let canonicalStaffName = sourceName;
  let contactId: string | null = null;

  if (createContact) {
    const { data: contact, error } = await supabase
      .from("employee_contacts")
      .upsert(
        {
          created_by: profile.id,
          is_active: true,
          normalized_staff_name: staffNameKey(sourceName),
          staff_name: sourceName,
          store_id: storeId,
        },
        { onConflict: "store_id,normalized_staff_name" },
      )
      .select("id,staff_name")
      .single();

    if (error || !contact) {
      return { ok: false, message: error?.message ?? "Unable to create staff contact." };
    }

    canonicalStaffName = contact.staff_name;
    contactId = contact.id;
  } else if (employeeContactId) {
    const { data: contact } = await supabase
      .from("employee_contacts")
      .select("id,staff_name,store_id,is_active")
      .eq("id", employeeContactId)
      .maybeSingle();

    if (!contact || contact.store_id !== storeId || contact.is_active === false) {
      return { ok: false, message: "Choose an active staff contact from the selected store." };
    }

    canonicalStaffName = contact.staff_name;
    contactId = contact.id;
  }

  const { error } = await supabase.from("staff_name_aliases").upsert(
    {
      canonical_staff_name: canonicalStaffName,
      created_by: profile.id,
      employee_contact_id: contactId,
      is_active: isActive,
      normalized_canonical_staff_name: staffNameKey(canonicalStaffName),
      normalized_source_name: staffNameKey(sourceName),
      source_name: sourceName,
      source_type: sourceType,
      store_id: storeId,
    },
    { onConflict: "store_id,normalized_source_name,source_type" },
  );

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/app/reports/staff-aliases");
  revalidatePath("/app/reports/staff");
  revalidatePath("/app/reports/sales/analytics");
  return { ok: true, message: "Staff alias saved." };
}

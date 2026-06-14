import { revalidatePath } from "next/cache";

import { canAccessStore, getAccessibleStores, requireProfile, type Profile } from "@/lib/auth/session";
import { normalizeStaffName, staffNameKey } from "@/lib/employees/utils";
import { createClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/lib/supabase/database.types";

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

type StaffAliasAuditSnapshot = Pick<
  Tables<"staff_name_aliases">,
  | "canonical_staff_name"
  | "employee_contact_id"
  | "id"
  | "is_active"
  | "normalized_canonical_staff_name"
  | "normalized_source_name"
  | "source_name"
  | "source_type"
  | "store_id"
>;

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function getWritableStores(profile: Profile) {
  return (await getAccessibleStores(profile)).filter((store) => store.is_active);
}

function aliasAuditSnapshot(alias: StaffAliasAuditSnapshot | null) {
  if (!alias) {
    return null;
  }

  return {
    canonical_staff_name: alias.canonical_staff_name,
    employee_contact_id: alias.employee_contact_id,
    is_active: alias.is_active,
    normalized_canonical_staff_name: alias.normalized_canonical_staff_name,
    normalized_source_name: alias.normalized_source_name,
    source_name: alias.source_name,
    source_type: alias.source_type,
    store_id: alias.store_id,
  };
}

function staffAliasAuditAction(
  existingAlias: StaffAliasAuditSnapshot | null,
  savedAlias: StaffAliasAuditSnapshot,
) {
  if (!existingAlias) {
    return "create_staff_alias";
  }

  if (existingAlias.is_active === false && savedAlias.is_active !== false) {
    return "activate_staff_alias";
  }

  if (existingAlias.is_active !== false && savedAlias.is_active === false) {
    return "inactivate_staff_alias";
  }

  return "update_staff_alias";
}

async function writeStaffAliasAuditLog({
  action,
  existingAlias,
  profile,
  savedAlias,
}: {
  action: string;
  existingAlias: StaffAliasAuditSnapshot | null;
  profile: Profile;
  savedAlias: StaffAliasAuditSnapshot;
}) {
  try {
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      action,
      actor_id: profile.id,
      actor_role: profile.role,
      entity_id: savedAlias.id,
      entity_type: "staff_name_alias",
      metadata: {
        actor_profile_id: profile.id,
        actor_role: profile.role,
        alias_id: savedAlias.id,
        new_values: aliasAuditSnapshot(savedAlias),
        old_values: aliasAuditSnapshot(existingAlias),
        source_name: savedAlias.source_name,
      } satisfies Json,
      store_id: savedAlias.store_id,
    });
  } catch {
    // Audit logging is best-effort; alias saves should remain available to managers.
  }
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
  "use server";

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
  const normalizedSourceName = staffNameKey(sourceName);

  const { data: existingAlias } = await supabase
    .from("staff_name_aliases")
    .select(
      "id,store_id,source_name,normalized_source_name,source_type,canonical_staff_name,normalized_canonical_staff_name,employee_contact_id,is_active",
    )
    .eq("store_id", storeId)
    .eq("normalized_source_name", normalizedSourceName)
    .eq("source_type", sourceType)
    .maybeSingle();

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

  const { data: savedAlias, error } = await supabase
    .from("staff_name_aliases")
    .upsert(
      {
        canonical_staff_name: canonicalStaffName,
        created_by: profile.id,
        employee_contact_id: contactId,
        is_active: isActive,
        normalized_canonical_staff_name: staffNameKey(canonicalStaffName),
        normalized_source_name: normalizedSourceName,
        source_name: sourceName,
        source_type: sourceType,
        store_id: storeId,
      },
      { onConflict: "store_id,normalized_source_name,source_type" },
    )
    .select(
      "id,store_id,source_name,normalized_source_name,source_type,canonical_staff_name,normalized_canonical_staff_name,employee_contact_id,is_active",
    )
    .single();

  if (error || !savedAlias) {
    return { ok: false, message: error?.message ?? "Unable to save staff alias." };
  }

  await writeStaffAliasAuditLog({
    action: staffAliasAuditAction(existingAlias, savedAlias),
    existingAlias,
    profile,
    savedAlias,
  });

  revalidatePath("/app/reports/staff-aliases");
  revalidatePath("/app/reports/staff");
  revalidatePath("/app/reports/sales/analytics");
  revalidatePath("/app/reports/business");
  revalidatePath("/app/today");
  revalidatePath(`/app/stores/${storeId}`);
  return { ok: true, message: "Staff alias saved." };
}

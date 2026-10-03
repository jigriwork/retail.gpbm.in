"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireFinance, getFinanceSession } from "@/lib/accounts/access";
import { isoDateOrNull, normalizeGstin, validGstin } from "@/lib/accounts/format";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type AccountsActionState = {
  ok: boolean;
  message: string;
  duplicates?: Array<{ id: string; name: string; reason: string }>;
};

const denied: AccountsActionState = { ok: false, message: "You do not have permission to change accounts masters." };

function text(formData: FormData, key: string, max = 200) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function optional(formData: FormData, key: string, max = 200) {
  return text(formData, key, max) || null;
}

function dbMessage(error: { message: string; code?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.code === "23505") return "That already exists. Search for it instead of adding it again.";
  if (error.code === "42501" || /row-level security/i.test(error.message)) return "You do not have permission for this firm or store.";
  return error.message;
}

function refresh(...paths: string[]) {
  for (const path of ["/app/accounts", ...paths]) revalidatePath(path);
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

// ---------------------------------------------------------------- parties

export async function saveParty(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("masters");
  if (!session) return denied;
  const id = text(formData, "partyId");
  const legalName = text(formData, "legalName");
  const gstin = normalizeGstin(text(formData, "gstin", 20));
  const gstinException = optional(formData, "gstinException", 300);
  if (legalName.length < 2) return { ok: false, message: "Enter the supplier's legal name as printed on its invoices." };
  if (!validGstin(gstin)) return { ok: false, message: "GSTIN must be 15 characters, like 21AAAAA0000A1Z5." };
  const stateCode = optional(formData, "stateCode", 2);
  if (stateCode && !/^\d{2}$/.test(stateCode)) return { ok: false, message: "State code is two digits, like 21 for Odisha." };

  const supabase = await createClient();
  // Suggest, never merge: same GSTIN, same PAN inside the GSTIN, or a
  // name/alias that matches after removing spaces and punctuation.
  if (!id && formData.get("confirmNew") !== "on") {
    const { data: parties } = await supabase.from("parties").select("id,legal_name,gstin").limit(2000);
    const { data: aliases } = await supabase.from("party_aliases").select("party_id,normalized").limit(5000);
    const key = normalize(legalName);
    const duplicates: NonNullable<AccountsActionState["duplicates"]> = [];
    for (const party of parties ?? []) {
      const other = normalize(party.legal_name);
      let reason = "";
      if (gstin && party.gstin === gstin) reason = "Same GSTIN";
      else if (gstin && party.gstin && party.gstin.slice(2, 12) === gstin.slice(2, 12)) reason = "Same PAN in GSTIN";
      else if (other === key) reason = "Same name";
      else if (key.length >= 5 && other.length >= 5 && (other.includes(key) || key.includes(other))) reason = "Similar name";
      else if ((aliases ?? []).some((alias) => alias.party_id === party.id && alias.normalized === key)) reason = "Matches an alias";
      if (reason) duplicates.push({ id: party.id, name: party.legal_name, reason });
    }
    if (duplicates.some((duplicate) => duplicate.reason === "Same GSTIN")) {
      return { ok: false, message: "A supplier with this GSTIN already exists. Open it instead.", duplicates };
    }
    if (duplicates.length) {
      return { ok: false, message: "This may already exist. Check the suppliers below, or tick “This is a different supplier” and save again.", duplicates };
    }
  }

  const values = {
    address: optional(formData, "address", 500),
    display_name: optional(formData, "displayName", 120),
    email: optional(formData, "email", 160),
    gstin,
    gstin_exception: gstin ? null : gstinException,
    is_active: formData.get("isActive") !== "off",
    legal_name: legalName,
    notes: optional(formData, "notes", 1000),
    phone: optional(formData, "phone", 40),
    state_code: stateCode,
  };
  if (id) {
    const { error } = await supabase.from("parties").update(values).eq("id", id);
    if (error) return { ok: false, message: dbMessage(error, "Could not save.") };
    refresh("/app/accounts/parties", `/app/accounts/parties/${id}`);
    return { ok: true, message: "Supplier saved. The change is kept in its history." };
  }
  const { data, error } = await supabase.from("parties").insert({ ...values, created_by: session.profile.id }).select("id").single();
  if (error) return { ok: false, message: dbMessage(error, "Could not add the supplier.") };
  refresh("/app/accounts/parties");
  redirect(`/app/accounts/parties/${data.id}?saved=1`);
}

export async function addPartyAlias(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("masters");
  if (!session) return denied;
  const partyId = text(formData, "partyId");
  const alias = text(formData, "alias");
  if (!partyId || alias.length < 2) return { ok: false, message: "Type the other spelling." };
  const supabase = await createClient();
  const { error } = await supabase.from("party_aliases").insert({ party_id: partyId, alias, created_by: session.profile.id });
  if (error) return { ok: false, message: dbMessage(error, "Could not add the spelling.") };
  refresh(`/app/accounts/parties/${partyId}`);
  return { ok: true, message: "Spelling added." };
}

// ---------------------------------------------------------------- agents

export async function saveAgent(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("masters");
  if (!session) return denied;
  const id = text(formData, "agentId");
  const name = text(formData, "name", 120);
  const partyId = text(formData, "partyId");
  if (name.length < 2) return { ok: false, message: "Enter the agent's name." };
  const supabase = await createClient();
  const values = {
    email: optional(formData, "email", 160),
    is_active: formData.get("isActive") !== "off",
    name,
    notes: optional(formData, "notes", 1000),
    phone: optional(formData, "phone", 40),
  };
  let agentId = id;
  if (id) {
    const { error } = await supabase.from("agents").update(values).eq("id", id);
    if (error) return { ok: false, message: dbMessage(error, "Could not save the agent.") };
  } else {
    const { data, error } = await supabase.from("agents").insert({ ...values, created_by: session.profile.id }).select("id").single();
    if (error) return { ok: false, message: dbMessage(error, "Could not add the agent.") };
    agentId = data.id;
  }
  if (partyId) {
    const { error } = await supabase.from("agent_parties").upsert(
      { agent_id: agentId, party_id: partyId, role: optional(formData, "role", 80), is_active: true, created_by: session.profile.id },
      { onConflict: "agent_id,party_id" },
    );
    if (error) return { ok: false, message: dbMessage(error, "Agent saved, but could not link the supplier.") };
    refresh(`/app/accounts/parties/${partyId}`);
  }
  refresh("/app/accounts/parties");
  return { ok: true, message: partyId ? "Agent saved and linked to this supplier." : "Agent saved." };
}

// ---------------------------------------------------------------- brands

export async function saveBrand(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("masters");
  if (!session) return denied;
  const id = text(formData, "brandId");
  const name = text(formData, "name", 120).toUpperCase();
  if (!name) return { ok: false, message: "Enter the brand name." };
  const supabase = await createClient();
  const values = {
    is_active: formData.get("isActive") !== "off",
    is_merchandise: formData.get("isMerchandise") !== "off",
    name,
    notes: optional(formData, "notes", 1000),
  };
  const { error } = id
    ? await supabase.from("brands").update(values).eq("id", id)
    : await supabase.from("brands").insert({ ...values, created_by: session.profile.id });
  if (error) return { ok: false, message: dbMessage(error, "Could not save the brand.") };
  refresh("/app/accounts/brands");
  return { ok: true, message: id ? "Brand saved." : `${name} added.` };
}

export async function addBrandAlias(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("masters");
  if (!session) return denied;
  const brandId = text(formData, "brandId");
  const alias = text(formData, "alias", 120);
  const source = text(formData, "source") || "sales";
  if (!brandId || !alias) return { ok: false, message: "Type the spelling used in the report or invoice." };
  if (!["sales", "stock", "invoice", "other"].includes(source)) return { ok: false, message: "Choose where the spelling appears." };
  const supabase = await createClient();
  const { error } = await supabase.from("brand_aliases").insert({ alias, brand_id: brandId, created_by: session.profile.id, source });
  if (error) return { ok: false, message: error.code === "23505" ? "That spelling is already linked to a brand." : dbMessage(error, "Could not add.") };
  refresh("/app/accounts/brands");
  return { ok: true, message: "Spelling linked." };
}

// ---------------------------------------------------------------- arrangements and terms

export async function saveArrangement(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("masters");
  if (!session) return denied;
  const id = text(formData, "arrangementId");
  const partyId = text(formData, "partyId");
  const brandId = text(formData, "brandId");
  const firmId = text(formData, "firmId");
  const storeId = optional(formData, "storeId");
  const validFrom = isoDateOrNull(text(formData, "validFrom"));
  const validTo = text(formData, "validTo") ? isoDateOrNull(text(formData, "validTo")) : null;
  const basis = text(formData, "settlementBasis") || "to_confirm";
  const status = text(formData, "status") || "draft";
  if (!partyId || !brandId || !firmId) return { ok: false, message: "Choose the supplier, brand and billing firm." };
  if (!validFrom) return { ok: false, message: "Choose the date this supplier started supplying the brand." };
  if (text(formData, "validTo") && !validTo) return { ok: false, message: "Check the end date." };
  if (validTo && validTo < validFrom) return { ok: false, message: "The end date must be after the start date." };
  if (!["purchase", "sales", "to_confirm"].includes(basis) || !["draft", "confirmed", "ended"].includes(status)) {
    return { ok: false, message: "Choose a valid payment basis and status." };
  }
  if (status === "confirmed" && basis === "to_confirm") return { ok: false, message: "Choose whether payment is against purchases or sold stock before confirming." };
  const values = {
    brand_id: brandId,
    firm_id: firmId,
    notes: optional(formData, "notes", 1000),
    party_id: partyId,
    settlement_basis: basis,
    status,
    store_id: storeId,
    valid_from: validFrom,
    valid_to: validTo,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("supply_arrangements").update(values).eq("id", id)
    : await supabase.from("supply_arrangements").insert({ ...values, created_by: session.profile.id });
  if (error) return { ok: false, message: dbMessage(error, "Could not save the supply arrangement.") };
  refresh("/app/accounts/terms", `/app/accounts/parties/${partyId}`, "/app/accounts/brands");
  return { ok: true, message: id ? "Supply arrangement updated; the old version is kept in history." : "Supply arrangement added." };
}

export async function saveTermsDraft(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("masters");
  if (!session) return denied;
  const arrangementId = text(formData, "arrangementId");
  const termsId = text(formData, "termsId");
  const effectiveFrom = isoDateOrNull(text(formData, "effectiveFrom"));
  const effectiveTo = text(formData, "effectiveTo") ? isoDateOrNull(text(formData, "effectiveTo")) : null;
  const whole = (key: string, max: number) => {
    const raw = text(formData, key, 10);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 && value <= max ? value : NaN;
  };
  const creditDays = whole("creditDays", 730);
  const earlyDays = whole("earlyPaymentDays", 365);
  const earlyPctRaw = text(formData, "earlyPaymentPct", 10);
  const earlyPct = earlyPctRaw ? Number(earlyPctRaw) : null;
  const cycle = text(formData, "paymentCycle") || "to_confirm";
  const base = optional(formData, "earlyPaymentBase");
  let rules: Json = {};
  const rulesText = typeof formData.get("rules") === "string" ? String(formData.get("rules")).trim() : "";
  if (rulesText) {
    try {
      const parsed = JSON.parse(rulesText) as Json;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      rules = parsed;
    } catch {
      return { ok: false, message: "Calculation rules must be a JSON object, like {\"margin\": {\"fresh\": 25}}." };
    }
  }
  if (!arrangementId || !effectiveFrom) return { ok: false, message: "Choose the arrangement and the date these terms start." };
  if (effectiveTo && effectiveTo < effectiveFrom) return { ok: false, message: "The end date must be after the start date." };
  if ([creditDays, earlyDays].some((value) => Number.isNaN(value))) return { ok: false, message: "Days must be whole numbers." };
  if (earlyPct !== null && !(earlyPct >= 0 && earlyPct <= 100)) return { ok: false, message: "Early-payment discount must be between 0 and 100%." };
  if (!["per_invoice", "monthly", "season", "other", "to_confirm"].includes(cycle)) return { ok: false, message: "Choose a payment cycle." };
  if (base && !["invoice_total", "taxable_value", "to_confirm"].includes(base)) return { ok: false, message: "Choose the early-payment discount base." };
  const values = {
    credit_days: creditDays,
    early_payment_base: earlyPct ? base ?? "to_confirm" : base,
    early_payment_days: earlyDays,
    early_payment_discount_pct: earlyPct,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    notes: optional(formData, "notes", 2000),
    payment_cycle: cycle,
    rules,
    source_document_id: optional(formData, "sourceDocumentId"),
  };
  const supabase = await createClient();
  if (termsId) {
    const { data, error } = await supabase.from("company_terms").update(values).eq("id", termsId).eq("status", "draft").select("id");
    if (error) return { ok: false, message: dbMessage(error, "Could not save.") };
    if (!data?.length) return { ok: false, message: "Only draft terms can be edited. Add a new version instead." };
  } else {
    const { data: latest } = await supabase.from("company_terms").select("version").eq("arrangement_id", arrangementId).order("version", { ascending: false }).limit(1);
    const version = (latest?.[0]?.version ?? 0) + 1;
    const { error } = await supabase.from("company_terms").insert({ ...values, arrangement_id: arrangementId, created_by: session.profile.id, version });
    if (error) return { ok: false, message: dbMessage(error, "Could not add the terms.") };
  }
  refresh("/app/accounts/terms");
  return { ok: true, message: "Draft terms saved. Drafts are never used for final figures until confirmed." };
}

export async function setTermsStatus(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await getFinanceSession();
  if (!session.can.masters && !session.can.approve) return denied;
  const termsId = text(formData, "termsId");
  const status = text(formData, "status");
  if (!termsId || !["confirmed", "retired"].includes(status)) return { ok: false, message: "Choose confirm or retire." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("company_terms").update({ status }).eq("id", termsId).neq("status", status).select("id");
  if (error) return { ok: false, message: dbMessage(error, "Could not change the terms.") };
  if (!data?.length) return { ok: false, message: "Nothing changed." };
  refresh("/app/accounts/terms");
  return { ok: true, message: status === "confirmed" ? "Terms confirmed. They can no longer be edited; add a new version for changes." : "Terms retired." };
}

// ---------------------------------------------------------------- firms, store mapping, series

export async function saveFirm(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("masters");
  if (!session) return denied;
  const id = text(formData, "firmId");
  const name = text(formData, "name", 120);
  const gstin = normalizeGstin(text(formData, "gstin", 20));
  const stateCode = optional(formData, "stateCode", 2);
  if (name.length < 2) return { ok: false, message: "Enter the firm name." };
  if (!validGstin(gstin)) return { ok: false, message: "GSTIN must be 15 characters." };
  if (stateCode && !/^\d{2}$/.test(stateCode)) return { ok: false, message: "State code is two digits." };
  const values = {
    address: optional(formData, "address", 500),
    gstin,
    is_active: formData.get("isActive") !== "off",
    legal_name: optional(formData, "legalName", 200),
    name,
    notes: optional(formData, "notes", 1000),
    state_code: stateCode,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("billing_firms").update(values).eq("id", id)
    : await supabase.from("billing_firms").insert({ ...values, created_by: session.profile.id });
  if (error) return { ok: false, message: dbMessage(error, "Could not save the firm.") };
  refresh("/app/accounts/firms");
  return { ok: true, message: id ? "Firm details saved." : "Firm added." };
}

function readMapping(formData: FormData) {
  const validFromRaw = text(formData, "validFrom");
  const validToRaw = text(formData, "validTo");
  const validFrom = validFromRaw ? isoDateOrNull(validFromRaw) : null;
  const validTo = validToRaw ? isoDateOrNull(validToRaw) : null;
  if ((validFromRaw && !validFrom) || (validToRaw && !validTo)) return { error: "Check the dates." };
  if (validFrom && validTo && validTo < validFrom) return { error: "The end date must be after the start date." };
  const status = text(formData, "status") || "to_confirm";
  if (!["confirmed", "to_confirm", "withdrawn"].includes(status)) return { error: "Choose a status." };
  const evidence = text(formData, "evidence", 1000);
  if (evidence.length < 3) return { error: "Say what the dates are based on (bill, invoice or owner instruction)." };
  return { evidence, status, validFrom, validTo };
}

export async function saveStoreFirmPeriod(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("masters");
  if (!session) return denied;
  const id = text(formData, "periodId");
  const mapping = readMapping(formData);
  if ("error" in mapping) return { ok: false, message: mapping.error ?? "Check the form." };
  const storeId = text(formData, "storeId");
  const firmId = text(formData, "firmId");
  if (!storeId || !firmId) return { ok: false, message: "Choose the store and firm." };
  const values = { evidence: mapping.evidence, firm_id: firmId, status: mapping.status, store_id: storeId, valid_from: mapping.validFrom, valid_to: mapping.validTo };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("store_firm_periods").update(values).eq("id", id)
    : await supabase.from("store_firm_periods").insert({ ...values, created_by: session.profile.id });
  if (error) return { ok: false, message: dbMessage(error, "Could not save.") };
  refresh("/app/accounts/firms");
  return { ok: true, message: "Store billing period saved. Earlier entries stay with the firm they were billed under." };
}

export async function saveBillingSeries(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("masters");
  if (!session) return denied;
  const id = text(formData, "seriesId");
  const mapping = readMapping(formData);
  if ("error" in mapping) return { ok: false, message: mapping.error ?? "Check the form." };
  const storeId = text(formData, "storeId");
  const firmId = text(formData, "firmId");
  const prefix = text(formData, "prefix", 20);
  const numberFrom = text(formData, "numberFrom", 12) ? Number(text(formData, "numberFrom", 12)) : null;
  const numberTo = text(formData, "numberTo", 12) ? Number(text(formData, "numberTo", 12)) : null;
  if (!storeId || !firmId || !prefix) return { ok: false, message: "Choose the store, firm and bill prefix (like GP-)." };
  if ([numberFrom, numberTo].some((value) => value !== null && !(Number.isInteger(value) && value >= 0))) return { ok: false, message: "Bill numbers must be whole numbers." };
  const values = {
    evidence: mapping.evidence, firm_id: firmId, number_from: numberFrom, number_to: numberTo, prefix, status: mapping.status,
    store_id: storeId, valid_from: mapping.validFrom, valid_to: mapping.validTo,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("billing_series").update(values).eq("id", id)
    : await supabase.from("billing_series").insert({ ...values, created_by: session.profile.id });
  if (error) return { ok: false, message: dbMessage(error, "Could not save.") };
  refresh("/app/accounts/firms");
  return { ok: true, message: "Bill series saved." };
}

export async function createStoreFromAccounts(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("masters");
  if (!session) return denied;
  const from = isoDateOrNull(text(formData, "validFrom"));
  if (!from) return { ok: false, message: "Choose the date the store starts billing." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("finance_create_store", {
    p_code: text(formData, "code", 10).toUpperCase(),
    p_firm: text(formData, "firmId"),
    p_from: from,
    p_location: optional(formData, "location", 80),
    p_name: text(formData, "name", 60),
  });
  if (error) return { ok: false, message: dbMessage(error, "Could not add the store.") };
  for (const path of ["/app/accounts/firms", "/app/stores", "/app/today", "/app/users"]) revalidatePath(path);
  return { ok: true, message: "Store added. Assign its manager under Users." };
}

// ---------------------------------------------------------------- access (owner only)

export async function grantFinanceAccess(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await getFinanceSession();
  if (!session.isOwner) return { ok: false, message: "Only an owner can give accounts access." };
  const userId = text(formData, "userId");
  const validFrom = isoDateOrNull(text(formData, "validFrom"));
  const validTo = text(formData, "validTo") ? isoDateOrNull(text(formData, "validTo")) : null;
  if (!userId || !validFrom) return { ok: false, message: "Choose the person and the start date." };
  const flag = (key: string) => formData.get(key) === "on";
  const values = {
    can_approve: flag("canApprove"),
    can_close_period: flag("canClose"),
    can_manage_masters: flag("canMasters"),
    can_post: flag("canPost"),
    can_view: true,
    firm_id: optional(formData, "firmId"),
    granted_by: session.profile.id,
    note: optional(formData, "note", 500),
    store_id: optional(formData, "storeId"),
    user_id: userId,
    valid_from: validFrom,
    valid_to: validTo,
  };
  const supabase = await createClient();
  const { error } = await supabase.from("finance_grants").insert(values);
  if (error) return { ok: false, message: dbMessage(error, "Could not give access.") };
  refresh("/app/accounts/access");
  return { ok: true, message: "Access given. It takes effect on the next page load." };
}

export async function revokeFinanceAccess(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await getFinanceSession();
  if (!session.isOwner) return { ok: false, message: "Only an owner can remove accounts access." };
  const grantId = text(formData, "grantId");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finance_grants")
    .update({ revoked_at: new Date().toISOString(), revoked_by: session.profile.id })
    .eq("id", grantId)
    .is("revoked_at", null)
    .select("id");
  if (error) return { ok: false, message: dbMessage(error, "Could not remove access.") };
  if (!data?.length) return { ok: false, message: "Already removed." };
  refresh("/app/accounts/access");
  return { ok: true, message: "Access removed. It stops immediately at the database." };
}

// ---------------------------------------------------------------- sales inputs

export async function confirmZeroSalesDay(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await getFinanceSession();
  const storeId = text(formData, "storeId");
  const saleDate = isoDateOrNull(text(formData, "saleDate"));
  if (!storeId || !saleDate) return { ok: false, message: "Choose the store and day." };
  const supabase = await createClient();
  const { error } = await supabase.from("sales_day_confirmations").upsert(
    { confirmed_by: session.profile.id, note: optional(formData, "note", 500), sale_date: saleDate, status: "zero_sales", store_id: storeId },
    { onConflict: "store_id,sale_date" },
  );
  if (error) return { ok: false, message: dbMessage(error, "Could not record the day.") };
  refresh("/app/accounts/inputs");
  return { ok: true, message: "Recorded: no sales that day." };
}

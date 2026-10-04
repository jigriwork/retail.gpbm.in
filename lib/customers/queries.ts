import "server-only";

import { createClient } from "@/lib/supabase/server";

export type CustomerRow = {
  mobile: string; name: string | null; first_visit: string; last_visit: string; bills: number; items: number; spend: number;
  store_count: number; marketing_consent: boolean; do_not_contact: boolean; birthday: string | null; last_message_at: string | null; total_count: number;
};

export type CustomerKpis = {
  bills: number; bills_with_mobile: number; customers: number; new_customers: number; returning_customers: number;
  repeat_customers_all_time: number; customers_all_time: number; spend_known_customers: number; spend_all: number;
};

export const customerSegments = [
  { value: "recent", label: "Bought in last 3 days", hint: "Send a thank-you with your Google review link." },
  { value: "new", label: "New (30 days)", hint: "First purchase in the last 30 days." },
  { value: "repeat", label: "Repeat", hint: "Two or more bills." },
  { value: "lapsed", label: "Lapsed", hint: "Two or more bills, but none in the last 90 days." },
  { value: "top", label: "Top spenders", hint: "Highest total spend." },
  { value: "birthday", label: "Birthdays this week", hint: "Birthday in the next 7 days (where recorded)." },
  { value: "all", label: "All", hint: "Everyone with a mobile on a bill." },
] as const;

export async function listCustomers(storeId: string | null, segment: string, search: string, page: number, pageSize = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_list", {
    p_store: storeId, p_segment: segment, p_search: search || null, p_limit: pageSize, p_offset: page * pageSize,
  });
  if (error) throw new Error("Customers could not be loaded. Please retry.");
  const rows = (data ?? []) as CustomerRow[];
  return { rows, total: Number(rows[0]?.total_count ?? 0) };
}

export async function customerKpis(storeId: string | null, from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_kpis", { p_store: storeId, p_from: from, p_to: to });
  if (error) throw new Error("Customer numbers could not be loaded. Please retry.");
  return data as unknown as CustomerKpis | null;
}

export async function customerPurchases(mobile: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_purchases", { p_mobile: mobile });
  if (error) throw new Error("Purchases could not be loaded. Please retry.");
  return data ?? [];
}

export async function customerProfile(mobile: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("customer_profiles").select("*").eq("mobile", mobile).maybeSingle();
  return data;
}

export async function customerMessagesFor(mobile: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("customer_messages").select("id,kind,sent_at,stores(name),profiles(full_name)")
    .eq("mobile", mobile).order("sent_at", { ascending: false }).limit(20);
  return data ?? [];
}

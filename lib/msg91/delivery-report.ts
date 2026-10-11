import "server-only";

import { createClient } from "@/lib/supabase/server";

// Owner-only view of MSG91 WhatsApp delivery status. Row-level security already
// limits whatsapp_deliveries to the owner; callers still gate on the role.

export type DeliveryRow = {
  id: string;
  kind: string;
  recipient: string;
  status: string;
  error_code: string | null;
  created_at: string;
  accepted_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  stores: { name: string } | null;
};

export type DeliveryCounts = { failed: number; read: number; reached: number; total: number; waiting: number };

const columns = "id,kind,recipient,status,error_code,created_at,accepted_at,delivered_at,read_at,failed_at,stores(name)";

export async function deliveryCounts(storeId: string, days = 30): Promise<DeliveryCounts> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const count = async (statuses?: string[]) => {
    let query = supabase.from("whatsapp_deliveries").select("id", { count: "exact", head: true })
      .eq("store_id", storeId).gte("created_at", since);
    if (statuses) query = query.in("status", statuses);
    const { count: value, error } = await query;
    if (error) throw new Error("WhatsApp delivery status could not be loaded.");
    return value ?? 0;
  };
  const [total, reached, read, failed] = await Promise.all([count(), count(["delivered", "read"]), count(["read"]), count(["failed"])]);
  return { failed, read, reached, total, waiting: Math.max(0, total - reached - failed) };
}

export async function recentDeliveries(storeIds: string[], limit = 25) {
  if (!storeIds.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("whatsapp_deliveries").select(columns)
    .in("store_id", storeIds).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error("WhatsApp delivery status could not be loaded.");
  return (data ?? []) as unknown as DeliveryRow[];
}

export async function deliveriesTo(mobile: string, limit = 20) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("whatsapp_deliveries").select(columns)
    .eq("recipient", `91${mobile}`).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error("WhatsApp delivery status could not be loaded.");
  return (data ?? []) as unknown as DeliveryRow[];
}

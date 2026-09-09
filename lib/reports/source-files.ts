import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function reserveSourceFile(storeId: string, bucket: "reports" | "review-photos", kind: string, fileName: string) {
  const client = await createClient();
  const { data, error } = await client.rpc("reserve_source_file", { p_store_id: storeId, p_bucket: bucket, p_kind: kind, p_file_name: fileName });
  if (error || !data) throw new Error("File upload is not authorized for this store.");
  return data;
}

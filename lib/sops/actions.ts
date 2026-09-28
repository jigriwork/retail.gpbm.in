"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwner } from "@/lib/auth/session";
import { parseSopSteps } from "@/lib/owner/phase2-shared";
import { createClient } from "@/lib/supabase/server";
import { updateCategories } from "@/lib/updates/constants";

export type SopActionState = {
  ok: boolean;
  message: string;
};

function value(formData: FormData, key: string, max = 600) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().slice(0, max) : "";
}

export async function saveSop(_state: SopActionState, formData: FormData): Promise<SopActionState> {
  const owner = await requireOwner();
  if (!owner) return { ok: false, message: "Only an active owner can change SOPs." };

  const title = value(formData, "title", 80);
  const parsed = parseSopSteps(value(formData, "steps", 5000));
  const exceptionCategory = value(formData, "exceptionCategory", 60);
  const sopKey = value(formData, "sopKey", 40).toLowerCase();
  if (!title) return { ok: false, message: "Add a short SOP title." };
  if (parsed.error) return { ok: false, message: parsed.error };
  if (!updateCategories.includes(exceptionCategory)) return { ok: false, message: "Choose the update category used for exceptions." };

  const fields = {
    escalate_when: value(formData, "escalateWhen", 600),
    exception_category: exceptionCategory,
    is_active: formData.get("isActive") === "on",
    purpose: value(formData, "purpose", 300),
    sort_order: Math.max(0, Math.min(999, Number.parseInt(value(formData, "sortOrder", 4), 10) || 100)),
    steps: parsed.steps,
    store_id: value(formData, "storeId") || null,
    title,
    updated_by: owner.profile.id,
    when_to_use: value(formData, "whenToUse", 200),
  };

  const supabase = await createClient();
  const sopId = value(formData, "sopId");
  if (sopId) {
    const { error } = await supabase.from("sops").update(fields).eq("id", sopId);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/app/sops");
    revalidatePath(`/app/sops/${sopId}/edit`);
    return { ok: true, message: "SOP saved. The previous version is kept in the history." };
  }

  if (!/^[a-z0-9-]{2,40}$/.test(sopKey)) {
    return { ok: false, message: "Use a short key of lowercase letters, numbers and dashes, for example bm-opening." };
  }
  const { data, error } = await supabase
    .from("sops")
    .insert({ ...fields, created_by: owner.profile.id, sop_key: sopKey })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, message: "An SOP with this key already exists for that store." };
    return { ok: false, message: error.message };
  }
  revalidatePath("/app/sops");
  redirect(`/app/sops/${data.id}/edit?saved=1`);
}

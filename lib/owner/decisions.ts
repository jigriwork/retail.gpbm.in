import "server-only";

import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { getIndiaToday } from "@/lib/tasks/dates";

export type BusinessDecision = Tables<"business_decisions"> & {
  followup: { id: string; title: string; source: string; evidence_text: string } | null;
  responsible: { id: string; full_name: string | null; email: string | null } | null;
  store: { id: string; name: string; code: string } | null;
  task: { id: string; title: string; status: string | null } | null;
};

export type DecisionEvidence = {
  basis?: string;
  caveat?: string;
  change_ratio?: number | null;
  comparison?: DecisionWindow;
  evaluated_at?: string;
  explanation?: string;
  measure_filter?: string | null;
  measure_type?: string;
  trial?: DecisionWindow;
  verdict?: string;
};

export type DecisionWindow = {
  bills: number;
  covered_store_days: number;
  coverage: number;
  days: number;
  end: string;
  expected_store_days: number;
  net_sale: number;
  start: string;
  value: number;
};

const decisionSelect = `
  *,
  store:stores(id,name,code),
  responsible:profiles!business_decisions_responsible_profile_id_fkey(id,full_name,email),
  task:tasks(id,title,status),
  followup:recommendation_followups(id,title,source,evidence_text)
`;

function missingTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error && (error.code === "42P01" || error.code === "PGRST205" || error.message?.includes("business_decisions")),
  );
}

export async function getDecisions(): Promise<{ available: boolean; decisions: BusinessDecision[] }> {
  if (!(await requireOwner())) return { available: false, decisions: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_decisions")
    .select(decisionSelect)
    .order("review_date", { ascending: true })
    .limit(300);
  if (missingTable(error)) return { available: false, decisions: [] };
  if (error) throw new Error(`Could not load decisions: ${error.message}`);
  return { available: true, decisions: (data ?? []) as unknown as BusinessDecision[] };
}

export async function getDecision(id: string) {
  if (!(await requireOwner())) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("business_decisions").select(decisionSelect).eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load decision: ${error.message}`);
  return (data as unknown as BusinessDecision | null) ?? null;
}

export async function previewDecisionEvidence(id: string): Promise<DecisionEvidence | null> {
  if (!(await requireOwner())) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("evaluate_business_decision", { p_decision_id: id });
  if (error) throw new Error(`Could not evaluate the decision: ${error.message}`);
  return (data as DecisionEvidence | null) ?? null;
}

export function readEvidence(value: Json | null | undefined): DecisionEvidence | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as unknown as DecisionEvidence) : null;
}

export function groupDecisions(decisions: BusinessDecision[], today = getIndiaToday()) {
  const open = decisions.filter((decision) => decision.status === "planned" || decision.status === "active");
  return {
    cancelled: decisions.filter((decision) => decision.status === "cancelled"),
    dueForReview: open.filter((decision) => decision.review_date <= today),
    planned: open.filter((decision) => decision.status === "planned" && decision.review_date > today),
    reviewed: decisions
      .filter((decision) => decision.status === "reviewed")
      .sort((left, right) => String(right.reviewed_at).localeCompare(String(left.reviewed_at))),
    running: open.filter((decision) => decision.status === "active" && decision.review_date > today),
  };
}

export async function getDecisionFormOptions() {
  if (!(await requireOwner())) return { people: [], stores: [] };
  const supabase = await createClient();
  const [people, stores] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,full_name,email,role")
      .eq("is_active", true)
      .in("role", ["owner", "manager"])
      .order("full_name"),
    supabase.from("stores").select("id,name,code").eq("is_active", true).order("name"),
  ]);
  return { people: people.data ?? [], stores: stores.data ?? [] };
}

export async function getFollowupForDecision(id: string) {
  if (!id || !(await requireOwner())) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("recommendation_followups")
    .select("id,title,evidence_text,source,task_id")
    .eq("id", id)
    .maybeSingle();
  return data;
}

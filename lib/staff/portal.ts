import "server-only";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

export type StaffProfileSummary = {
  account_status: string;
  designation: string | null;
  email: string;
  employee_id: string;
  must_change_password: boolean;
  name: string;
  sales_linkage_verified: boolean;
  store: { code: string; id: string; name: string };
};

export type StaffSalesSummary = {
  daily: Array<{ bill_count: number; quantity: number; sale_date: string; value: number }>;
  latest_uploaded_at: string | null;
  linkage_verified: boolean;
  source_through_date: string | null;
  summary: { bill_count: number; quantity: number; row_count: number; value: number };
};

export type StaffHomeSummary = {
  latest_payslip_month: string | null;
  notices: Array<{ created_at: string; details: string | null; title: string; urgency: string | null }>;
  pending_tasks: number;
  sales: StaffSalesSummary;
  today_value: number;
};

export type StaffTask = {
  category: string | null;
  completed_at: string | null;
  completion_note: string | null;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  id: string;
  priority: string | null;
  status: string | null;
  title: string;
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function getStaffProfileSummary() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_profile_summary");
  if (error) return null;
  return asRecord(data) as StaffProfileSummary | null;
}

export async function getStaffHomeSummary() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_home_summary");
  if (error) return null;
  return asRecord(data) as StaffHomeSummary | null;
}

export async function getMySalesSummary(start: string, end: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_sales_summary", {
    p_start: start,
    p_end: end,
  });
  if (error) throw new Error(error.message);
  return asRecord(data) as StaffSalesSummary;
}

export async function getMyTasks() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_tasks_list");
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []) as StaffTask[];
}

export async function getSalaryGrantToken() {
  const cookieStore = await cookies();
  return cookieStore.get("gpbm_staff_salary_grant")?.value ?? "";
}

export async function getMySalary() {
  const token = await getSalaryGrantToken();
  if (!token) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_salary_summary", { p_grant_token: token });
  if (error) return null;
  return asRecord(data) as { periods: Array<Record<string, unknown>> };
}

export async function getMyPayslips() {
  const token = await getSalaryGrantToken();
  if (!token) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_payslip_list", { p_grant_token: token });
  if (error) return null;
  return (Array.isArray(data) ? data : []) as Array<{
    created_at: string;
    file_name: string | null;
    id: string;
    salary_month: string;
  }>;
}

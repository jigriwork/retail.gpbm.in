import { redirect } from "next/navigation";

import { getCurrentProfile, getCurrentUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getCurrentProfile();
  redirect(profile?.role === "staff" ? "/staff" : profile?.role === "accountant" ? "/app/accounts" : profile?.role === "cashier" ? "/app/money" : "/app/today");
}

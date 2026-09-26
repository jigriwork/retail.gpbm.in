import { redirect } from "next/navigation";

import { getCurrentProfile, getCurrentUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getCurrentProfile();
  redirect(profile?.role === "staff" ? "/staff" : "/app/today");
}

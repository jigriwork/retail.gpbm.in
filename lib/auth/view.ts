import "server-only";

import { cookies, headers } from "next/headers";

import { isHandheld, pointerCookie } from "@/lib/auth/access";
import type { Profile } from "@/lib/auth/session";

/** True when sales, stock and salary figures should be left out for this viewer. */
export async function isLimitedView(profile: Pick<Profile, "role"> | null | undefined) {
  if (profile?.role !== "manager") return false;
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);
  return isHandheld({
    mobileHint: headerList.get("sec-ch-ua-mobile"),
    pointer: cookieStore.get(pointerCookie)?.value,
    userAgent: headerList.get("user-agent"),
  });
}

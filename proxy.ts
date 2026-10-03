import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { accountantAllows, handheldAllows, isHandheld, isManagerHours, pointerCookie } from "@/lib/auth/access";
import { isRemembered, rememberCookie, sessionCookieOptions } from "@/lib/auth/remember";
import type { Database } from "@/lib/supabase/database.types";

const publicAuthRoutes = new Set(["/login", "/forgot-password", "/reset-password"]);

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  if (publicAuthRoutes.has(request.nextUrl.pathname)) {
    return response;
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          const remember = isRemembered(request.cookies.get(rememberCookie)?.value);
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, sessionCookieOptions(options, remember));
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (user && (path.startsWith("/app") || path.startsWith("/api/tia"))) {
    const access = await profileAccess(supabase, user.id);
    if (access?.role === "accountant" && access.active && (path.startsWith("/api/tia") || !accountantAllows(path))) {
      if (request.method !== "GET" && request.method !== "HEAD") return new NextResponse(null, { status: 404 });
      return redirectKeepingCookies(response, new URL("/app/accounts", request.url));
    }
    if (access?.role === "manager" && access.active) {
      // Outside store hours the manager's session on this device ends.
      if (!isManagerHours()) {
        await supabase.auth.signOut({ scope: "local" });
        return redirectKeepingCookies(response, new URL("/login?error=hours", request.url));
      }
      const handheld = isHandheld({
        mobileHint: request.headers.get("sec-ch-ua-mobile"),
        pointer: request.cookies.get(pointerCookie)?.value,
        userAgent: request.headers.get("user-agent"),
      });
      if (handheld && path.startsWith("/app") && !handheldAllows(path)) {
        if (request.method !== "GET" && request.method !== "HEAD") return new NextResponse(null, { status: 404 });
        return redirectKeepingCookies(response, new URL("/app/today", request.url));
      }
    }
  }

  return response;
}

type ProxySupabase = ReturnType<typeof createServerClient<Database>>;

// Role and active flag, remembered for a minute so ordinary navigation does
// not add a database read to every request.
const accessTtlMs = 60_000;
const accessCache = new Map<string, { at: number; role: string | null; active: boolean }>();

async function profileAccess(supabase: ProxySupabase, userId: string) {
  const hit = accessCache.get(userId);
  if (hit && Date.now() - hit.at < accessTtlMs) return hit;
  const { data } = await supabase.from("profiles").select("role,is_active").eq("id", userId).maybeSingle();
  if (!data) return null;
  const entry = { at: Date.now(), role: data.role, active: data.is_active === true };
  accessCache.set(userId, entry);
  if (accessCache.size > 500) accessCache.delete(accessCache.keys().next().value!);
  return entry;
}

function redirectKeepingCookies(from: NextResponse, url: URL) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|favicon-32.png|favicon-48.png|icon.svg|icon-192.png|apple-touch-icon.png|manifest.webmanifest|sw.js).*)",
  ],
};

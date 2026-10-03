import { createBrowserClient } from "@supabase/ssr";

import { isRemembered, rememberCookie, sessionCookieOptions } from "@/lib/auth/remember";

type CookieOptions = {
  domain?: string;
  expires?: Date;
  maxAge?: number;
  path?: string;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
};

function readCookies() {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=");
      const name = index >= 0 ? part.slice(0, index) : part;
      const raw = index >= 0 ? part.slice(index + 1) : "";
      try {
        return { name, value: decodeURIComponent(raw) };
      } catch {
        return { name, value: raw };
      }
    });
}

function writeCookie(name: string, value: string, options: CookieOptions) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? "/"}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.sameSite) parts.push(`SameSite=${options.sameSite === true ? "Strict" : options.sameSite}`);
  if (options.secure) parts.push("Secure");
  document.cookie = parts.join("; ");
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return readCookies();
        },
        setAll(cookiesToSet) {
          const remember = isRemembered(readCookies().find((cookie) => cookie.name === rememberCookie)?.value);
          cookiesToSet.forEach(({ name, value, options }) => {
            writeCookie(name, value, sessionCookieOptions(options as CookieOptions, remember));
          });
        },
      },
    },
  );
}

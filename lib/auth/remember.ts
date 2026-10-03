export const rememberCookie = "gpbm-remember";
export const rememberedEmailKey = "gpbm-login-email";

type CookieLifetime = { maxAge?: number; expires?: Date };

/** "Remember me" is on unless the login form set the cookie to "0". */
export function isRemembered(value: string | undefined) {
  return value !== "0";
}

// With "Remember me" off the sign-in cookies are written without an expiry,
// so the browser drops them when it is closed. Removals (maxAge 0) are kept
// as they are so sign-out still clears the cookies.
export function sessionCookieOptions<T extends CookieLifetime>(options: T, remember: boolean): T {
  if (remember || options.maxAge === 0) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}

import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture } from "./helpers/app-fixture.mjs";

const supabaseOptions = { path: "/", sameSite: "lax", httpOnly: false, maxAge: 400 * 24 * 60 * 60 };

test("remember me keeps the sign-in cookies for 400 days", () => {
  const { isRemembered, sessionCookieOptions } = fixture().load("@/lib/auth/remember");
  assert.equal(isRemembered(undefined), true);
  assert.equal(isRemembered("1"), true);
  assert.deepEqual({ ...sessionCookieOptions(supabaseOptions, true) }, supabaseOptions);
});

test("without remember me the sign-in cookies end with the browser", () => {
  const { isRemembered, sessionCookieOptions } = fixture().load("@/lib/auth/remember");
  assert.equal(isRemembered("0"), false);
  assert.deepEqual({ ...sessionCookieOptions({ ...supabaseOptions, expires: new Date() }, false) }, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
  });
  // Sign-out removals still expire the cookie.
  assert.deepEqual({ ...sessionCookieOptions({ ...supabaseOptions, maxAge: 0 }, false) }, { ...supabaseOptions, maxAge: 0 });
});

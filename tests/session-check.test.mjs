import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture } from "./helpers/app-fixture.mjs";

// A brief network or server problem must never look like being logged out.
const networkError = { __isAuthError: true, message: "fetch failed", name: "AuthRetryableFetchError", status: 0 };
const missingSession = { __isAuthError: true, message: "Auth session missing!", name: "AuthSessionMissingError", status: 400 };
const rejected = { __isAuthError: true, message: "Invalid Refresh Token", name: "AuthApiError", status: 400 };

function withUser(result) {
  const f = fixture({ role: "owner" });
  // The login is checked with getClaims (token verified on the server).
  f.client.auth.getClaims = async () => ({ data: result.data.user ? { claims: { sub: result.data.user.id } } : null, error: result.error });
  return f;
}

test("a network failure while checking the login shows 'try again', not the login page", async () => {
  const session = withUser({ data: { user: null }, error: networkError }).load("@/lib/auth/session");
  await assert.rejects(session.requireProfile(), (error) => error.name === "SessionCheckError" && /still logged in/.test(error.message));
});

test("a server error (5xx) is also a temporary problem", async () => {
  const session = withUser({ data: { user: null }, error: { __isAuthError: true, message: "Bad gateway", name: "AuthUnknownError", status: 502 } }).load("@/lib/auth/session");
  await assert.rejects(session.getCurrentUser(), (error) => error.name === "SessionCheckError");
});

test("no session or a rejected/expired session goes to the login page", async () => {
  for (const error of [missingSession, rejected]) {
    const session = withUser({ data: { user: null }, error }).load("@/lib/auth/session");
    assert.equal(await session.getCurrentUser(), null);
    await assert.rejects(session.requireProfile(), /Redirect: \/login$/);
  }
});

test("a failed profile read is a connection problem, never 'Account inactive'", async () => {
  const f = fixture({ role: "owner" });
  const from = f.client.from;
  f.client.from = (table) => {
    if (table !== "profiles") return from(table);
    const failing = { select: () => failing, eq: () => failing, maybeSingle: async () => ({ data: null, error: { message: "timeout", code: "57014" } }) };
    return failing;
  };
  const session = f.load("@/lib/auth/session");
  await assert.rejects(session.requireProfile(), (error) => error.name === "SessionCheckError");
});

test("an inactive account still sees the inactive message", async () => {
  const f = fixture({ role: "owner" });
  const from = f.client.from;
  f.client.from = (table) => {
    if (table !== "profiles") return from(table);
    const inactive = { select: () => inactive, eq: () => inactive, maybeSingle: async () => ({ data: { id: "actor", is_active: false, role: "manager" }, error: null }) };
    return inactive;
  };
  await assert.rejects(f.load("@/lib/auth/session").requireProfile(), /Redirect: \/login\?error=inactive/);
});

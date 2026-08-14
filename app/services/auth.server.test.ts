import assert from "node:assert/strict";
import test from "node:test";
import { commitSession, getSession } from "./auth.server";

test("persists the authenticated user in the signed session cookie", async () => {
  const session = await getSession();
  session.set("userId", "507f1f77bcf86cd799439011");

  const cookie = await commitSession(session);
  const restored = await getSession(cookie);

  assert.equal(restored.get("userId"), "507f1f77bcf86cd799439011");
  assert.match(cookie, /^__rabbit_auth=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

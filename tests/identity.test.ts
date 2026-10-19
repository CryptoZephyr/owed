import { test } from "node:test";
import assert from "node:assert/strict";
import { payPalProfileFromCode } from "../src/lib/paypal/identity";

process.env.PAYPAL_CLIENT_ID = "test-client";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PAYPAL_ENVIRONMENT = "sandbox";

async function profileFromWire(wire: Record<string, unknown>) {
  const original = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
    requested.push(path);
    return Response.json(path === "/v1/oauth2/token" ? { access_token: "fake", expires_in: 3600 } : wire);
  };
  try {
    const profile = await payPalProfileFromCode("dummy");
    assert.deepEqual(requested, ["/v1/oauth2/token", "/v1/identity/openidconnect/userinfo"]);
    return profile;
  } finally { globalThis.fetch = original; }
}

const account = { user_id: "user", payer_id: "payer", verified_account: true };

test("PayPal's email_verified claim applies only to the profile email", async () => {
  const verified = await profileFromWire({ ...account, email: "Candidate@Example.test", email_verified: true,
    emails: [{ value: "other@example.test", primary: true }] });
  assert.equal(verified.email, "candidate@example.test");
  assert.equal(verified.emailVerified, true);
  for (const wire of [{ ...account, email: "candidate@example.test", email_verified: false },
    { ...account, email: "candidate@example.test" },
    { ...account, email_verified: true, emails: [{ value: "candidate@example.test", primary: true }] }]) {
    assert.equal((await profileFromWire(wire)).emailVerified, false);
  }
  assert.equal((await profileFromWire({ ...account, verified_account: false, email: "candidate@example.test", email_verified: true })).verified, false);
});

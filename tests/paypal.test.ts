import { test } from "node:test";
import assert from "node:assert/strict";
import { PaypalClient } from "paypal";
import { authorizeRoleHold, chargeGuarantee, createRoleHold, getCapture, getOrderHold, releaseHold, renewHold } from "../src/lib/paypal/holds";
import { createPayPalClient } from "../src/lib/paypal/sdk";
import { duplicatePayoutBatch, getPayoutBatch, payCandidate } from "../src/lib/paypal/payouts";
import { createProvider } from "../src/lib/owed/worker";
import type { Operation } from "../src/lib/owed/worker";
import { httpResponseFor, translatePayPalFailure } from "../src/lib/paypal/errors";
import { PayPalRestConnectionError, PayPalRestError } from "../src/lib/paypal/rest";

process.env.PAYPAL_CLIENT_ID = "test-client";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PAYPAL_ENVIRONMENT = "sandbox";
process.env.PAYPAL_CLIENT_LOG = "debug";

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const authorization = { id: "AUTH", status: "CREATED", amount: { currency_code: "USD", value: "10.00" }, expiration_time: "2026-11-15T00:00:00Z" };

function stub(...responses: (Response | Error)[]) {
  const requests: { path: string; method: string; requestId: string | null; body: unknown }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, "https://api-m.sandbox.paypal.com");
    if (url.pathname === "/v1/oauth2/token") return json({ access_token: "test-access", token_type: "Bearer", expires_in: 3600 });
    requests.push({ path: url.pathname, method: request.method, requestId: request.headers.get("PayPal-Request-Id"), body: request.body ? JSON.parse(await request.text()) : undefined });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected extra PayPal request");
    if (response instanceof Error) throw response;
    return response;
  };
  const client = new PaypalClient({ fetch, serverOptions: { baseUrl: "https://api-m.sandbox.paypal.com" }, oauth2: { clientId: "test-client", clientSecret: "test-secret" }, retry: { maxRetries: 0 }, logging: { level: "off", logRequestBody: false } });
  return { client, requests, fetch };
}

test("SDK factory keeps logging explicitly off even with debug in the environment", async () => {
  const fake = stub(json(authorization));
  const seen: unknown[][] = [];
  const original = console.log;
  console.log = (...args) => { seen.push(args); };
  try {
    const result = await createPayPalClient(fake.fetch).payments.getAuthorizedPayment({ authorizationId: "AUTH" });
    assert.equal(result.id, "AUTH");
    assert.equal(seen.length, 0);
  } finally { console.log = original; }
});

test("create hold sends one purchase unit and a stable business request id", async () => {
  const fake = stub(json({ id: "ORDER", links: [{ href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER", rel: "payer-action" }] }));
  assert.equal((await createRoleHold({ roleId: "role-1", amountCents: 1000, description: "Interview guarantee", returnUrl: "https://owed.example/return", cancelUrl: "https://owed.example/cancel" }, fake.client)).orderId, "ORDER");
  assert.equal(fake.requests[0]?.requestId, "owed-role-hold-role-1");
  const body = fake.requests[0]?.body as { intent: string; purchase_units: { amount: { value: string } }[] };
  assert.equal(body.intent, "AUTHORIZE");
  assert.equal(body.purchase_units.length, 1);
  assert.equal(body.purchase_units[0]?.amount.value, "10.00");
});

test("authorize and readback map PayPal wire models to the same snapshot", async () => {
  const wire = { purchase_units: [{ payments: { authorizations: [authorization] } }], payer: { payer_id: "PAYER" } };
  const fake = stub(json(wire), json(wire));
  const result = await authorizeRoleHold("ORDER", fake.client);
  assert.equal(result.hold.amountCents, 1000);
  assert.equal(result.payerId, "PAYER");
  assert.deepEqual(await getOrderHold("ORDER", fake.client), { hold: result.hold, payerId: "PAYER" });
  assert.equal(fake.requests[0]?.requestId, "owed-authorize-ORDER");
});

test("charge sends integer-cents conversion and never final-captures the remaining role hold", async () => {
  const wire = { id: "CAPTURE", status: "COMPLETED", amount: { currency_code: "USD", value: "10.00" } };
  const fake = stub(json(wire), json(wire));
  const result = await chargeGuarantee({ authorizationId: "AUTH", guaranteeId: "g-1", amountCents: 1000, finalCapture: false }, fake.client);
  assert.equal(result.captureId, "CAPTURE");
  assert.deepEqual(fake.requests[0], { path: "/v2/payments/authorizations/AUTH/capture", method: "POST", requestId: "owed-charge-g-1", body: { amount: { currency_code: "USD", value: "10.00" }, final_capture: false } });
  assert.equal((await getCapture("CAPTURE", fake.client)).amountCents, 1000);
  assert.equal(fake.requests[1]?.method, "GET");
});

test("renew uses the original authorization business key, and void is verified by a GET", async () => {
  const fake = stub(json({ ...authorization, id: "NEW" }), new Response(null, { status: 204 }), json({ ...authorization, id: "NEW", status: "VOIDED" }));
  assert.equal((await renewHold("AUTH", fake.client)).authorizationId, "NEW");
  assert.equal((await releaseHold({ authorizationId: "NEW", roleId: "role-1" }, fake.client)).status, "VOIDED");
  assert.equal(fake.requests[0]?.requestId, "owed-renew-AUTH");
  assert.equal(fake.requests[1]?.requestId, "owed-release-role-1-NEW");
  assert.equal(fake.requests[2]?.method, "GET");
});

test("a write without a response is unknown, not rejected or automatically resent", async () => {
  const fake = stub(new TypeError("Network failure"));
  await assert.rejects(chargeGuarantee({ authorizationId: "AUTH", guaranteeId: "g", amountCents: 1000, finalCapture: false }, fake.client), (error) => translatePayPalFailure(error, { write: true }).kind === "unknown_outcome");
  assert.equal(fake.requests.length, 1);
});

test("missing required values and unexpected currency never create a false success", async () => {
  for (const wire of [{ id: "CAPTURE" }, { id: "CAPTURE", status: "COMPLETED", amount: { currency_code: "EUR", value: "10.00" } }]) {
    const fake = stub(json(wire));
    await assert.rejects(chargeGuarantee({ authorizationId: "AUTH", guaranteeId: "g", amountCents: 1000, finalCapture: false }, fake.client), (error) => translatePayPalFailure(error, { write: true }).kind === "unknown_outcome");
  }
});

test("duplicate payout extracts only the original batch on the configured PayPal host", () => {
  const duplicate = (href: string) => new PayPalRestError(400, JSON.stringify({ name: "USER_BUSINESS_ERROR", details: [{ field: "SENDER_BATCH_ID", issue: "Batch with given sender_batch_id already exists", link: [{ href, method: "GET", rel: "self" }] }] }), "debug");
  assert.equal(duplicatePayoutBatch(duplicate("https://api-m.sandbox.paypal.com/v1/payments/payouts/2T9UZG3X22C74")), "2T9UZG3X22C74");
  for (const href of ["https://evil.test/v1/payments/payouts/BATCH", "https://api-m.paypal.com/v1/payments/payouts/BATCH", "https://user:pass@api-m.sandbox.paypal.com/v1/payments/payouts/BATCH", "https://api-m.sandbox.paypal.com/v1/payments/payouts/BATCH?next=evil", "https://api-m.sandbox.paypal.com/v1/payments/payouts/../BATCH"]) assert.equal(duplicatePayoutBatch(duplicate(href)), undefined);
});

test("error boundary covers status families without swallowing programmer errors", () => {
  for (const [status, kind, http] of [[422, "rejected", 422], [401, "credentials", 502], [403, "credentials", 502], [429, "rate_limited", 503], [503, "provider_error", 502]] as const) {
    const failure = translatePayPalFailure(new PayPalRestError(status, JSON.stringify({ message: "Rejected", debug_id: "debug" }), "debug"), { write: true });
    assert.equal(failure.kind, kind);
    assert.equal(httpResponseFor(failure).status, http);
  }
  assert.equal(translatePayPalFailure(new PayPalRestConnectionError(null), { write: false }).kind, "unreachable");
  assert.equal(translatePayPalFailure(new DOMException("Deadline", "TimeoutError"), { write: true }).kind, "unknown_outcome");
  assert.throws(() => translatePayPalFailure(new Error("Programming bug"), { write: true }), /Programming bug/);
});

const operation = (kind: string, input: Record<string, unknown>, result: Record<string, unknown> | null = null): Operation => ({
  id: "operation", role_id: "role", business_key: "key", kind, input, result, state: "processing", attempts: 2, lease_token: "lease", first_sent_at: new Date(),
});

test("unknown create and charge replay the original request id after the provider read", async () => {
  const create = stub(json({ id: "ORDER", links: [{ href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER", rel: "approve" }] }));
  assert.equal((await createProvider(create.client)(operation("create_hold", { roleId: "role", amountCents: 1000, description: "Guarantee", returnUrl: "https://owed.example/return", cancelUrl: "https://owed.example/cancel" }))).state, "succeeded");
  assert.equal(create.requests[0]?.requestId, "owed-role-hold-role");
  const charge = stub(json(authorization), json({ id: "CAPTURE", status: "COMPLETED", amount: { currency_code: "USD", value: "10.00" } }));
  assert.equal((await createProvider(charge.client)(operation("charge_guarantee", { authorizationId: "AUTH", guaranteeId: "key", amountCents: 1000, finalCapture: false }))).state, "succeeded");
  assert.deepEqual(charge.requests.map((r) => r.method), ["GET", "POST"]);
  assert.equal(charge.requests[1]?.requestId, "owed-charge-key");
});

test("unknown authorization and void settle by reads without sending a new write", async () => {
  const authorize = stub(json({ purchase_units: [{ payments: { authorizations: [authorization] } }], payer: { payer_id: "PAYER" } }));
  assert.equal((await createProvider(authorize.client)(operation("authorize_hold", { orderId: "ORDER", payerId: "PAYER", amountCents: 1000 }))).state, "succeeded");
  assert.deepEqual(authorize.requests.map((r) => r.method), ["GET"]);
  const release = stub(json({ ...authorization, status: "VOIDED" }));
  assert.equal((await createProvider(release.client)(operation("release_hold", { authorizationId: "AUTH", roleId: "role" }))).state, "succeeded");
  assert.deepEqual(release.requests.map((r) => r.method), ["GET"]);
});

test("unknown renewal reuses its original key, old ambiguous writes stop for manual review", async () => {
  const renew = stub(json(authorization), json({ ...authorization, id: "NEW" }));
  assert.equal((await createProvider(renew.client)(operation("renew_hold", { authorizationId: "AUTH" }))).state, "succeeded");
  assert.equal(renew.requests[1]?.requestId, "owed-renew-AUTH");
  const expired = operation("create_hold", {});
  expired.first_sent_at = new Date(Date.now() - 6 * 60000);
  assert.equal((await createProvider(stub().client)(expired)).state, "manual_review");
});

test("pending capture is read by its saved capture id and cannot trigger a second charge", async () => {
  const fake = stub(json({ id: "CAPTURE", status: "COMPLETED", amount: { currency_code: "USD", value: "10.00" } }));
  const op = operation("charge_guarantee", { amountCents: 1000 }, { captureId: "CAPTURE" });
  op.first_sent_at = new Date(Date.now() - 86400000);
  assert.equal((await createProvider(fake.client)(op)).state, "succeeded");
  assert.deepEqual(fake.requests.map((r) => r.method), ["GET"]);
});

test("payout duplicate replay keeps the same sender id and polls the original batch", async () => {
  const original = globalThis.fetch;
  const bodies: unknown[] = [];
  let sends = 0;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/v1/oauth2/token") return json({ access_token: "test-access", expires_in: 3600 });
    if (request.method === "POST") {
      bodies.push(JSON.parse(await request.text())); sends++;
      return sends === 1 ? json({ batch_header: { payout_batch_id: "BATCH", batch_status: "PENDING" } }, 201)
        : json({ name: "USER_BUSINESS_ERROR", details: [{ field: "SENDER_BATCH_ID", issue: "Batch with given sender_batch_id already exists", link: [{ href: "https://api-m.sandbox.paypal.com/v1/payments/payouts/BATCH", method: "GET" }] }] }, 400);
    }
    assert.equal(path, "/v1/payments/payouts/BATCH");
    return json({ batch_header: { payout_batch_id: "BATCH", batch_status: "SUCCESS" }, items: [{ payout_item_id: "ITEM", transaction_status: "SUCCESS", payout_item: { sender_item_id: "key", amount: { value: "10.00", currency: "USD" } } }] });
  };
  try {
    const input = { guaranteeId: "key", payerId: "PAYER", amountCents: 1000, employerName: "Employer" };
    const first = await payCandidate(input);
    const replay = await createProvider()(operation("payout", input));
    assert.equal(replay.result.batchId, first.batchId);
    assert.deepEqual(bodies[0], bodies[1]);
    assert.equal((await getPayoutBatch("BATCH")).items[0]?.amountCents, 1000);
    const settled = await createProvider()(operation("payout", input, replay.result));
    assert.equal(settled.state, "succeeded");
    assert.equal(sends, 2);
  } finally { globalThis.fetch = original; }
});

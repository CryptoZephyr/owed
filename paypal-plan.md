# PayPal integration plan and contract sheet

Owed backs every interview with a PayPal hold. The employer approves one hold per role, Owed charges a guarantee from it when a candidate is ghosted, pays that candidate through Payouts, and releases what is left when the role closes.

This sheet follows the `typescript-integrate-paypal` workflow from APIMatic's Context Plugin for PayPal. Every SDK fact below comes from the SDK map and model sources at the pinned commit, not from memory.

## SDK identity and source of facts

| Fact | Value |
| --- | --- |
| Package | `paypal` (APIMatic-generated), not on npm |
| Pinned source | `git+https://github.com/context-plugins/paypal-typescript-sdk.git#5d0df8a8817e5fdf2e2cd48e68f790ea4730aab2` (committed 2026-10-12, version 2.29.0) |
| Why this commit | Seven days old on 2026-10-19 and matches the APIMatic skills v0.4.1 |
| Map source used | Re-read `sdk-map.md` and `src/client-options.ts` at this exact commit on 2026-10-19. Operation contracts remain unchanged. Baseline install, build and typecheck passed on the untouched source |
| ClientOptions.logging | `LoggingOptions`, with `level?: "off" \| "error" \| "warn" \| "info" \| "debug"` and `logRequestBody?: boolean`. Explicit level overrides `PAYPAL_CLIENT_LOG` |

## Repo survey

| Item | Value |
| --- | --- |
| Framework | Next.js 16 App Router, server-only modules under `src/lib/paypal/` |
| Module format | ESM through the Next bundler. One dialect per process, so `instanceof` on SDK errors is reliable |
| Runtime | Node.js serverless functions on Vercel. Not the edge runtime |
| tsconfig | `strict`, `noUncheckedIndexedAccess`. No `exactOptionalPropertyTypes`, no `verbatimModuleSyntax`. Model types are still imported with `import type` |
| Package manager | npm |
| Checks | `npm run build` (includes the Next type check) and `npm run typecheck`, both run by `.github/workflows/ci.yml` |
| Baseline | Greenfield repository. No earlier checks to compare against |
| Exemplar for SDK calls | `src/lib/paypal/holds.ts` |
| Exemplar for REST calls outside the SDK | `src/lib/paypal/payouts.ts` |

## Host and credentials

- The SDK declares one environment and no `ServerEnvironment`. The host is set with `serverOptions.baseUrl` in `src/lib/paypal/sdk.ts`, from `PAYPAL_ENVIRONMENT`.
- `sandbox` maps to `https://api-m.sandbox.paypal.com` and is the default. `live` maps to `https://api-m.paypal.com` and is refused unless `PAYPAL_ALLOW_LIVE=true`, enforced in `src/lib/env.ts`.
- Credentials: `oauth2: { clientId: PAYPAL_CLIENT_ID, clientSecret: PAYPAL_CLIENT_SECRET }`. Both are required by the env schema, so an unset credential fails before any call rather than as a `401`.
- The client is built once per server instance and reused, so the OAuth token cache survives warm invocations.
- Smoke run on 2026-10-17 against the sandbox credential, through the REST endpoints these operations wrap: create order with intent `AUTHORIZE`, authorize, full capture, two partial captures, void, get authorization all succeeded. Reauthorize returned `422 REAUTHORIZATION_TOO_SOON`, which is expected before day 4. No `403` on any operation. The day-4 renewal and late capture are scheduled for 2026-10-21 on authorization `3SH74429HG4521846`.

## Operations in scope

Every operation takes one flat request object and returns `ApiPromise<T, E>`. All of them are awaited, so an error status rejects. None of the in-scope operations resolves to `undefined`.

### `client.orders.createOrder`

- Signature: `createOrder(request: Orders.CreateOrderRequest, options?: RequestOptions): ApiPromise<Order, Orders.CreateOrderError>`
- Wire: `POST /v2/checkout/orders`. Auth `oauth2`. SDK sends `Idempotency-Key` per call
- Fields used: `payPalRequestId` (header `PayPal-Request-Id`), `prefer` (header `Prefer`, default `"return=minimal"`), `body` (required, `OrderRequest`)
- `OrderRequest` members set: `intent: CheckoutPaymentIntent` (required), `purchaseUnits: PurchaseUnitRequest[]` (required), `paymentSource?: PaymentSource`
- `PurchaseUnitRequest` members set: `amount: AmountWithBreakdown` (required, `{ currencyCode: string; value: string }`), `customId?: string`, `description?: string`
- `PaymentSource.paypal?: PayPalWallet`, with `experienceContext?: PayPalWalletExperienceContext` members `brandName?`, `shippingPreference?: PayPalWalletContextShippingPreference`, `userAction?: PayPalExperienceUserAction`, `returnUrl?`, `cancelUrl?`
- Returns `Order`. Members asserted: `id`, and `links[].href` where `rel` is `"payer-action"` (or `"approve"`). `LinkDescription.href` and `.rel` are required strings
- Error arms (`Orders.CreateOrderError`): `"error"` 400, `"error2"` 401, `"error3"` 422, `"error4"` default, `"undeclared"`. Every typed arm's body is the `Error` model

### `client.orders.authorizeOrder`

- Signature: `authorizeOrder(request: Orders.AuthorizeOrderRequest, options?: RequestOptions): ApiPromise<OrderAuthorizeResponse, Orders.AuthorizeOrderError>`
- Wire: `POST /v2/checkout/orders/{id}/authorize`. Body optional and omitted
- Fields used: `id` (path), `payPalRequestId`, `prefer`
- Returns `OrderAuthorizeResponse`. Members asserted: `purchaseUnits[0].payments.authorizations[0]` with `id`, `status`, `amount`. Also read `expirationTime`, `payer.payerId`, `payer.emailAddress`
- Error arms (`Orders.AuthorizeOrderError`): `"error"` 400, `"error2"` 401, `"error3"` 403, `"error4"` 404, `"error5"` 422, `"error6"` 500, `"error7"` default, `"undeclared"`

### `client.payments.captureAuthorizedPayment`

- Signature: `captureAuthorizedPayment(request: Payments.CaptureAuthorizedPaymentRequest, options?: RequestOptions): ApiPromise<CapturedPayment, Payments.CaptureAuthorizedPaymentError>`
- Wire: `POST /v2/payments/authorizations/{authorization_id}/capture`
- Fields used: `authorizationId` (path, wire `authorization_id`), `payPalRequestId`, `prefer`, `body: CaptureRequest`
- `CaptureRequest` members set: `amount?: Money`, `finalCapture?: boolean` (schema default `false`, so it is always sent)
- Returns `CapturedPayment`. Members asserted: `id`, `status`, `amount`. Read `sellerReceivableBreakdown.paypalFee` (`SellerReceivableBreakdown.grossAmount` is required, `paypalFee` optional)
- Error arms (`Payments.CaptureAuthorizedPaymentError`): `"error"` 400, `"error2"` 401, `"error3"` 403, `"error4"` 404, `"error5"` 409, `"error6"` 422, `"error500"` 500 with no body, `"error7"` default, `"undeclared"`

### `client.payments.voidPayment`

- Signature: `voidPayment(request: Payments.VoidPaymentRequest, options?: RequestOptions): ApiPromise<PaymentAuthorization, Payments.VoidPaymentError>`
- Wire: `POST /v2/payments/authorizations/{authorization_id}/void`. No body
- Fields used: `authorizationId`, `payPalRequestId`, `prefer`
- Returns `PaymentAuthorization`. Members asserted: `id`, `status`, `amount`
- The generated success decoder expects JSON even for PayPal's empty HTTP 204. The wrapper catches only `PaypalError(kind="decode", status=204)` and verifies the outcome with `getAuthorizedPayment`. Other errors are translated normally. Covered by a fake-fetch wire test.
- Error arms (`Payments.VoidPaymentError`): `"error"` 401, `"error2"` 403, `"error3"` 404, `"error4"` 409, `"error5"` 422, `"error500"` 500, `"error6"` default, `"undeclared"`

### `client.payments.reauthorizePayment`

- Signature: `reauthorizePayment(request: Payments.ReauthorizePaymentRequest, options?: RequestOptions): ApiPromise<PaymentAuthorization, Payments.ReauthorizePaymentError>`
- Wire: `POST /v2/payments/authorizations/{authorization_id}/reauthorize`. Body optional and omitted, so the same amount is reauthorized
- Fields used: `authorizationId`, `payPalRequestId`, `prefer`
- Returns `PaymentAuthorization` with a new `id`. Members asserted: `id`, `status`, `amount`
- Error arms (`Payments.ReauthorizePaymentError`): `"error"` 400, `"error2"` 401, `"error3"` 403, `"error4"` 404, `"error5"` 422, `"error500"` 500, `"error6"` default, `"undeclared"`
- Sandbox fact: renewal is allowed once, from day 4 to day 29 after the original authorization

### `client.payments.getAuthorizedPayment`

- Signature: `getAuthorizedPayment(request: Payments.GetAuthorizedPaymentRequest, options?: RequestOptions): ApiPromise<PaymentAuthorization, Payments.GetAuthorizedPaymentError>`
- Wire: `GET /v2/payments/authorizations/{authorization_id}`. Retried by the default policy
- Fields used: `authorizationId`
- Error arms (`Payments.GetAuthorizedPaymentError`): `"error"` 401, `"error2"` 403, `"error3"` 404, `"error500"` 500, `"error4"` default, `"undeclared"`

### `client.orders.getOrder`

- Signature: `getOrder(request: Orders.GetOrderRequest, options?: RequestOptions): ApiPromise<Order, Orders.GetOrderError>`
- Wire: `GET /v2/checkout/orders/{id}`. Used only to settle an unknown authorize outcome
- Fields used: `id`. `fields` (query) is left out

### `client.payments.getCapturedPayment`

- Re-read pinned `map/operations/payments.md` on 2026-10-19. Signature: `getCapturedPayment(request: Payments.GetCapturedPaymentRequest, options?: RequestOptions): ApiPromise<CapturedPayment, Payments.GetCapturedPaymentError>`
- Wire: `GET /v2/payments/captures/{capture_id}`, OAuth2, no body. Request field: `captureId`. Returns `CapturedPayment`, asserted `id`, `status`, USD `amount`; optional `sellerReceivableBreakdown.paypalFee`.
- Error arms: `error` 401, `error2` 403, `error3` 404, `error500` 500 without body, `error4` default, `undeclared`.
- Used for read-only settlement of a persisted pending capture. It never initiates a new charge.
- Error arms (`Orders.GetOrderError`): `"error"` 401, `"error2"` 404, `"error3"` default, `"undeclared"`

### Enums in scope (open enums, so any `switch` on a received value needs a default arm)

| Enum | Members |
| --- | --- |
| `CheckoutPaymentIntent` | `Capture: "CAPTURE"`, `Authorize: "AUTHORIZE"` |
| `PayPalExperienceUserAction` | `Continue: "CONTINUE"`, `PayNow: "PAY_NOW"` |
| `PayPalWalletContextShippingPreference` | `GetFromFile: "GET_FROM_FILE"`, `NoShipping: "NO_SHIPPING"`, `SetProvidedAddress: "SET_PROVIDED_ADDRESS"` |
| `AuthorizationStatus` | `Created`, `Captured`, `Denied`, `PartiallyCaptured`, `Voided`, `Pending` |
| `CaptureStatus` | `Completed`, `Declined`, `PartiallyRefunded`, `Pending`, `Refunded`, `Failed` |
| `OrderStatus` | `Created`, `Saved`, `Approved`, `Voided`, `Completed`, `PayerActionRequired` |

### SDK-wide facts this integration depends on

- The `Error` model shadows the global. Import it as `import type { Error as PayPalApiErrorBody } from "paypal"`. Its members are `name`, `message`, `debugId` (all required) and `details?: ErrorDetails[]` with `issue` (required) and `description?`.
- The error family is exported as `PaypalError`, narrowed on `err.kind`: `"api"`, `"decode"`, `"encode"`, `"connection"`, `"timeout"`, `"auth"`.
- A malformed 2xx body rejects with `DecodeError`, and an omitted optional member is silently `undefined`. Every asserted member above is checked in code right after the call.
- Retry policy: defaults kept, so `GET` is retried on `408, 429, 500, 502, 503, 504`, faults and timeouts, and `POST` is never retried. `retry.timeout` is set to `10_000` ms per attempt.
- Logging: explicitly set `logging: { level: "off", logRequestBody: false }` in `src/lib/paypal/sdk.ts`. No per-call logging overrides. Neither secrets nor candidate data may be logged, including when `PAYPAL_CLIENT_LOG=debug` is set externally.
- No pagination and no streaming are needed.
- No webhook surface exists on the SDK. Webhook verification is REST, below.

## Outside the SDK (REST through `src/lib/paypal/rest.ts`)

The pinned SDK covers Orders, Payments, Vault, Transaction Search and Subscriptions only. These calls go straight to PayPal REST with the same credentials:

| Purpose | Endpoint | Code |
| --- | --- | --- |
| Pay a ghosted candidate | `POST /v1/payments/payouts` with `recipient_type: "PAYPAL_ID"` | `src/lib/paypal/payouts.ts` |
| Read a payout batch | `GET /v1/payments/payouts/{payout_batch_id}` | `src/lib/paypal/payouts.ts` |
| Log in with PayPal | `/connect` authorize URL, `POST /v1/oauth2/token` with `authorization_code`, `GET /v1/identity/openidconnect/userinfo?schema=openid` | `src/lib/paypal/identity.ts` |
| Verify webhooks | `POST /v1/notifications/verify-webhook-signature` | `src/lib/paypal/webhooks.ts` |

Every REST response is parsed with a zod schema before use.

## 1b.1 Durable writes

### DUPLICATE CLAIMS

The claim store is `owed.paypal_operations` in the dedicated Owed Supabase project `kjpbyrvnygiptznftyuk` (`eu-west-1`), with a unique constraint on `(kind, business_key)`. The migration is applied and the hosted constraint/RLS were verified. The schema and service also run against isolated local PostgreSQL 17 in tests. Setlo was paused with the owner's explicit approval to free the slot. No other application's database is used or repurposed.

| Write | Where the claim is stored | What rejects the second one | Where that rejection is caught | Where in the code |
| --- | --- | --- | --- | --- |
| createOrder (role hold) | `owed.paypal_operations` kind `create_hold`, key `roleId` | unique `(kind, business_key)` | `enqueue` uses `ON CONFLICT DO NOTHING`, preserving the stored operation | `src/lib/owed/roles.ts` `fundRole` → `enqueue`; `src/lib/owed/worker.ts` `claim` → `createProvider` |
| authorizeOrder | kind `authorize_hold`, key `orderId` | unique `(kind, business_key)` | `enqueue` consumes the uniqueness conflict without replacing input or result | `roles.ts` `approveRole` → `enqueue`; `worker.ts` `createProvider` |
| captureAuthorizedPayment (guarantee) | kind `charge_guarantee`, key `guaranteeId` | unique `(kind, business_key)` | `enqueue` preserves the original capture claim | `worker.ts` `schedule` → `enqueue`; `createProvider` → `finish` |
| voidPayment (role release) | kind `release_hold`, key `authorizationId` | unique `(kind, business_key)` | `enqueue` preserves the original release claim | `roles.ts` `closeRole` → `enqueue`; `worker.ts` `createProvider` |
| reauthorizePayment (renewal) | kind `renew_hold`, key `authorizationId` | unique `(kind, business_key)` | `enqueue` preserves the original renewal claim | `worker.ts` `schedule` → `enqueue`; `createProvider` |
| Payouts (candidate payment) | kind `payout`, key `guaranteeId` | unique `(kind, business_key)` | `enqueue` preserves the original payout claim | `worker.ts` `finish` or `roles.ts` `acceptInvite` → `enqueue`; `worker.ts` `createProvider` |

`tests/database.integration.ts` verifies that a direct duplicate raises PostgreSQL `23505` and that eight simultaneous funding requests create one claim. Claims use `FOR UPDATE SKIP LOCKED`, a two-minute lease and a fencing token. Non-payout operations serialize per role. A pending/unclaimed payout does not block another candidate's operation. A completed operation is never claimed again. The immutable input, result and business key survive retries.

The `PayPal-Request-Id` (and the Payouts `sender_batch_id`) is derived from the same business key: `owed-role-hold-{roleId}`, `owed-authorize-{orderId}`, `owed-charge-{guaranteeId}`, `owed-release-{roleId}-{authorizationId}`, `owed-renew-{authorizationId}`, `owed-{guaranteeId}`. It goes beside the claim, never instead of it.

### UNKNOWN OUTCOMES

| Write | The operation you re-read with | The reference you search by | Where in the code | The test that fails the connection |
| --- | --- | --- | --- | --- |
| createOrder | same request with same `PayPal-Request-Id`, only within five minutes; otherwise manual review | `owed-role-hold-{roleId}` | `worker.ts` `createProvider/create_hold`; `runWorker` catch persists unknown | `tests/paypal.test.ts` unknown create/charge recovery; `tests/database.integration.ts` per-write lost-connection cases |
| authorizeOrder | getOrder, then `purchaseUnits[0].payments.authorizations`; bounded same-key replay only if absent | `orderId` | `holds.ts` `getOrderHold`; `worker.ts` `createProvider/authorize_hold` | `tests/paypal.test.ts` unknown authorization/void read-only settlement; database per-write lost-connection cases |
| captureAuthorizedPayment | GET saved capture when known; otherwise GET authorization, bounded same-request-id replay | capture ID or `owed-charge-{guaranteeId}` | `holds.ts` `getCapture/getHold`; `worker.ts` `createProvider/charge_guarantee` | `tests/paypal.test.ts` failed write, unknown create/charge recovery, pending capture read; database per-write lost-connection cases |
| voidPayment | GET authorization; `VOIDED`, `CAPTURED` or `EXPIRED` settles the unused hold. Otherwise bounded same-key void and readback | `authorizationId` | `holds.ts` `releaseHold/getHold`; `worker.ts` `createProvider/release_hold` | `tests/paypal.test.ts` empty-204 void readback and unknown authorization/void; database per-write lost-connection cases |
| reauthorizePayment | GET original authorization, bounded same-request-id reauthorization; never replace the request ID | `owed-renew-{authorizationId}` | `worker.ts` `createProvider/renew_hold` → `getHold/renewHold` | `tests/paypal.test.ts` unknown renewal and old-ambiguity cutoff; database per-write lost-connection cases |
| Payouts | GET known batch. If unknown, replay immutable sender batch within 29 days, extract duplicate's allowlisted batch ID, then poll it | batch ID or `owed-{guaranteeId}` | `payouts.ts` `duplicatePayoutBatch/payCandidate/getPayoutBatch`; `worker.ts` `createProvider/payout` | `tests/paypal.test.ts` duplicate replay polls original batch, hostile-link rejection; database per-write lost-connection cases |

An SDK `AuthError` records `credentials/sent=false`, leaves the claim queued and resets the send attempt, so it is not re-read as an unknown write. `EncodeError` stops for manual review. Other credential errors, rate limits, transport failures and provider errors retain the claim for reconciliation. Programmer errors are rethrown, leaving a recoverable lease rather than being mislabeled as a PayPal rejection. Each SDK call has a 15-second overall signal in addition to the 10-second per-attempt timeout. Body-read failures and invalid REST JSON are also translated, without logging response bodies.

## 1b.2 CROSS-OPERATION INVARIANTS

| Invariant | Where the legal set comes from | Enforced where | The test that proves it |
| --- | --- | --- | --- |
| A charge, release or renewal uses the authorization recorded for that role | `owed.roles.authorization_id` | `schedule/closeRole` snapshot it under the role lock; `worker.ts` `preflight` rechecks before sending | `tests/database.integration.ts` mismatched authorization, budget and payout recipient |
| The sum of charges on a hold never exceeds the hold amount | hold amount, funded capacity and immutable guarantee amounts | `inviteCandidate` serializes capacity allocation; `preflight` checks available budget; `finish` atomically records charge and queues payout; SQL CHECK protects total | `tests/database.integration.ts` capacity race, deadline pays once/releases remainder, mismatched budget |
| A payout goes to the payer ID the candidate logged in with for that guarantee | immutable candidate identity from Log in with PayPal | `finish/acceptInvite` enqueue only the bound verified payer; `preflight` rechecks payer and captured guarantee amount | `tests/database.integration.ts` one verified account claims invite, mismatched payout recipient |

## 1b.3 OPTIONAL FIELDS

### createOrder

| Field | What requires it | Set it? |
| --- | --- | --- |
| `payPalRequestId` | DUPLICATE CLAIMS and UNKNOWN OUTCOMES rows for createOrder | ✅ |
| `prefer` | the members asserted after the call (links and id), as tested in sandbox with `return=representation` | ✅ `"return=representation"` |
| `payPalMockResponse`, `payPalPartnerAttributionId`, `payPalClientMetadataId`, `payPalAuthAssertion` | nothing | ❌ |
| `purchaseUnits[].customId` | webhook events must map back to a role | ✅ `roleId` |
| `purchaseUnits[].description` | the employer must see what the hold is for on PayPal's approval page | ✅ |
| `purchaseUnits[].referenceId`, `payee`, `items`, `shipping`, `invoiceId`, `softDescriptor`, `paymentInstruction`, `supplementaryData` | nothing | ❌ |
| `paymentSource.paypal.experienceContext.brandName` | the employer must recognise Owed on PayPal's page | ✅ `"Owed"` |
| `shippingPreference` | no physical goods are sold | ✅ `NoShipping` |
| `userAction` | the approval is the final step before the server authorizes, as tested in sandbox | ✅ `PayNow` |
| `returnUrl`, `cancelUrl` | the redirect approval flow | ✅ |
| `payer`, `applicationContext`, other `experienceContext` members | nothing | ❌ |

### authorizeOrder, voidPayment, reauthorizePayment

| Field | What requires it | Set it? |
| --- | --- | --- |
| `payPalRequestId` | that write's DUPLICATE CLAIMS and UNKNOWN OUTCOMES rows | ✅ |
| `prefer` | the members asserted after the call | ✅ `"return=representation"` |
| `body` | nothing (same amount on renewal) | ❌ |
| `payPalMockResponse`, `payPalClientMetadataId`, `payPalAuthAssertion` | nothing | ❌ |

### captureAuthorizedPayment

| Field | What requires it | Set it? |
| --- | --- | --- |
| `payPalRequestId` | DUPLICATE CLAIMS and UNKNOWN OUTCOMES rows for capture | ✅ |
| `prefer` | the members asserted after the call | ✅ `"return=representation"` |
| `body.amount` | the guarantee amount for one ghosted candidate | ✅ |
| `body.finalCapture` | keep the remaining role hold until explicit role closure | ✅ always `false` in the service; separate release operation |
| `body.invoiceId`, `noteToPayer`, `softDescriptor`, `paymentInstruction` | nothing | ❌ |
| `payPalMockResponse`, `payPalAuthAssertion` | nothing | ❌ |

## 1b.4 WHEN THE API SAYS NO

One mapping, applied by `translatePayPalFailure` in `src/lib/paypal/errors.ts` to every operation above and to the REST calls. Routes turn the result into an HTTP response.

| status | Owed answers | the caller reads | test |
| --- | --- | --- | --- |
| a `4xx` other than 401, 403, 429 | the same `4xx` | PayPal's reason (`details[0].issue` and `description`, or `message`) | `tests/paypal.test.ts` error boundary status families (422) |
| 401 or 403 | 502 | "PayPal rejected Owed's credentials." | `tests/paypal.test.ts` error boundary status families (401, 403) |
| 429 | 503 | "PayPal is rate limiting Owed. Try again shortly." | `tests/paypal.test.ts` error boundary status families (429) |
| 5xx | 502 | "PayPal is having trouble right now." | `tests/paypal.test.ts` error boundary status families (503) |
| no response, on a write | per UNKNOWN OUTCOMES | "Outcome unknown. Owed is checking with PayPal." | `tests/paypal.test.ts` write without response, SDK malformed responses and deadline; `tests/database.integration.ts` per-write lost-connection cases |
| no response, on a read | 502 | "PayPal could not be reached." | `tests/paypal.test.ts` error boundary read connection failure |

## Assumptions and blockers

- B1 resolved in sandbox on 2026-10-19: identical USD 1.00 Payouts requests with `sender_batch_id=owed-b1-20261019-v1`. First: HTTP 201, batch `2T9UZG3X22C74`, `PENDING`. Second: HTTP 400, `name=USER_BUSINESS_ERROR`, `message=User business error.`, `details[0].field=SENDER_BATCH_ID`, `issue=Batch with given sender_batch_id already exists`, debug ID `f669009a12868`. `details[0].link[0]` is a GET self link to the original batch. Reconcile duplicates by extracting only that batch ID from an allowlisted sandbox path, then GET it using Owed's configured host. Never follow arbitrary returned URLs or mint a new batch ID. PayPal documents deduplication for 30 days, so unknown outcomes older than that require manual reconciliation.
- A1 (minor): PayPal returns the original response for a repeated `PayPal-Request-Id`. The retention window is undocumented here. Test in sandbox.
- A2: schema, claim store, service, scheduler scripts and plain employer/candidate pages exist. On 2026-10-19 the owner approved pausing Setlo, after which Owed project `kjpbyrvnygiptznftyuk` was created and became `ACTIVE_HEALTHY`. The schema and `supabase/deadlines.sql` are applied, the unique constraint/RLS/private-schema permissions were verified, and the database-only deadline job is active every minute. Connection to the session pooler uses verified TLS with the public Supabase CA. Local PostgreSQL tests verify financial invariants with fake money, not the hosted database. The HTTP money worker is deliberately not scheduled until an app is deployed and both Vault values are configured. TasteCase remains unchanged.
- A3 (minor): `env()` is parsed on first use. Add a startup check so a missing credential fails at boot.

## REQUIRED READING

- MUST load `typescript-integrate-paypal` and `typescript-getting-started` before any SDK change (loaded 2026-10-17)
- MUST load `typescript-client-initialization` before changing `src/lib/paypal/sdk.ts` (loaded 2026-10-17)
- MUST load `typescript-authentication` before touching credentials (loaded 2026-10-17)
- MUST load `typescript-calling-endpoints` and `typescript-models` before writing or changing a call (loaded 2026-10-17)
- MUST load `typescript-error-handling` before any `try`/`catch` around an SDK call (loaded 2026-10-17)
- MUST load `typescript-configuration-resilience` before changing retry, timeout or logging (loaded 2026-10-17)
- MUST load `typescript-testing` before creating the first test that fakes `fetch`

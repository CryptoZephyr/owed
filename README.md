# Owed

Every interviewed candidate hears back by a set date, or gets paid for their time through PayPal.

63% of US job candidates say they were left in the dark after an interview ([Greenhouse 2025 Workforce & Hiring Report](https://www.prnewswire.com/news-releases/only-7-of-candidates-say-the-job-market-favors-them-amidst-challenges-of-ageism-ai-cheating-and-ghosting-302507370.html)). Owed turns the promise of a reply into money that is actually on the line.

## How it works

1. An employer opens a role, sets a guarantee for each interviewed candidate (for example $25) and a reply deadline, and approves one PayPal hold for the role.
2. After each interview, AI drafts a respectful status message for the recruiter and flags risky wording. Sending it closes that candidate's guarantee.
3. If a candidate hears nothing by the deadline, Owed nudges the recruiter once. If the deadline still passes, Owed charges that candidate's guarantee from the hold and pays it to the candidate's verified PayPal account.
4. When the role closes, Owed releases whatever is left of the hold.

## Status

Early build for the PayPal AI Hackathon. It runs against the PayPal sandbox only.

What exists today:

- The PayPal layer in `src/lib/paypal/`: role holds, partial charges, releases and renewals through APIMatic's generated PayPal SDK, plus Payouts, Log in with PayPal and webhook verification over PayPal REST
- One error-translation boundary for every PayPal failure
- The contract sheet for every PayPal call in `paypal-plan.md`
- A private PostgreSQL schema for Supabase, including roles, PayPal identities, guarantees, operation claims, hashed sessions and an in-app notification inbox
- A recoverable worker with per-role sequencing, leased claims, fencing tokens and fixed deadline rules
- Plain employer screens for funding roles, sharing invitations, sending status-only closure, and releasing unused holds
- Plain candidate screens for PayPal connection, guarantee/payout status and review flags

What was verified by hand in the PayPal sandbox on 2026-10-17, using the same credentials and endpoints:

- A role hold lasts 29 days. Renewal is allowed once, between day 4 and day 29
- Two $25 partial charges from one $100 hold, then releasing the remaining $50
- A payout to a candidate's verified PayPal account, addressed by PayPal account ID
- An unclaimed payout to an address with no PayPal account
- Log in with PayPal returning the candidate's name, email, PayPal account ID and verified status

On 2026-10-19, repeating the same sandbox Payouts request returned HTTP 400 `USER_BUSINESS_ERROR`, with `SENDER_BATCH_ID`, `Batch with given sender_batch_id already exists`, and a link to the original batch. `paypal-plan.md` records the exact result and safe recovery policy.

The schema and worker are tested against local PostgreSQL 17. On 2026-10-19, the owner approved pausing Setlo to free a Supabase slot. Owed now has its own healthy project, [`kjpbyrvnygiptznftyuk`](https://supabase.com/dashboard/project/kjpbyrvnygiptznftyuk), in `eu-west-1`. The schema and database-only minute deadline job are applied. All seven tables have RLS enabled, the unique operation constraint exists, and neither `anon` nor `authenticated` has access to the private schema. The application-to-session-pooler connection was verified with certificate validation enabled. TasteCase is unchanged. HTTP worker activation and browser-based PayPal login/approval still need an app deployment.

Not built yet: AI drafting/risk review, employer fee recovery, charity fallback for returned payouts, and webhook ingestion. The existing webhook signature-verification helper is not a registered webhook endpoint. Current recovery polls PayPal instead. Status messages are deterministic, not AI-generated. This sandbox charges the guarantee principal and funds PayPal fees from the merchant balance, so candidates receive the full promised amount.

## PayPal integration

| Step | PayPal feature |
| --- | --- |
| Employers and candidates sign in | Log in with PayPal |
| Employer backs the guarantee | Orders v2 with intent `AUTHORIZE` |
| Keeping the hold alive | Payments v2 reauthorize |
| A ghosted candidate's guarantee | Payments v2 partial capture |
| The candidate gets paid | Payouts to a PayPal account ID |
| Role closes | Payments v2 void |
| Staying in sync | Webhooks with signature verification |

## How APIMatic's Context Plugin shaped the integration

- The plugin's skills (in `.devin/skills/`) required a contract sheet before any SDK code. `paypal-plan.md` is that sheet, built from the SDK map at a pinned commit rather than from memory.
- The plugin pointed to APIMatic's generated `paypal` SDK, which is installed from GitHub rather than npm. Owed uses it for every order and payment call.
- The SDK map showed that the SDK has one environment and no environment selector, so Owed sets the host explicitly with `serverOptions.baseUrl` and refuses live PayPal unless it is switched on deliberately.
- The map also showed what the SDK does not cover (Payouts, identity, webhooks), which is why those calls use PayPal REST directly.
- The error-handling skill shaped `src/lib/paypal/errors.ts`, which treats a dropped connection on a write as an unknown outcome rather than a failure.
- Re-reading the requested SDK commit exposed `ClientOptions.logging`, which Owed explicitly disables even if `PAYPAL_CLIENT_LOG=debug` is set. The testing skill's `ClientOptions.fetch` seam exercises real wire encoding and caught the generated void decoder rejecting PayPal's empty HTTP 204, now handled by a verified readback.

## Running it

Requires Node.js 24. Tests use Node's module hooks and a dedicated PostgreSQL 17 test database.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill in `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` from the sandbox app. Enable Log in with PayPal, including the email, PayPal account ID and verified account attributes. Register `${APP_URL}/auth/paypal/callback` as its return URL. Both employers and candidates use PayPal login, with opaque HttpOnly SameSite sessions. No OAuth access or refresh tokens are stored. Employers must enter the candidate's PayPal email when creating an invitation. Only a matching PayPal login with both `email_verified` and `verified_account` can view or accept it. Payouts remain bound to the candidate's payer ID. If PayPal omits email verification, the invitation fails closed until the account can return a verified email.

If the employer mistyped the PayPal email, they can correct an unclaimed invitation before its deadline. This replaces the private link while preserving the same guarantee, deadline, and funded place. The old link immediately stops working. After acceptance or the deadline, the employer cannot redirect it. An overdue guarantee with an unreachable recipient requires operator review; it cannot be reassigned after the fact.

### Database and scheduler

1. Use Owed's dedicated Supabase project, not another application's database. Its initial schema, invitation identity migration and database deadline job are already applied. The following migration instructions are only for rebuilding a new environment.
2. Set the server-only `DATABASE_URL` from the repo-scoped Owed secret to the project's Supavisor session-mode or direct connection string, with `sslmode=verify-full`. The verified session endpoint is `aws-0-eu-west-1.pooler.supabase.com:5432`, with username `owed_app.kjpbyrvnygiptznftyuk`. `owed_app` is a dedicated login role with `BYPASSRLS` and data access to the `owed` schema only, because Supabase refuses to reset the `postgres` password through SQL. Set `NODE_EXTRA_CA_CERTS` to the absolute deployed path of `supabase/certs/prod-ca-2021.crt`, which is `/var/task/supabase/certs/prod-ca-2021.crt` on Vercel. `next.config.ts` bundles the file into every function, downloaded from [Supabase's official certificate URL](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt). Never print the connection string or disable certificate verification. The `owed` schema is private, is not exposed through PostgREST, and has RLS enabled with no public policies. Backend connections must use the schema owner or an explicitly provisioned privileged database role.
3. For a fresh environment only, apply `supabase/migrations/202610190001_owed.sql`, then `supabase/migrations/202610190002_invitation_identity.sql`, then `supabase/migrations/202610200001_email_outbox.sql`, with the Supabase SQL editor or PostgreSQL migration tooling. Both are already applied to the existing Owed project, so do not reapply them there. The second migration keeps earlier unclaimed invitations with no intended email unclaimable until an employer issues a corrected link before the deadline, or an operator reviews them afterward. Apply `supabase/deadlines.sql` to enable the database-only deadline tick independently of app hosting. Re-running the deadline script updates the named job instead of adding duplicates.
4. Deploy the app with `APP_URL` set to its HTTPS origin. The sandbox deployment is the Vercel project `owed` at `https://owed-vert-ten.vercel.app`, deployed from `main`. Set a random `CRON_SECRET` of at least 32 characters. Keep database and PayPal credentials server-only.
5. In Supabase Vault, add `owed_app_url` with that origin and `owed_cron_secret` with the same worker secret. Apply `supabase/schedule.sql`. This enables `pg_cron` and `pg_net`, then schedules `owed.tick()` and a protected worker request every minute. The script deliberately fails if the Vault values are missing. Neither secret is placed in cron SQL.
6. Check `cron.job_run_details`, `net._http_response`, and `owed.paypal_operations` after deployment. The database job only marks deadlines and writes in-app nudges. It cannot capture or pay money without the HTTP worker. A successful cron SQL job alone does not prove the HTTP worker succeeded. Unclaimed payouts stay unclaimed and continue polling, never appearing paid. Rejected/manual-review operations need operator investigation of the original PayPal reference, not a replacement business key.

The HTTP worker processes one operation per invocation to fit a 60-second request budget. Overlapping invocations are safe. Larger workloads need more frequent worker dispatch or a longer-lived worker, not a larger unbounded batch inside a request. Nudge notifications appear in the employer dashboard 24 hours before the deadline. Every notification is also emailed. Each worker request drains up to five from the `owed.notifications` outbox over Gmail SMTP, using the server-only `GMAIL_USER` and `GMAIL_APP_PASSWORD`. Candidates get their closure status and a paid notice, and employers get the deadline nudge. Unless `EMAIL_DELIVER_TO_RECIPIENTS=true`, every email goes to `EMAIL_SANDBOX_RECIPIENT`, or to `GMAIL_USER` when that is unset, with the intended recipient named in the body, because sandbox PayPal emails are not real inboxes. Direct delivery only goes to an address PayPal reports as verified. If Gmail can't be reached, nothing is claimed and emails wait. An explicit SMTP rejection retries up to three attempts, five and then ten minutes apart. A dropped connection, a timeout or an interrupted send becomes `unknown` and is never resent, so nobody gets the same email twice. Without Gmail credentials, emails wait as `pending`. The deadline update itself runs in PostgreSQL even if HTTP dispatch fails, then durable operations catch up when the worker returns. An invited candidate's overdue guarantee is captured even before they connect; payout waits for their verified account.

Deadlines are UTC, within 21 days, and at least a day before the authorization expires. One extension is allowed. Renewal is queued after four days if candidates are still pending, and never repeated after a successful renewal. A late closure cannot cancel an owed guarantee. Each invitation consumes one funded place, even after closure. There is no reuse of a closed slot for an extra interview.

### Checks

```bash
npm run lint
npm run typecheck
npm test
createdb owed_test
DATABASE_URL=postgresql://localhost/owed_test npm run test:db
npm run build
```

Database tests rebuild only the `owed` schema in a localhost database named exactly `owed_test` and refuse other targets. They use a fake money provider, not PayPal credentials. SDK tests stub only `fetch`, keep retries off and use wire-shaped responses. CI runs the same checks with a disposable PostgreSQL 17 service. Hosted validation checks schema/permissions, calls `owed.tick()` and inspects real `pg_cron` runs. The `pg_net` HTTP schedule remains disabled until deployment and Vault configuration are complete.

## License

MIT. The APIMatic skills in `.devin/skills/` are MIT licensed by APIMatic.

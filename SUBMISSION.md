# Owed: Devpost submission text

Live sandbox demo: https://owed-vert-ten.vercel.app (PayPal sandbox only)

## Inspiration

63% of US job candidates say they were left in the dark after an interview ([Greenhouse 2025 Workforce & Hiring Report](https://www.prnewswire.com/news-releases/only-7-of-candidates-say-the-job-market-favors-them-amidst-challenges-of-ageism-ai-cheating-and-ghosting-302507370.html)). Candidates spend hours preparing and interviewing, then hear nothing. Employers already promise a reply. Owed puts money behind that promise.

## What it does

Owed guarantees that every interviewed candidate hears back by a set date.

1. An employer opens a role, sets a guarantee per candidate (for example USD 25) and a reply deadline, and approves one PayPal authorization hold that covers every place on the role.
2. The employer invites each interviewed candidate by their PayPal email. Only a PayPal login with that verified email can claim the invitation.
3. Before the deadline, the employer sends a closure status: moving forward, not moving forward, or still deciding (one extension, with a new exact cutoff). AI drafts a status-only message and flags risky wording before anything is sent.
4. Owed emails the employer a nudge 24 hours before the deadline.
5. If the deadline passes with no closure, Owed captures that candidate's guarantee from the hold and pays it to their PayPal account through PayPal Payouts. Nobody has to press a button.
6. When the role closes, Owed voids whatever is left of the hold, so the employer only pays for the candidates they ghosted.

## How we built it

Next.js 16 on Vercel, PostgreSQL on Supabase, PayPal through APIMatic's generated TypeScript SDK and PayPal REST, Gmail SMTP for email, and OpenRouter for the AI.

The PayPal lifecycle is the product:

| Step | PayPal feature |
| --- | --- |
| Employers and candidates sign in | Log in with PayPal (OpenID Connect, verified email and payer ID) |
| Employer backs the role | Orders v2 with intent `AUTHORIZE` |
| Keeping the hold alive | Payments v2 reauthorize |
| A ghosted candidate's guarantee | Payments v2 partial capture |
| The candidate gets paid | Payouts to a PayPal account ID |
| Role closes | Payments v2 void |

Every PayPal write carries a `PayPal-Request-Id` (or Payouts `sender_batch_id`) derived from a stable business key, so a retry can never charge or pay twice. A timeout on a write is treated as an unknown outcome and settled by reading PayPal back, never by guessing. Money is integer cents in code and a two-decimal string only at the PayPal boundary.

A Supabase `pg_cron` job marks deadlines every minute inside the database, and a second job calls a protected worker on Vercel every minute. The worker claims one PayPal operation at a time with a lease and a fencing token, so overlapping runs are safe and a crashed run is picked up again.

### APIMatic

We built the PayPal integration with APIMatic's Context Plugin for PayPal, and every order and payment call goes through APIMatic's generated `paypal` SDK, pinned to a commit.

- The plugin's skills required a contract sheet (`paypal-plan.md`) built from the SDK map before any SDK code was written. Every signature, field and enum member came from a lookup.
- The SDK map showed the SDK has one environment and no selector, so Owed sets the sandbox host explicitly and refuses live PayPal unless it is switched on deliberately.
- It also showed what the SDK doesn't cover (Payouts, identity, webhooks), so those go through PayPal REST.
- The error-handling skill shaped one translation boundary for every PayPal failure.
- The testing skill's `fetch` seam exercises real wire encoding. It caught the generated void decoder rejecting PayPal's empty HTTP 204, now handled by a verified readback.
- Re-reading the pinned commit exposed `ClientOptions.logging`, which Owed disables explicitly.

### AI

The AI writes and checks words. It never moves money: holds, captures, payouts and releases run only on fixed rules in server code.

- "Draft message with AI" asks the model for a status-only message as JSON. The employer can edit it.
- A second call reviews the final text for reasons, feedback, comparisons with other candidates, promises of future roles, personal characteristics such as age, and a status mismatch. The employer has to acknowledge any flag before sending.
- Server rules block what the model can't be trusted with: a still-deciding message must state the exact new cutoff, and links or email addresses are refused.
- If the model is down, only Owed's standard message can be sent. Unreviewed custom text never reaches a candidate.

The model is `nvidia/nemotron-3.5-super-vl:free` on OpenRouter. In a test, the message "We are not moving forward because we want someone younger with more energy. Maybe a future role will suit you." got three flags: the reason, the age reference and the future-role promise.

## Challenges we ran into

- Sending the same Payouts batch twice doesn't replay the first response. Sandbox returns HTTP 400 `USER_BUSINESS_ERROR` with `Batch with given sender_batch_id already exists` and a link to the original batch. Owed extracts only the batch ID from an allowlisted path and rereads it.
- Authorize and reauthorize with no body made the SDK drop `Content-Type`, and sandbox answered HTTP 415. Sending an empty `{}` fixed it. This is recorded in `paypal-plan.md`.
- PayPal returned `final_capture: true` on a capture Owed sent as not final. A sandbox test showed why: capturing the full authorized amount closes it, while a partial capture leaves the rest open (`PARTIALLY_CAPTURED`).
- PayPal took a USD 0.52 fee on a USD 1.00 capture. At small amounts fees dominate, so who pays them has to be explicit (see below).
- The free model we started with was retired mid-build. The fallback kept working exactly as designed: employers could still send the standard message.

## Accomplishments that we're proud of

Tested end to end on the deployed site against real PayPal sandbox accounts, with the scheduled worker doing every step:

- Employer login, a hold, authorization and release, with the authorization reading back `VOIDED`.
- A candidate claiming on time, the deadline passing, then Owed capturing USD 1.00 and paying it out. The candidate's sandbox account received USD 1.00.
- A USD 2.00 two-place role with both deadline nudges, a still-deciding extension, a final closure and four emails each delivered exactly once, then a release that voided the hold with zero captures.
- In one 20-minute window, the worker returned HTTP 200 on all 20 scheduled runs.

## What we learned

PayPal's authorize and capture lifecycle fits a promise with a deadline well: the money is committed up front but only moves if the promise is broken. The hard part is making every write safe to retry and every unknown outcome settle by reading PayPal back.

## Who pays the fees

Today the employer's hold covers only the guarantees, and PayPal's capture and payout fees come out of Owed's balance, so the candidate gets the full promised amount. Fee recovery is the next feature: the employer approves the guarantee plus the expected fees in one hold. At a USD 25 guarantee, the fee is a small share of the amount.

## Why employers would opt in

Owed costs an employer nothing when they do what they already promise. The pitch to employers is a visible "Owed-backed" signal on a job post that tells candidates the employer will reply, which matters most in roles where candidate experience drives hiring. Job boards could rank or badge backed posts. These are product arguments, not validated demand.

## What's next for Owed

- Employer fee recovery in the hold.
- PayPal webhooks alongside the current polling.
- A charity fallback for payouts nobody claims.
- The visual design pass and a live PayPal review.

## Built with

PayPal Orders v2, PayPal Payments v2, PayPal Payouts, Log in with PayPal, APIMatic Context Plugin and generated PayPal TypeScript SDK, Next.js, TypeScript, Supabase (PostgreSQL, pg_cron, pg_net, Vault), Vercel, OpenRouter, Nodemailer and Gmail SMTP, zod.

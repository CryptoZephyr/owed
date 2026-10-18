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

What was verified by hand in the PayPal sandbox on 2026-10-17, using the same credentials and endpoints:

- A role hold lasts 29 days. Renewal is allowed once, between day 4 and day 29
- Two $25 partial charges from one $100 hold, then releasing the remaining $50
- A payout to a candidate's verified PayPal account, addressed by PayPal account ID
- An unclaimed payout to an address with no PayPal account
- Log in with PayPal returning the candidate's name, email, PayPal account ID and verified status

Not built yet: the database, the deadline scheduler, the AI closure drafting, and the employer and candidate screens.

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

## Running it

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in your PayPal sandbox app credentials
npm run dev
```

## License

MIT. The APIMatic skills in `.devin/skills/` are MIT licensed by APIMatic.

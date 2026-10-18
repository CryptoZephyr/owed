# Owed: notes for coding agents

Owed guarantees that every interviewed candidate hears back by a set date. The employer approves one PayPal hold per role. If a candidate gets no closure by the deadline, Owed charges that candidate's guarantee from the hold and pays it to them through PayPal Payouts. The rest of the hold is released when the role closes. Built solo for the PayPal AI Hackathon (deadline 2026-11-12, 12:00 PT).

## Commands

- `npm install`
- `npm run dev` for local development
- `npm run build` builds and runs the Next.js type check
- `npm run typecheck` runs `tsc --noEmit`
- CI (`.github/workflows/ci.yml`) runs install, build and typecheck on every push to `main`
- `scripts/sandbox-check.ps1` runs manual PayPal sandbox checks. It reads credentials from `.env.local`, or from `C:\Users\HomePC\Desktop\Paypal\.env.txt` on the owner's machine

## Stack

- Next.js 16 App Router, React 19, TypeScript 6, zod 4, npm
- PayPal through APIMatic's generated SDK `paypal`, pinned to a git commit in `package.json`
- Planned: Supabase for data and scheduled jobs, OpenRouter for AI, Vercel for hosting
- Visual design belongs to the project owner. Keep UI markup plain and semantic until designs arrive, and do not invent a visual style

## PayPal rules

- Sandbox only. Live PayPal is refused unless `PAYPAL_ALLOW_LIVE=true`
- Read `paypal-plan.md` before changing anything under `src/lib/paypal/`. It is the contract sheet for every SDK call, and it must stay in sync with the code
- Load the APIMatic skills in `.devin/skills/` before writing PayPal SDK code. Start with `typescript-integrate-paypal`, then the companions the plan names. Never write an SDK name, field or enum member from memory
- Orders and payments (holds, charges, releases, renewals) go through the `paypal` SDK. Payouts, Log in with PayPal and webhook verification are not in that SDK and go through `src/lib/paypal/rest.ts`
- Every PayPal write sends a `PayPal-Request-Id` (or Payouts `sender_batch_id`) derived from a stable business key, never a random value per attempt
- A connection failure or timeout on a write is an unknown outcome, never a failure. Settle it by re-reading PayPal
- Translate every PayPal failure through `translatePayPalFailure` in `src/lib/paypal/errors.ts`
- Money is integer cents in Owed's code and a two-decimal string at the PayPal boundary (`src/lib/money.ts`). Never use floats for money

## AI rules

- The AI drafts closure messages and flags risky wording. It never decides to move money. Holds, charges, payouts and releases are triggered only by fixed rules in server code
- Closure messages state a status, not reasons for rejection

## Safety and dependencies

- Never commit secrets. `.env`, `.env.*` and `.env.local` are ignored; `.env.example` lists the variables
- Pin exact dependency versions, and prefer releases at least 7 days old
- Do not add code comments unless asked

## APIMatic sponsor usage

The project uses APIMatic's Context Plugin for PayPal (TypeScript skills copied into `.devin/skills/`, MIT licensed, see `.devin/skills/LICENSE-apimatic-context-plugins.txt`). Record in the README where the plugin shaped the integration, because the APIMatic claim form asks for visible usage.

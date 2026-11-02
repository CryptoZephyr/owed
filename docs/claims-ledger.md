# Docs claims ledger

Verified against `cf76205` on 2026-11-02. The sandbox results below are the runs recorded in the README.

| Claim | Page | Source (file, route, test, or transaction) | Verified on |
| --- | --- | --- | --- |
| Owed promises every interviewed candidate a reply by a set date, backed by one employer-approved PayPal hold per role. | get-started/introduction | AGENTS.md, README.md, src/lib/owed/roles.ts | 2026-11-02 |
| A $25 guarantee for three candidates has a $75 hold, with no charge before a missed deadline. | get-started/introduction | README.md, src/components/PromiseForm.tsx | 2026-11-02 |
| A candidate with no closure by the deadline can receive the $25 guarantee through PayPal, and the unused hold is released when the role closes. | get-started/introduction | README.md, src/lib/owed/worker.ts, src/lib/owed/roles.ts | 2026-11-02 |
| AI drafts and flags closure wording, while fixed server rules control money movement. | get-started/introduction | src/lib/owed/closure-ai.ts, src/lib/owed/worker.ts | 2026-11-02 |
| A recorded sandbox run paid a candidate $1.00 after the deadline passed without closure. | get-started/introduction | README.md, “Tested with real PayPal sandbox accounts” | 2026-11-02 |
| 63% of US job candidates said they were left in the dark after an interview. | get-started/introduction | Greenhouse 2025 Workforce & Hiring Report, linked in the page | 2026-11-02 |
| Most employers mean to reply, but nothing happens to them when they forget. | get-started/introduction | README.md product rationale | 2026-11-02 |
| Candidates see the amount and reply date before accepting a private invitation. | get-started/introduction | src/app/invite/[token]/page.tsx | 2026-11-02 |
| The project has not been verified with live PayPal or tested with real employers. | get-started/introduction | README.md, “Tested with real PayPal sandbox accounts”; Owed brief | 2026-11-02 |
| A role moves from promise details to an approved hold, candidate invitations, closure, and release. | get-started/how-it-works | src/app/employer/page.tsx, src/app/employer/roles/[id]/page.tsx, src/lib/owed/roles.ts | 2026-11-02 |
| A timely status closes a candidate's promise without a charge. | get-started/how-it-works | src/lib/owed/roles.ts, tests/database.integration.ts | 2026-11-02 |
| A successful sandbox try-out proves only the tested account and flow at that time. | get-started/quickstart | README.md, “Tested with real PayPal sandbox accounts” | 2026-11-02 |
| PayPal sandbox accounts use test money, and personal accounts cannot sign in to the sandbox. | get-started/quickstart | README.md; src/lib/env.ts; PayPal sandbox results in README | 2026-11-02 |
| The role form collects title, employer name, amount, capacity, and deadline, then shows the total hold. | guides/create-a-role | src/components/PromiseForm.tsx | 2026-11-02 |
| Guarantees range from $1 to $1,000, capacity ranges from 1 to 100, and the reply deadline is within 21 days and at least one day before hold expiry. | guides/create-a-role | src/lib/owed/domain.ts, src/components/PromiseForm.tsx | 2026-11-02 |
| Form errors preserve entered role values and name the field or deadline rule to fix. | guides/create-a-role | src/lib/owed/role-form-state.ts, src/app/employer/page.tsx | 2026-11-02 |
| Owed opens PayPal's sandbox approval page and waits for confirmation before enabling candidate invitations. | guides/fund-the-hold | src/app/employer/roles/[id]/approve/page.tsx, src/lib/owed/roles.ts | 2026-11-02 |
| Candidate invitations are available only for active roles with funded places. | guides/fund-the-hold | src/lib/owed/roles.ts, src/app/employer/roles/[id]/page.tsx | 2026-11-02 |
| Invitations store a candidate label, intended PayPal email, and a protected form of the private link. | guides/invite-candidates | src/lib/owed/roles.ts, src/lib/owed/auth.ts | 2026-11-02 |
| An unclaimed invitation can be corrected before its deadline, and the replacement link invalidates the old link. | guides/invite-candidates | src/lib/owed/roles.ts, src/app/employer/roles/[id]/page.tsx | 2026-11-02 |
| A role cannot invite beyond capacity, and a PayPal email can be invited once per role. | guides/invite-candidates | src/lib/owed/roles.ts | 2026-11-02 |
| Owed requires the invited candidate's verified PayPal email before accepting the promise. | guides/claim-a-guarantee | src/lib/owed/roles.ts, src/app/invite/[token]/page.tsx | 2026-11-02 |
| Accepted guarantees appear on the candidate page and are bound to the accepting PayPal account. | guides/claim-a-guarantee | src/lib/owed/roles.ts, src/app/candidate/page.tsx | 2026-11-02 |
| A still-deciding closure can set one later deadline once while the hold remains valid. | guides/send-closure | src/lib/owed/roles.ts, src/app/employer/roles/[id]/page.tsx | 2026-11-02 |
| Owed records closure messages and shows them on the role and candidate pages. | guides/send-closure | src/lib/owed/roles.ts, src/app/employer/roles/[id]/page.tsx, src/app/candidate/page.tsx | 2026-11-02 |
| A deadline reminder is created when an unanswered candidate reply is due within 24 hours. | guides/deadline-and-payout | supabase/migrations/202610190001_owed.sql, src/lib/owed/email.ts | 2026-11-02 |
| After an unanswered deadline, Owed charges the guarantee and sends a payout to the accepting PayPal account. | guides/deadline-and-payout | src/lib/owed/worker.ts, src/lib/owed/roles.ts | 2026-11-02 |
| A payout can remain pending or unclaimed, and Owed does not label an unclaimed payout paid. | guides/deadline-and-payout | src/lib/owed/worker.ts, README.md sandbox results | 2026-11-02 |
| Owed blocks role closure while any candidate still needs closure or payment settlement. | guides/close-the-role | src/lib/owed/roles.ts | 2026-11-02 |
| Closing an eligible role asks PayPal to release the unused hold. | guides/close-the-role | src/lib/owed/roles.ts, src/lib/owed/worker.ts | 2026-11-02 |
| Owed checks PayPal before retrying an uncertain money action and stops for operator review when it cannot confirm a safe result. | guides/recovery | src/lib/owed/worker.ts | 2026-11-02 |
| The full hold equals guarantee amount multiplied by role capacity. | concepts/how-the-money-is-held | supabase/migrations/202610190001_owed.sql | 2026-11-02 |
| Owed charges only the candidate's amount after an unanswered deadline, and charges reduce the remaining hold. | concepts/how-the-money-is-held | src/lib/owed/worker.ts, README.md sandbox results | 2026-11-02 |
| PayPal releases the unused hold when the employer closes a settled role. | concepts/how-the-money-is-held | src/lib/owed/roles.ts, src/lib/owed/worker.ts | 2026-11-02 |
| Employers and candidates sign in with PayPal, and Owed checks verified account identity. | concepts/sign-in-and-identity | src/lib/owed/auth.ts | 2026-11-02 |
| Invitation acceptance matches the intended verified PayPal email, while payout uses the accepted account ID. | concepts/sign-in-and-identity | src/lib/owed/roles.ts, tests/database.integration.ts, README.md sandbox results | 2026-11-02 |
| Owed sends reminders when an unanswered deadline is within 24 hours. | concepts/what-happens-at-the-deadline | supabase/migrations/202610190001_owed.sql, src/lib/owed/worker.ts | 2026-11-02 |
| PayPal can report a payout as pending or unclaimed before it is complete. | concepts/what-happens-at-the-deadline | src/lib/owed/worker.ts, src/lib/owed/present.ts | 2026-11-02 |
| Owed checks the returned PayPal amount and destination before marking a payment complete. | concepts/what-happens-at-the-deadline | src/lib/owed/worker.ts | 2026-11-02 |
| The app sends invitation, reminder, closure, and payout emails when an address is available. | concepts/ai-and-emails | src/lib/owed/email.ts, src/lib/owed/email-template.tsx | 2026-11-02 |
| A definitely unsent email can be attempted three times with five-minute multiples between attempts; unclear sends are not retried automatically. | concepts/ai-and-emails | src/lib/owed/email.ts, tests/email.test.ts | 2026-11-02 |
| A previous free-model request reached the OpenRouter daily cap, and deployed drafting with the current model is unverified. | help/troubleshooting | tests/closure-ai.test.ts, Owed brief | 2026-11-02 |
| Owed defaults to PayPal sandbox and refuses live PayPal unless `PAYPAL_ALLOW_LIVE=true`. | reference/supported | src/lib/env.ts | 2026-11-02 |
| The health route reports whether the app answered and its configured PayPal environment. | reference/deployment | src/app/api/health/route.ts | 2026-11-02 |
| A health response does not prove sign-in, email, AI drafting, or payment flows work. | reference/deployment | src/app/api/health/route.ts | 2026-11-02 |
| Owed uses US dollars, guarantees of $1 to $1,000, role capacity of 1 to 100, and deadlines within 21 days. | reference/fees-and-limits | src/lib/owed/domain.ts, src/lib/paypal/holds.ts, src/lib/paypal/payouts.ts | 2026-11-02 |
| The deadline must leave at least one day before the PayPal hold expires. | reference/fees-and-limits | src/lib/owed/domain.ts | 2026-11-02 |
| Owed absorbs PayPal fees, and the hold covers candidate guarantees only. | reference/fees-and-limits | src/components/PromiseForm.tsx, README.md | 2026-11-02 |
| One recorded $1.00 sandbox capture had a $0.52 PayPal fee, which is not a universal rate. | reference/fees-and-limits | README.md sandbox results, paypal-plan.md | 2026-11-02 |
| The project has no PayPal webhook endpoint wired, and scheduled work reads PayPal records. | reference/limitations | src/app/api, src/lib/owed/worker.ts, docs/technical.md | 2026-11-02 |
| Owed has no product-wide pause switch and no charity fallback for unclaimed payouts. | reference/limitations | src/lib/owed/roles.ts, src/lib/owed/worker.ts, README.md | 2026-11-02 |
| PayPal confirms identity and money movement, while Owed applies the promise rules and keeps its own records. | security/trust-model | src/lib/owed/auth.ts, src/lib/owed/worker.ts | 2026-11-02 |
| Employers approve role holds, and candidates accept private invitations using the intended verified account. | security/permissions | src/lib/owed/roles.ts, src/app/employer/roles/[id]/approve/page.tsx | 2026-11-02 |
| Owed stores account name and verified email, role and candidate details, closure messages, payment references, and statuses. | security/data-and-privacy | supabase/migrations/202610190001_owed.sql, src/lib/owed/auth.ts | 2026-11-02 |
| Invitation links are stored as protected hashes and are not exposed to the wrong account. | security/data-and-privacy | src/lib/owed/roles.ts, src/app/invite/[token]/page.tsx | 2026-11-02 |
| A repeated payment request keeps a stable identity, and Owed reads PayPal's original result before retrying. | security/failure-and-recovery | src/lib/owed/worker.ts, README.md sandbox results | 2026-11-02 |
| Hold creation, authorization, and candidate-charge replay checks can stop for review after five minutes; unknown payouts can be checked for up to 29 days. | security/failure-and-recovery | src/lib/owed/worker.ts | 2026-11-02 |
| The live demo health check shows only that the app answered and its configured PayPal environment at that time. | evidence/live-deployment | src/app/api/health/route.ts | 2026-11-02 |
| The README records a two-candidate sandbox role with one hold, a reminder, a later still-deciding date, two emails, and unused-hold release. | evidence/verified-examples | README.md, “Tested with real PayPal sandbox accounts” | 2026-11-02 |
| A sandbox payout to an email without a PayPal account remained unclaimed and was not shown as paid. | evidence/verified-examples | README.md sandbox results, paypal-plan.md | 2026-11-02 |
| PayPal refused a second request for the same payout, and Owed read back the original payout. | evidence/verified-examples | README.md sandbox results | 2026-11-02 |
| A wrong-account invitation message explains that the link may have been replaced or sent to another account. | help/troubleshooting | src/app/invite/[token]/page.tsx | 2026-11-02 |
| PayPal login cancellation shows a notice to restart sign-in. | help/troubleshooting | src/app/auth/paypal/return/route.ts, src/app/auth/paypal/page.tsx | 2026-11-02 |
| If AI drafting does not respond, Owed fills in its standard message instead. | help/troubleshooting | src/app/employer/roles/[id]/page.tsx, src/app/actions.ts | 2026-11-02 |

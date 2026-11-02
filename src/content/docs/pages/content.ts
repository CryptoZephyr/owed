export type DocLink = { label: string; href: string };
export type DocSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  steps?: string[];
  links?: DocLink[];
};
export type DocContent = { summary: string; sections: DocSection[]; curious?: string[]; curiousCode?: string[] };

const page = (summary: string, sections: DocSection[], curious?: string[], curiousCode?: string[]): DocContent => ({ summary, sections, curious, curiousCode });
const section = (id: string, title: string, paragraphs: string[], bullets?: string[], links?: DocLink[], steps?: string[]): DocSection => ({
  id, title, paragraphs, bullets, links, steps,
});
const link = (label: string, href: string): DocLink => ({ label, href });

export const DOC_CONTENT: Record<string, DocContent> = {
  "start/how-it-works": page("A role moves from a written promise to an approved hold, private invitations, closure, and a final release.", [
    section("role-lifecycle", "One role, one promise", ["The steps below show the normal path from setting the promise to closing the role."], undefined, undefined, [
      "The employer sets the amount per candidate, the number of places, and the reply date.",
      "The employer approves one PayPal hold for the whole role.",
      "The employer sends each candidate a private invitation. Each candidate accepts with the invited PayPal account.",
      "The employer sends each candidate a status before the date.",
      "Owed reminds the employer a day before the date. If no status arrives by the deadline, Owed charges that candidate's amount and pays them through PayPal.",
      "The employer closes the role. PayPal releases the unused part of the hold.",
    ]),
    section("when-a-status-arrives", "When a status arrives", ["A timely status closes that candidate's promise without a charge. The employer can say they are moving forward, not moving forward, or still deciding with one new date."]),
    section("when-a-status-does-not", "When a status does not arrive", ["Owed follows fixed deadline rules. AI doesn't make payment decisions. Read how the scheduled payment works in the deadline guide."], undefined, [link("What happens at the deadline", "/docs/architecture/what-happens-at-the-deadline")]),
  ]),
  "start/try-owed": page("The hosted demo uses PayPal sandbox accounts and test money. You can follow the employer and candidate paths without using live PayPal.", [
    section("before-you-start", "Before you start", ["Use a PayPal sandbox test account, not a personal PayPal account. The demo is configured for the PayPal sandbox only."]),
    section("employer-path", "Employer path", ["Sign in with PayPal, create a role, approve its hold in the sandbox, and return to Owed. Then invite a candidate using the sandbox email tied to that candidate account."]),
    section("candidate-path", "Candidate path", ["Open the private invitation and sign in with the invited sandbox account. Review the amount and date before accepting. The promise then appears on the candidate page."]),
    section("evidence", "What this try-out proves", ["A successful sandbox run shows that the tested account and flow worked at that time. It doesn't prove live PayPal readiness or that every possible account will work."]),
  ]),
  "using/create-a-role": page("A role records the amount promised to each candidate, how many candidates can be invited, and when each candidate should hear back.", [
    section("set-the-promise", "Set the promise", ["Choose a role title, employer name, guarantee per candidate, number of places, and reply date. The total hold is the guarantee multiplied by the number of places."]),
    section("check-the-limits", "Check the limits", ["The guarantee is in US dollars. The reply date must be in the next 21 days and leave at least one day before the PayPal hold expires."], ["Each candidate's guarantee can be $1 to $1,000.", "A role can have 1 to 100 places."]),
    section("save-the-role", "Save the role", ["After you create the role, choose the option to fund it. The hold doesn't start until the employer approves it in PayPal."]),
    section("if-a-field-is-rejected", "If a field is rejected", ["Owed names the field or date rule that needs attention and keeps the values you entered. Correct the named item and try again."]),
  ]),
  "using/fund-the-hold": page("Owed asks PayPal to set aside one hold for the role. The employer reviews and approves that hold in PayPal.", [
    section("one-hold-per-role", "One hold per role", ["The hold covers every planned place in the role. It is the guarantee amount multiplied by the number of places."]),
    section("approve-in-paypal", "Approve in PayPal", ["Owed opens PayPal's sandbox approval page. Check the amount and role description, then approve with the employer's PayPal account. Return to Owed to see whether the hold is ready."]),
    section("before-candidates", "Before inviting candidates", ["Candidate invitations are available after PayPal approves the hold. If approval is still pending, return to the role page and check again."]),
  ]),
  "using/invite-candidates": page("After the hold is approved, create a private invitation for each interviewed candidate.", [
    section("create-an-invitation", "Create an invitation", ["Enter a candidate label and the PayPal email for the account that should accept. Owed creates a private link for that candidate."]),
    section("share-it-privately", "Share it privately", ["Copy the invitation link and send it directly to the candidate. Owed stores a protected form of the link, so copy it when it is first shown."]),
    section("correct-a-mistake", "Correct a mistake", ["Before the deadline, an employer can replace the email for an unclaimed invitation. That creates a new link and makes the old one stop working."]),
    section("capacity", "Places are limited", ["You can invite candidates only while there are funded places available. Each PayPal email can be invited once for a role."]),
  ]),
  "using/claim-a-guarantee": page("A candidate opens the private invitation, signs in with PayPal, checks the promise, and accepts it.", [
    section("check-the-invitation", "Check the invitation", ["The page shows the role, employer, amount, and reply date before you accept. Make sure it is the promise you expect."]),
    section("use-the-invited-account", "Use the invited PayPal account", ["Owed matches the invitation to the verified PayPal email entered by the employer. A different account can't claim it. Sign out and try the account the invitation was sent to."]),
    section("after-accepting", "After you accept", ["The guarantee appears on your candidate page. If no status arrives by the deadline, Owed pays the amount through PayPal to the account you used to accept."]),
  ]),
  "using/send-closure": page("Send each candidate a clear status before the reply date. Owed records the message and notifies the candidate.", [
    section("choose-a-status", "Choose a status", ["Say whether the candidate is moving forward, not moving forward, or whether the team is still deciding. A still-deciding message sets one later date."]),
    section("write-and-review", "Write and review", ["You can use Owed's standard wording or ask AI for a draft. Review the message yourself. AI flags are advice, and risky wording may need an explicit acknowledgement before it can be sent."]),
    section("what-the-candidate-sees", "What the candidate sees", ["Owed records the status and message, shows it on the candidate page, and sends an email when an address is available. The deadline rule follows the recorded closure, not the AI review."]),
  ]),
  "using/deadline-and-payout": page("Owed reminds the employer before the deadline. If the deadline passes with no closure, Owed charges the guarantee and sends it through PayPal.", [
    section("the-day-before", "The day before", ["Owed creates a reminder for the employer when a candidate still has a status due within 24 hours. A scheduled check sends an email."]),
    section("when-the-date-passes", "When the date passes", ["Owed marks the unresolved guarantee as due, checks the remaining hold amount, and asks PayPal to capture that candidate's amount."]),
    section("payment-to-the-candidate", "Payment to the candidate", ["After a successful capture, Owed sends the amount to the PayPal account bound to the accepted invitation. PayPal may report a payout as pending or unclaimed before it is complete."]),
    section("if-the-candidate-has-not-claimed", "If the payout is unclaimed", ["Owed shows an unclaimed payout as unclaimed, not paid. This version doesn't automatically redirect it to a charity."]),
  ]),
  "using/close-the-role": page("Close a role after every candidate has a status and any owed payments are settled. PayPal then releases what remains of the hold.", [
    section("before-closing", "Before closing", ["Give every candidate closure and settle each guarantee that is due. Owed will not release the role hold while a candidate still needs a payment or status."]),
    section("release-the-rest", "Release the rest", ["When the role can close, Owed asks PayPal to release the remaining hold. A completed release closes the role."]),
    section("what-the-receipt-shows", "What the receipt shows", ["The role page records amounts charged, paid, and released. PayPal's own record is the source for what happened to the hold."]),
  ]),
  "using/recovery": page("If a payment is delayed or uncertain, Owed checks PayPal before retrying. Some cases need operator review.", [
    section("wait-for-the-check", "Wait for the check", ["A timeout doesn't tell Owed whether PayPal moved money. Owed keeps the original payment record and checks the result before deciding what to do."]),
    section("when-a-role-needs-attention", "When a role needs attention", ["A rejected or unclear PayPal response can stop automatic progress. The role page shows when something needs attention. Contact the operator with the role and PayPal reference."]),
    section("no-pause-switch", "There is no pause switch", ["Owed has no operator pause control. Live PayPal is refused unless it is deliberately enabled."]),
    section("current-recovery", "Current recovery", ["Owed checks records with PayPal on a schedule."]),
  ]),
  "architecture/how-the-money-is-held": page("The employer approves one PayPal hold for the role. Each candidate's guarantee is a reserved share of that total.", [
    section("one-role-one-hold", "One role, one hold", ["The employer chooses a per-candidate amount and the number of places. Owed calculates the total, then asks PayPal to set that amount aside once."]),
    section("charges-come-from-the-hold", "Charges come from the hold", ["When a candidate is owed payment, Owed captures only that candidate's amount. A successful capture reduces what remains available for the other candidates."]),
    section("the-hold-ends", "The hold ends", ["After every candidate has closure and every owed payment is settled, Owed asks PayPal to release the unused amount."]),
  ], ["The database checks that the hold total equals the guarantee amount times the role's capacity."]),
  "architecture/sign-in-and-identity": page("PayPal sign-in gives Owed a verified identity. An invitation is tied to the intended PayPal email, then to the account that accepts it.", [
    section("sign-in", "Sign in with PayPal", ["Employers and candidates sign in with PayPal. Owed checks the account's name and verified email."]),
    section("invitation-matching", "Match the invitation", ["Before an invitation is claimed, Owed checks that the signed-in account's verified email matches the employer's intended PayPal email. The invitation itself stays private."]),
    section("payout-destination", "Keep the payout destination", ["After the candidate accepts, Owed sends any payout to the PayPal account they used. The entered email matches the invitation, but it isn't the payout destination."]),
  ], ["Session tokens and invitation links are stored as hashes."]),
  "architecture/what-happens-at-the-deadline": page("Owed checks deadlines, sends reminders, and follows overdue payments through PayPal.", [
    section("scheduled-check", "Scheduled check", ["Owed runs a protected check on a schedule. It creates deadline reminders and finds roles that need a payment or hold renewal."]),
    section("charge-and-pay", "Charge and pay", ["For an overdue guarantee, Owed checks how much remains in the role hold, then asks PayPal to charge that candidate's amount. After PayPal confirms the charge, Owed sends a payout to the candidate's PayPal account."]),
    section("read-back", "Check the result", ["Owed checks PayPal's records. It marks a payment complete only when the returned amount and destination match the saved guarantee."]),
    section("unclear-results", "When the result is unclear", ["Owed keeps the payment record and checks with PayPal before retrying. A lost response doesn't prove that a payment failed."]),
  ]),
  "architecture/never-charged-twice": page("Owed saves one record for each money-moving task and checks PayPal before trying again.", [
    section("one-business-record", "One record for each payment", ["Owed saves each hold, candidate charge, payout, renewal, and release, so it can check what happened before trying again."]),
    section("same-key-on-retry", "PayPal recognizes a repeat request", ["Each payment task keeps the same request identity every time Owed tries it. If PayPal already handled that request, it returns the original result, so Owed doesn't start a second payment."]),
    section("unknown-is-not-failure", "An unknown result stays unknown", ["If the connection ends after Owed asks PayPal to move money, it checks with PayPal. If the result still isn't clear, the item needs operator review."]),
  ], ["The PayPal request identity is derived from the role, authorization, or guarantee."]),
  "architecture/ai-and-emails": page("AI drafts closure wording and checks messages for risky text. Owed's fixed rules, not AI, control money.", [
    section("ai-writes-words", "AI works with words", ["The employer can request a short status draft. The employer can edit it and remains responsible for sending it."]),
    section("flags-are-advice", "Flags are advice", ["AI flags wording such as reasons, personal traits, comparisons, or links. The employer can acknowledge an advisory flag. A still-deciding answer must state its new date, and links or email addresses are blocked."]),
    section("emails", "Email follows recorded events", ["Owed sends emails for invitations, reminders, closure messages, and payouts when the account has a usable email address."]),
    section("model-boundary", "What has not been verified", ["Deployed AI drafting with the current model hasn't been verified. The model doesn't authorize holds, charge candidates, send payouts, or release money."]),
  ]),
  "reference/amounts-and-limits": page("Owed uses US dollars and sets limits on guarantee size, role capacity, and deadline length.", [
    section("money", "Money", ["A guarantee is $1 to $1,000 per candidate. The role hold equals that amount multiplied by the number of places."]),
    section("places", "Places", ["A role has 1 to 100 places. An employer can invite candidates until all funded places are used."]),
    section("dates", "Dates", ["The reply date must be in the future and within 21 days. It must also leave at least a day before the PayPal hold expires."]),
    section("currency", "Currency", ["The current flow accepts and pays US dollars."]),
  ]),
  "reference/environments": page("Owed is configured for PayPal Sandbox only. The app refuses live PayPal unless it is deliberately enabled.", [
    section("sandbox-only", "PayPal Sandbox", ["The hosted demo and recorded transaction checks use PayPal sandbox test accounts. Sandbox money is test money."]),
    section("live-is-blocked", "Live PayPal is blocked", ["The app rejects live PayPal unless it is deliberately enabled. No live transaction has been verified for this project."]),
    section("use-test-accounts", "Use sandbox accounts", ["A personal PayPal account can't sign in to the sandbox. Create and use PayPal sandbox buyer accounts for the demo."]),
  ], ["The live-mode override is intentionally explicit."], ["PAYPAL_ALLOW_LIVE=true"]),
  "reference/fees": page("The current hold covers candidate guarantees. Owed absorbs PayPal fees, and candidates receive the full promised amount.", [
    section("who-pays", "Who pays today", ["PayPal fees are paid by Owed today. The hold amount covers candidate guarantees only."]),
    section("recorded-fee", "A recorded fee", ["A sandbox charge of $1.00 carried a $0.52 PayPal fee. That single result shows the fee on that transaction, not a universal rate for every payment."]),
    section("what-is-not-live", "What is not live", ["Employer fee recovery is future work. It isn't included in the current hold or described as a working feature."]),
  ]),
  "reference/states": page("The role and candidate pages use plain labels for where a promise is in its life cycle.", [
    section("role-states", "Role states", ["A role begins as a draft, waits for PayPal approval, becomes active, and later closes. If an action can't be safely settled, the role may need attention."]),
    section("guarantee-states", "Candidate states", ["A candidate invitation can be waiting to be claimed, waiting for a reply, due, being paid, paid, unclaimed, closed, or in need of attention."]),
    section("closure-states", "Closure states", ["A closure records one of three answers: moving forward, not moving forward, or still deciding with a new date."]),
  ], ["The database also records detailed internal states for payment work. The user-facing pages use readable labels."]),
  "reference/deployment": page("The hosted Owed demo is available at owed-vert-ten.vercel.app and uses sandbox data and accounts.", [
    section("hosted-demo", "Hosted demo", ["Open https://owed-vert-ten.vercel.app. The demo uses PayPal sandbox accounts. A health check shows whether the app responds and which PayPal environment it uses."]),
    section("what-a-health-check-proves", "What a health check proves", ["A successful response proves that the health check answered at that time. It doesn't prove that sign-in, email, AI drafting, or payments are working."]),
    section("availability", "Availability", ["The demo is a hackathon project. No uptime target or production support promise is recorded."]),
  ]),
  "reference/limitations": page("Owed has clear limits: sandbox only, no wired PayPal webhooks, unverified deployed AI drafting, and no live employer-demand evidence.", [
    section("sandbox", "Sandbox only", ["Live PayPal hasn't been verified. The sandbox is the only supported environment."]),
    section("webhooks", "Webhooks are not wired", ["Owed doesn't use PayPal webhooks for recovery. It checks records from PayPal on a schedule."]),
    section("ai-and-demand", "AI and demand", ["Deployed AI drafting with the current model is unverified. Real employer demand has not been tested."]),
    section("other-boundaries", "Other boundaries", ["There is no pause switch. Unclaimed payouts are shown as unclaimed, with no charity fallback. Owed hasn't been tested with live PayPal."]),
  ], ["The live-mode override is intentionally explicit."], ["PAYPAL_ALLOW_LIVE=true"]),
  "security/trust-model": page("PayPal confirms account identity and payment records. Owed applies the promise rules and keeps the records people can review.", [
    section("paypal", "PayPal", ["PayPal handles sign-in, the role hold, candidate payments, payouts, and releases. Owed checks PayPal's records to confirm money movement."]),
    section("owed", "Owed", ["Before asking PayPal to act, Owed checks the role, deadline, guarantee, and available hold. It records the status and the evidence PayPal returns."]),
    section("what-people-can-check", "What people can check", ["Employers and candidates can see the role or guarantee in Owed. PayPal references help find payment activity, but a screenshot alone doesn't prove every step."]),
  ]),
  "security/authorization-boundaries": page("The employer approves a role hold. Each candidate accepts a private invitation. Owed checks both before money or identity is used.", [
    section("employer-approval", "Employer approval", ["A hold is created for a specific role and amount. The employer must approve the matching PayPal order before Owed can invite candidates."]),
    section("candidate-acceptance", "Candidate acceptance", ["A private link alone is not enough. Owed also requires the intended candidate's verified PayPal email and binds the accepted guarantee to that account."]),
    section("money-boundary", "Money boundary", ["Only fixed server rules create charges, payouts, renewals, and releases. AI text and employer messages never trigger a payment."]),
  ]),
  "security/replay-protection": page("Owed gives each money-moving task one stable identity and checks PayPal before deciding whether to retry.", [
    section("stable-identities", "Stable identities", ["Every money-moving task keeps the same identity when Owed checks or retries it. Owed also prevents a second record for the same role or guarantee."]),
    section("provider-checks", "Check with PayPal", ["When a response is lost, Owed checks the original order, hold, charge, or payout with PayPal. It doesn't create a new payment identity just to make the screen advance."]),
    section("bounded-retries", "When a check cannot settle it", ["Some uncertain actions can only be retried within a limited time. If Owed can't prove the safe outcome, it stops for operator review."]),
  ], ["Payment identities use stable role, authorization, or guarantee identifiers."]),
  "security/recovery-and-controls": page("Owed has no pause switch. It checks with PayPal on a schedule and stops for review when an outcome remains unclear.", [
    section("no-pause-switch", "No pause switch", ["There is no product control to pause every role or payment. Live PayPal is refused unless it is deliberately enabled."]),
    section("scheduled-recovery", "Scheduled recovery", ["A protected scheduled check looks for reminders, payments, and emails that are due. Owed checks uncertain payments with PayPal before continuing."]),
    section("manual-review", "Manual review", ["If PayPal rejects an action or returns a result that doesn't match, Owed stops and marks the item for attention. An operator must investigate before money movement continues."]),
  ], ["Live PayPal can only be enabled with an explicit environment setting."], ["PAYPAL_ALLOW_LIVE=true"]),
  "security/privacy": page("Owed stores identity and promise details needed to match invitations, show status, and pay the accepted candidate.", [
    section("identity-data", "Identity data", ["Owed stores the PayPal account name and verified email. It uses the email to match a private invitation and sends any payout to the account that accepted it."]),
    section("promise-data", "Promise data", ["Owed stores role details, candidate labels, deadlines, closure messages, payment references, and status records."]),
    section("privacy-boundary", "Privacy boundary", ["Invitation links are private. A wrong-account invitation doesn't reveal the intended email. Owed's privacy page describes current data handling."]),
  ]),
  "proof/live-deployment": page("The public demo responds at owed-vert-ten.vercel.app. A health response is a narrow record, not proof that every flow works.", [
    section("where-to-find-it", "Where to find the demo", ["Open https://owed-vert-ten.vercel.app. The demo is configured to use the PayPal sandbox."]),
    section("health-record", "Health record", ["The app has a health check that reports whether it responded and which PayPal environment is configured."]),
    section("what-it-proves", "What it proves and doesn't prove", ["A successful health check proves that the app answered and reported its configuration at that time. It can't prove a candidate login, a delivered email, an AI response, or a completed PayPal payment."]),
  ]),
  "proof/verified-sandbox-transactions": page("Recorded sandbox runs show holds, releases, a candidate payout, and a two-candidate role. They do not prove live PayPal readiness.", [
    section("employer-hold-and-release", "Hold and release", ["The deployed demo was tested with sandbox accounts. An employer approved a hold and later closed the role, which released the hold."]),
    section("candidate-payment", "Candidate payment", ["A candidate accepted in time, received no status by the deadline, and was paid $1.00 through PayPal. The sandbox account received it, and both sides saw a paid stamp with a PayPal reference."]),
    section("two-candidate-role", "Two-candidate role", ["A two-candidate role received a reminder, a still-deciding answer with a new date, and a final answer. The recorded test reports each email arrived once and the hold was released with nothing charged."]),
    section("limits-of-record", "What these records can't prove", ["These are sandbox results from the recorded runs. They don't prove live-money behavior, universal email delivery, live AI drafting with the current model, or demand from real employers."]),
  ]),
  "proof/full-example": page("One recorded sandbox example shows the employer and candidate paths, from the hold to the final answer and release.", [
    section("setup", "The setup", ["An employer created a role with two candidate places and approved one sandbox hold. Candidates used private invitations and PayPal sandbox accounts."]),
    section("what-happened", "What happened", ["Owed sent a reminder before the date. One candidate received a still-deciding answer with a new date. The employer sent a final answer before that date."]),
    section("result", "The result", ["The recorded test says the emails arrived once and the hold was released with nothing charged. That record demonstrates the tested flow, not every possible PayPal or email outcome."]),
    section("what-it-cannot-show", "What it cannot show", ["The record does not prove live PayPal readiness, general availability, or how real employers would use Owed."]),
  ]),
  "help/troubleshooting": page("Use the message on screen to find the likely cause and next step. Keep the role and PayPal reference when asking for help.", [
    section("invitation", "Invitation will not open", ["The page may say: “This invitation can't be opened with this PayPal account. It may have been replaced by a newer link, or sent to a different PayPal account. Ask the employer for the latest link.” Sign out and use the invited account, or ask the employer for a new link."]),
    section("paypal-login", "PayPal login was canceled or expired", ["Owed may show: “PayPal login was canceled or expired.” Return to Owed and start sign-in again with a sandbox test account." ]),
    section("ai-draft", "AI drafting didn't respond", ["Owed shows: “AI drafting didn't respond.” The standard message is filled in instead. You can send it, edit it, or try again later. A previous run reached the free OpenRouter model's daily cap. Deployed AI drafting with the current model is unverified."]),
    section("role-fields", "A role field needs attention", ["Owed keeps the values you entered and names the field to fix. For example, it may ask you to choose a reply deadline within 21 days or leave at least a day before the PayPal hold expires."]),
    section("payment-or-hold", "A hold or payment needs attention", ["Don't create a second role or try to pay the candidate yourself. Owed may still be checking PayPal. If the role still needs attention, contact the operator with the role and PayPal reference."]),
    section("sandbox-account", "Personal PayPal account will not sign in", ["The app uses PayPal Sandbox. Sign in with a sandbox test account from the PayPal developer dashboard, not a personal account."]),
  ]),
  "help/faq": page("Owed's current behavior is focused on a single promise: every candidate gets closure by the date or a payment through PayPal.", [
    section("who-is-owed-for", "Who is Owed for?", ["Employers who interview candidates and candidates who want a clear reply date. Owed is a PayPal AI Hackathon project."]),
    section("does-owed-use-live-money", "Does Owed use live money?", ["No live PayPal run is verified. The hosted demo uses sandbox accounts and test money."]),
    section("what-if-there-is-no-reply", "What if there is no reply?", ["After the deadline, Owed charges the candidate's amount from the role hold and sends a PayPal payout to the account that accepted the invitation."]),
    section("does-ai-decide", "Does AI decide who gets paid?", ["No. AI drafts and flags words. Fixed deadline rules control charges, payouts, and releases."]),
    section("what-about-fees", "Who pays fees?", ["Owed absorbs PayPal fees today. The hold covers the candidate amounts only."]),
  ]),
};

export function docContent(group: string, slug: string): DocContent | undefined {
  return DOC_CONTENT[`${group}/${slug}`];
}

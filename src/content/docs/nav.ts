export type DocPage = { group: string; slug: string; title: string; summary: string };
export type DocGroup = { slug: string; title: string; pages: DocPage[] };

const group = (slug: string, title: string, pages: [string, string, string][]): DocGroup => ({
  slug,
  title,
  pages: pages.map(([pageSlug, pageTitle, summary]) => ({ group: slug, slug: pageSlug, title: pageTitle, summary })),
});

export const DOC_GROUPS: DocGroup[] = [
  group("get-started", "Get started", [
    ["introduction", "Introduction", "Owed backs an employer's promise to reply after an interview with money held in PayPal."],
    ["how-it-works", "How it works", "Follow one role from promise to closure."],
    ["quickstart", "Quickstart", "Try the employer and candidate paths with sandbox accounts."],
  ]),
  group("guides", "Guides", [
    ["create-a-role", "Create a role", "Set a guarantee, number of places, and reply date."],
    ["fund-the-hold", "Fund the hold", "Approve one PayPal hold for the role."],
    ["invite-candidates", "Invite candidates", "Create private invitations for interviewed candidates."],
    ["claim-a-guarantee", "Claim a guarantee", "Accept an invitation with the PayPal account it was sent to."],
    ["send-closure", "Send closure", "Give each candidate a clear status before the date."],
    ["deadline-and-payout", "Deadline and payout", "What happens when the reply date passes."],
    ["close-the-role", "Close the role", "Finish the role and release what remains."],
    ["recovery", "Recovery", "What to do when PayPal or a payment needs attention."],
  ]),
  group("concepts", "Concepts", [
    ["overview", "Overview", "See what each part of Owed is responsible for."],
    ["how-the-money-is-held", "How the money is held", "One employer-approved hold backs every place in a role."],
    ["sign-in-and-identity", "Sign-in and identity", "How PayPal sign-in connects an invitation to a person."],
    ["what-happens-at-the-deadline", "What happens at the deadline", "The scheduled steps from missed date to payout."],
    ["ai-and-emails", "AI and emails", "What AI writes, what it flags, and when Owed sends email."],
  ]),
  group("reference", "Reference", [
    ["supported", "Supported", "The PayPal sandbox and US dollars are supported today."],
    ["states", "States", "What each visible role and guarantee state means."],
    ["fees-and-limits", "Fees and limits", "Current amounts, dates, currency, and PayPal fees."],
    ["deployment", "Deployment", "What the public demo and health check can show."],
    ["limitations", "Limitations", "Current boundaries and things Owed does not do yet."],
  ]),
  group("security", "Security", [
    ["trust-model", "Trust model", "Who controls each part of the flow."],
    ["permissions", "Permissions", "What employer approval and candidate acceptance allow."],
    ["data-and-privacy", "Data and privacy", "What Owed stores and what stays private."],
    ["failure-and-recovery", "Failure and recovery", "How Owed checks uncertain PayPal outcomes safely."],
  ]),
  group("evidence", "Evidence", [
    ["live-deployment", "Live deployment", "What the live demo can and cannot prove."],
    ["verified-examples", "Verified examples", "Recorded sandbox runs and what each one proves."],
  ]),
  group("help", "Help", [
    ["troubleshooting", "Troubleshooting", "Use real messages to find the next safe step."],
    ["faq", "FAQ", "Short answers about Owed's current behavior."],
  ]),
];

export const ALL_DOCS = DOC_GROUPS.flatMap((row) => row.pages);

export function findDoc(groupSlug: string, pageSlug: string): DocPage | undefined {
  return ALL_DOCS.find((page) => page.group === groupSlug && page.slug === pageSlug);
}

export function docHref(page: Pick<DocPage, "group" | "slug">): string {
  return `/docs/${page.group}/${page.slug}`;
}

export function neighbours(groupSlug: string, pageSlug: string) {
  const index = ALL_DOCS.findIndex((page) => page.group === groupSlug && page.slug === pageSlug);
  return {
    previous: index > 0 ? ALL_DOCS[index - 1] : undefined,
    next: index >= 0 && index < ALL_DOCS.length - 1 ? ALL_DOCS[index + 1] : undefined,
  };
}

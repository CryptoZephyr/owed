export type DocPage = { group: string; slug: string; title: string; summary: string };
export type DocGroup = { slug: string; title: string; pages: DocPage[] };

const group = (slug: string, title: string, pages: [string, string, string][]): DocGroup => ({
  slug,
  title,
  pages: pages.map(([pageSlug, pageTitle, summary]) => ({ group: slug, slug: pageSlug, title: pageTitle, summary })),
});

export const DOC_GROUPS: DocGroup[] = [
  group("start", "Start", [
    ["introduction", "Introduction", "A promise to every interviewed candidate, backed by PayPal."],
    ["why-owed", "Why Owed", "The cost of silence after an interview."],
    ["how-it-works", "How it works", "Follow one role from promise to closure."],
    ["try-owed", "Try Owed", "See the smallest real path through the sandbox demo."],
  ]),
  group("using", "Using Owed", [
    ["create-a-role", "Create a role", "Set a guarantee, number of places, and reply date."],
    ["fund-the-hold", "Fund the hold", "Approve one PayPal hold for the role."],
    ["invite-candidates", "Invite candidates", "Create private invitations for interviewed candidates."],
    ["claim-a-guarantee", "Claim a guarantee", "Accept an invitation with the PayPal account it was sent to."],
    ["send-closure", "Send closure", "Give each candidate a clear status before the date."],
    ["deadline-and-payout", "Deadline and payout", "What happens when the reply date passes."],
    ["close-the-role", "Close the role", "Finish the role and release what remains."],
    ["recovery", "Recovery", "What to do when PayPal or a payment needs attention."],
  ]),
  group("architecture", "Architecture", [
    ["how-the-money-is-held", "How the money is held", "One employer-approved hold backs every place in a role."],
    ["sign-in-and-identity", "Sign-in and identity", "How PayPal sign-in connects an invitation to a person."],
    ["what-happens-at-the-deadline", "What happens at the deadline", "The scheduled steps from missed date to payout."],
    ["never-charged-twice", "How Owed avoids charging twice", "Stable payment records and careful retries."],
    ["ai-and-emails", "AI and emails", "What AI writes, what it flags, and when Owed sends email."],
  ]),
  group("reference", "Reference", [
    ["amounts-and-limits", "Amounts and limits", "Current currency, guarantee, place, and date limits."],
    ["environments", "Environments", "The sandbox is the only supported environment."],
    ["fees", "Fees", "Who pays PayPal fees today."],
    ["states", "States", "What each visible role and guarantee state means."],
    ["deployment", "Deployment", "What the public demo and health check can show."],
    ["limitations", "Limitations", "Current boundaries and things Owed does not do yet."],
  ]),
  group("security", "Security", [
    ["trust-model", "Trust model", "Who controls each part of the flow."],
    ["authorization-boundaries", "Authorization boundaries", "What each PayPal approval allows."],
    ["replay-protection", "Replay protection", "How repeated requests avoid repeated payments."],
    ["recovery-and-controls", "Recovery and controls", "How Owed handles uncertain outcomes and manual review."],
    ["privacy", "Privacy", "What Owed stores and what is private."],
  ]),
  group("proof", "Proof", [
    ["live-deployment", "Live deployment", "What the hosted demo can and cannot prove."],
    ["verified-sandbox-transactions", "Verified sandbox transactions", "Recorded PayPal sandbox checks and their limits."],
    ["full-example", "Full example", "One tested role from approval through release."],
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

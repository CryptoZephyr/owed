import { CLOSURE_STATUSES, GUARANTEE_STATUSES, ROLE_STATUSES } from "@/lib/owed/domain";

export const ROLE_STATUS_MEANINGS: Record<(typeof ROLE_STATUSES)[number], string> = {
  draft: "The role is saved, but its PayPal hold isn't active.",
  approval_pending: "The employer still needs to approve the hold in PayPal.",
  active: "The hold is approved and the role can accept invitations.",
  closing: "Owed is asking PayPal to release the unused hold.",
  closed: "The role is closed and the remaining hold was released.",
  needs_attention: "Owed couldn't safely finish an action and needs a review.",
};

export const GUARANTEE_STATUS_MEANINGS: Record<(typeof GUARANTEE_STATUSES)[number], string> = {
  invited: "The private invitation is waiting for the candidate to accept.",
  pending: "The candidate accepted and is waiting for a reply.",
  overdue: "The reply date passed without closure and payment work is due.",
  charging: "Owed is asking PayPal to take the promised amount from the hold.",
  awaiting_account: "The amount was charged, but no candidate account is linked yet.",
  paying: "PayPal is processing the candidate's payout.",
  paid: "PayPal confirmed the payout completed.",
  unclaimed: "PayPal is holding a payout the candidate hasn't claimed.",
  closed: "The promise closed without a payment.",
  needs_attention: "The payment needs a review before Owed can continue.",
};

export const CLOSURE_STATUS_MEANINGS: Record<(typeof CLOSURE_STATUSES)[number], string> = {
  moving_forward: "The employer told the candidate they are moving forward.",
  not_moving_forward: "The employer told the candidate they are not moving forward.",
  still_deciding: "The employer is still deciding and set one later reply date.",
};

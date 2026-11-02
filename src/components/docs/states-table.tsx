import { Line, Receipt } from "@/components/Receipt";
import { CLOSURE_STATUSES, GUARANTEE_STATUSES, ROLE_STATUSES } from "@/lib/owed/domain";
import { roleState } from "@/lib/present";
import { CLOSURE_STATUS_MEANINGS, GUARANTEE_STATUS_MEANINGS, ROLE_STATUS_MEANINGS } from "@/content/docs/status-meanings";

const guaranteeLabels: Record<(typeof GUARANTEE_STATUSES)[number], string> = {
  invited: "Invitation sent",
  pending: "Waiting for reply",
  overdue: "Deadline missed",
  charging: "Payment in progress",
  awaiting_account: "Waiting for PayPal account",
  paying: "Payout in progress",
  paid: "Paid",
  unclaimed: "Unclaimed payout",
  closed: "Closed",
  needs_attention: "Needs review",
};

const closureLabels: Record<(typeof CLOSURE_STATUSES)[number], string> = {
  moving_forward: "Moving forward",
  not_moving_forward: "Not moving forward",
  still_deciding: "Still deciding",
};

export function StatesTable({ kind }: { kind: "role" | "candidate" | "closure" }) {
  if (kind === "role") return <Receipt label="Role states">
    {ROLE_STATUSES.map((status) => <Line key={status} label={roleState(status).word} value={ROLE_STATUS_MEANINGS[status]} />)}
  </Receipt>;
  if (kind === "candidate") return <Receipt label="Candidate states">
    {GUARANTEE_STATUSES.map((status) => <Line key={status} label={guaranteeLabels[status]} value={GUARANTEE_STATUS_MEANINGS[status]} />)}
  </Receipt>;
  return <Receipt label="Closure states">
    {CLOSURE_STATUSES.map((status) => <Line key={status} label={closureLabels[status]} value={CLOSURE_STATUS_MEANINGS[status]} />)}
  </Receipt>;
}

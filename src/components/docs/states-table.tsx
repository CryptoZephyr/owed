import { Line, Receipt } from "@/components/Receipt";
import { CLOSURE_STATUSES, GUARANTEE_STATUSES, ROLE_STATUSES } from "@/lib/owed/domain";
import { candidateStatusLabel, closureStatusLabel, roleStatusLabel } from "@/components/docs/state-labels";
import { CLOSURE_STATUS_MEANINGS, GUARANTEE_STATUS_MEANINGS, ROLE_STATUS_MEANINGS } from "@/content/docs/status-meanings";

export function StatesTable({ kind }: { kind: "role" | "candidate" | "closure" }) {
  if (kind === "role") return <Receipt label="Role states">
    {ROLE_STATUSES.map((status) => <Line key={status} label={roleStatusLabel(status)} value={ROLE_STATUS_MEANINGS[status]} />)}
  </Receipt>;
  if (kind === "candidate") return <Receipt label="Candidate states">
    {GUARANTEE_STATUSES.map((status) => <Line key={status} label={candidateStatusLabel(status)} value={GUARANTEE_STATUS_MEANINGS[status]} />)}
  </Receipt>;
  return <Receipt label="Closure states">
    {CLOSURE_STATUSES.map((status) => <Line key={status} label={closureStatusLabel(status)} value={CLOSURE_STATUS_MEANINGS[status]} />)}
  </Receipt>;
}

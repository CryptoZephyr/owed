import { STAMP_WORDS } from "@/components/stamp-words";
import { CLOSURE_STATUSES, GUARANTEE_STATUSES, ROLE_STATUSES } from "@/lib/owed/domain";
import { guaranteeState, roleState } from "@/lib/present";

type CandidateStatus = (typeof GUARANTEE_STATUSES)[number];
type ClosureStatus = (typeof CLOSURE_STATUSES)[number];

const sevenDays = 7 * 24 * 60 * 60 * 1000;

function word(presentation: ReturnType<typeof guaranteeState>): string {
  return presentation.kind === "status" ? presentation.word : STAMP_WORDS[presentation.stamp];
}

export function roleStatusLabel(status: (typeof ROLE_STATUSES)[number]): string {
  return roleState(status).word;
}

export function candidateStatusLabel(status: CandidateStatus, now = new Date()): string {
  const presentation = guaranteeState({
    status,
    deadline: new Date(now.getTime() + sevenDays),
    closure_status: null,
    extended: false,
  }, now);
  return word(presentation);
}

export function closureStatusLabel(status: ClosureStatus, now = new Date()): string {
  const isStillDeciding = status === "still_deciding";
  const presentation = guaranteeState({
    status: isStillDeciding ? "pending" : "closed",
    deadline: new Date(now.getTime() + sevenDays),
    closure_status: status,
    extended: isStillDeciding,
  }, now);
  return word(presentation);
}

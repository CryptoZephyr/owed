import type { Tone } from "@/components/Status";
import type { StampKind } from "@/components/Stamp";

export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const c = Math.abs(cents);
  return `${sign}USD ${Math.trunc(c / 100).toLocaleString("en-US")}.${String(c % 100).padStart(2, "0")}`;
}

export function formatTime(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export type Presented = { kind: "status"; word: string; tone: Tone } | { kind: "stamp"; stamp: StampKind };

const open = ["invited", "pending"];

export function guaranteeState(g: { status: string; deadline: Date; closure_status: string | null; extended: boolean }, now = new Date()): Presented {
  if (open.includes(g.status)) {
    const hours = Math.ceil((g.deadline.getTime() - now.getTime()) / 3600000);
    if (hours <= 24) return { kind: "status", word: hours <= 0 ? "Deadline missed" : `Reply due in ${hours} h`, tone: hours <= 0 ? "red" : "amber" };
    if (g.extended && g.closure_status === "still_deciding") return { kind: "status", word: "Still deciding", tone: "blue" };
    return { kind: "status", word: "Waiting for reply", tone: "neutral" };
  }
  if (["overdue", "charging", "paying"].includes(g.status)) return { kind: "status", word: "Deadline missed", tone: "red" };
  if (["awaiting_account", "unclaimed"].includes(g.status)) return { kind: "stamp", stamp: "unclaimed" };
  if (g.status === "paid") return { kind: "stamp", stamp: "paid" };
  if (g.status === "needs_attention") return { kind: "status", word: "Needs review", tone: "red" };
  if (g.closure_status === "moving_forward") return { kind: "status", word: "Moving forward", tone: "green" };
  if (g.closure_status === "not_moving_forward") return { kind: "status", word: "Not moving forward", tone: "neutral" };
  return { kind: "status", word: "Closed", tone: "neutral" };
}

export function isOpen(status: string): boolean {
  return open.includes(status);
}

export function roleState(status: string): { word: string; tone: Tone } {
  const map: Record<string, { word: string; tone: Tone }> = {
    draft: { word: "Not funded", tone: "neutral" },
    approval_pending: { word: "Waiting for PayPal approval", tone: "amber" },
    active: { word: "Hold active", tone: "neutral" },
    closing: { word: "Releasing hold", tone: "neutral" },
    closed: { word: "Closed", tone: "neutral" },
    needs_attention: { word: "Needs review", tone: "red" },
  };
  return map[status] ?? { word: status, tone: "neutral" };
}

export function payoutDetail(status: string, audience: "employer" | "candidate" = "employer"): string | null {
  const you = audience === "candidate";
  if (status === "awaiting_account") return you ? "Your guarantee is charged and waiting for your verified PayPal account." : "Waiting for PayPal account. The guarantee is charged and held for the candidate.";
  if (status === "unclaimed") return you ? "PayPal is holding this payout for you. Claim it in your PayPal account." : "PayPal is holding the payout until the candidate claims it.";
  if (status === "charging") return "Charging the guarantee from the hold through PayPal.";
  if (status === "paying" || status === "overdue") return "Paying the guarantee through PayPal.";
  return null;
}

const kinds: Record<string, string> = {
  create_hold: "Create hold", authorize_hold: "Authorize hold", charge_guarantee: "Charge guarantee",
  payout: "Pay candidate", release_hold: "Release hold", renew_hold: "Renew hold",
};
const states: Record<string, string> = {
  queued: "Queued", processing: "In progress", unknown: "Checking with PayPal", pending: "Waiting on PayPal",
  succeeded: "Done", rejected: "Rejected", manual_review: "Needs review",
};
export const operationKind = (kind: string): string => kinds[kind] ?? kind;
export const operationState = (state: string): string => states[state] ?? state;

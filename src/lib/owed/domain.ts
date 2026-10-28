import { z } from "zod";

export class DomainError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

export const roleInput = z.object({
  title: z.string().trim().min(1).max(160),
  employerName: z.string().trim().min(1).max(120),
  guaranteeCents: z.coerce.number().int().min(100).max(100000),
  capacity: z.coerce.number().int().min(1).max(100),
  deadline: z.iso.datetime({ offset: true }),
});

export const closureInput = z.object({
  status: z.enum(["moving_forward", "not_moving_forward", "still_deciding"]),
  newDeadline: z.iso.datetime({ offset: true }).optional(),
  message: z.string().trim().min(1).max(1200).optional(),
});

export type ClosureStatus = z.infer<typeof closureInput>["status"];

export function deadlineText(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function mentionsDeadline(message: string, date: Date): boolean {
  const iso = date.toISOString();
  const expected = `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
  if (!message.includes(`${expected} UTC`) && !message.includes(iso)) return false;
  return [...message.matchAll(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/g)].every((match) => match[0].replace("T", " ") === expected);
}

export function fixedClosureMessage(status: ClosureStatus, deadline?: Date): string {
  if (status === "moving_forward") return "Thank you for your time. We are moving forward with your application.";
  if (status === "not_moving_forward") return "Thank you for your time. We are not moving forward with your application.";
  if (!deadline) throw new Error("A still-deciding message requires a deadline.");
  return `We are still deciding. We will send you a status by ${deadlineText(deadline)}.`;
}

export const intendedEmail = z.string().trim().toLowerCase().pipe(z.email().max(254));

export type Actor = { id: string; payer_id: string; name: string; verified: boolean; email: string | null; email_verified: boolean };
export type Role = {
  id: string; employer_id: string; title: string; employer_name: string;
  guarantee_cents: number; capacity: number; hold_cents: number; charged_cents: number;
  deadline: Date; status: string; order_id: string | null; approve_url: string | null;
  authorization_id: string | null; authorized_at: Date | null; expires_at: Date | null; renewed: boolean;
};
export type Guarantee = {
  id: string; role_id: string; candidate_id: string | null; candidate_label: string; intended_email: string | null; invite_hash: string;
  deadline: Date; amount_cents: number; status: string; extended: boolean; closure_status: string | null;
  closure_message: string | null; flagged_at: Date | null; payout_status: string | null; capture_id: string | null;
};

export function assertDeadline(date: Date, now = new Date(), limit?: Date): void {
  if (!Number.isFinite(date.getTime()) || date <= now || date.getTime() > now.getTime() + 21 * 86400000) {
    throw new DomainError("Choose a future deadline within 21 days.", 400);
  }
  if (limit && date.getTime() > limit.getTime() - 86400000) {
    throw new DomainError("The deadline must leave at least a day before the PayPal hold expires.", 400);
  }
}

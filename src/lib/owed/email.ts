import "server-only";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { query } from "./db";

export type Mail = { to: string; subject: string; text: string; messageId: string };
export type Mailer = (mail: Mail) => Promise<void>;

type Outgoing = { id: string; kind: string; message: string; email: string | null; name: string | null; title: string | null; employer_name: string | null };

const subjects: Record<string, string> = {
  moving_forward: "Your application status",
  not_moving_forward: "Your application status",
  still_deciding: "Your application status",
  deadline_nudge: "A candidate is waiting for a status",
  paid: "Owed paid your guarantee",
};

let transport: Transporter | undefined;

export function gmailMailer(): Mailer | undefined {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return undefined;
  transport ??= nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  const sender = transport;
  return async (mail) => { await sender.sendMail({ from: `Owed <${user}>`, ...mail }); };
}

export function deliveryAddress(intended: string): string {
  if (process.env.EMAIL_DELIVER_TO_RECIPIENTS === "true") return intended;
  const redirect = process.env.EMAIL_SANDBOX_RECIPIENT || process.env.GMAIL_USER;
  if (!redirect) throw new Error("Set EMAIL_SANDBOX_RECIPIENT or GMAIL_USER for sandbox email delivery.");
  return redirect;
}

function definitelyNotSent(error: unknown): boolean {
  const e = error as { responseCode?: unknown; code?: unknown };
  return typeof e.responseCode === "number" || ["EAUTH", "ECONNECTION", "EDNS"].includes(String(e.code));
}

function describe(error: unknown): string {
  const e = error as { responseCode?: unknown; code?: unknown };
  return [e.code, e.responseCode].filter((part) => part !== undefined).join(" ").slice(0, 120) || "Send failed";
}

export async function sendEmails(limit = 5, mailer: Mailer | undefined = gmailMailer()): Promise<number> {
  if (!mailer) return 0;
  await query(`update owed.notifications set email_state='unknown', email_error='Interrupted send. Not retried to avoid a duplicate email.'
    where email_state='sending' and email_claimed_at < now() - interval '5 minutes'`);
  let sent = 0;
  for (let i = 0; i < limit; i++) {
    const claimed = await query<{ id: string }>(`with next as (
        select id from owed.notifications where email_state='pending' order by created_at limit 1 for update skip locked)
      update owed.notifications n set email_state='sending', email_attempts=email_attempts+1, email_claimed_at=now()
      from next where n.id=next.id returning n.id`);
    if (!claimed[0]) break;
    const n = (await query<Outgoing>(`select n.id,n.kind,n.message,c.email,c.name,r.title,r.employer_name
      from owed.notifications n join owed.candidates c on c.id=n.recipient_id
      left join owed.guarantees g on g.id=n.guarantee_id left join owed.roles r on r.id=g.role_id
      where n.id=$1`, [claimed[0].id]))[0]!;
    if (!n.email) {
      await query("update owed.notifications set email_state='failed', email_error='No email on file.' where id=$1", [n.id]);
      continue;
    }
    const to = deliveryAddress(n.email);
    const text = [
      to === n.email ? undefined : `Sandbox delivery. Intended recipient: ${n.email}`,
      n.name ? `Hello ${n.name},` : "Hello,",
      n.title && n.employer_name ? `Role: ${n.title} at ${n.employer_name}` : undefined,
      n.message,
      process.env.APP_URL,
    ].filter(Boolean).join("\n\n");
    try {
      await mailer({ to, subject: subjects[n.kind] ?? "Owed update", text, messageId: `<${n.id}@notifications.owed>` });
      await query("update owed.notifications set email_state='sent', email_sent_at=now(), email_error=null where id=$1 and email_state='sending'", [n.id]);
      sent++;
    } catch (error) {
      await query(`update owed.notifications set email_error=$3, email_state=case
          when not $2 then 'unknown' when email_attempts < 3 then 'pending' else 'failed' end
        where id=$1 and email_state='sending'`, [n.id, definitelyNotSent(error), describe(error)]);
    }
  }
  return sent;
}

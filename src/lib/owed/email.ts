import "server-only";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { query } from "./db";
import { renderNotificationEmail } from "./email-template";

export type Mail = { to: string; subject: string; text: string; html?: string; messageId: string };
export type Mailer = { verify(): Promise<void>; send(mail: Mail): Promise<void> };

type Outgoing = {
  id: string; kind: string; message: string; email: string | null; email_verified: boolean; name: string | null;
  title: string | null; employer_name: string | null; amount_cents: number | null; deadline: Date | null;
  payout_batch_id: string | null; created_at: Date;
};

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
  transport ??= nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 });
  const sender = transport;
  return {
    verify: async () => { await sender.verify(); },
    send: async (mail) => { await sender.sendMail({ from: `Owed <${user}>`, ...mail }); },
  };
}

function direct(): boolean {
  return process.env.EMAIL_DELIVER_TO_RECIPIENTS === "true";
}

export function deliveryAddress(intended: string): string {
  if (direct()) return intended;
  const redirect = process.env.EMAIL_SANDBOX_RECIPIENT || process.env.GMAIL_USER;
  if (!redirect) throw new Error("Set EMAIL_SANDBOX_RECIPIENT or GMAIL_USER for sandbox email delivery.");
  return redirect;
}

export function emailText(input: {
  to: string;
  intended: string;
  name: string | null;
  title: string | null;
  employerName: string | null;
  message: string;
  appUrl?: string;
}): string {
  return [
    input.to === input.intended ? undefined : `Sandbox delivery. Intended recipient: ${input.intended}`,
    input.name ? `Hello ${input.name},` : "Hello,",
    input.title && input.employerName ? `Role: ${input.title} at ${input.employerName}` : undefined,
    input.message,
    input.appUrl,
  ].filter(Boolean).join("\n\n");
}

export async function sendMailWithHtmlFallback(
  mailer: Pick<Mailer, "send">,
  mail: Omit<Mail, "html">,
  renderHtml: () => Promise<string>,
): Promise<void> {
  let html: string | undefined;
  try {
    html = await renderHtml();
  } catch {
    html = undefined;
  }
  await mailer.send(html === undefined ? mail : { ...mail, html });
}

function definitelyNotSent(error: unknown): boolean {
  const e = error as { responseCode?: unknown; code?: unknown };
  return typeof e.responseCode === "number" || e.code === "EAUTH";
}

function describe(error: unknown): string {
  const e = error as { responseCode?: unknown; code?: unknown };
  return [e.code, e.responseCode].filter((part) => part !== undefined).join(" ").slice(0, 120) || "Send failed";
}

export async function sendEmails(limit = 5, mailer: Mailer | undefined = gmailMailer()): Promise<number> {
  if (!mailer) return 0;
  await query(`update owed.notifications set email_state='unknown', email_error='Interrupted send. Not retried to avoid a duplicate email.'
    where email_state='sending' and email_claimed_at < now() - interval '5 minutes'`);
  const due = await query("select 1 from owed.notifications where email_state='pending' and email_next_attempt_at <= now() limit 1");
  if (!due[0]) return 0;
  try {
    await mailer.verify();
  } catch {
    return 0;
  }
  const started = Date.now();
  let sent = 0;
  for (let i = 0; i < limit && Date.now() - started < 30_000; i++) {
    const claimed = await query<{ id: string }>(`with next as (
        select id from owed.notifications where email_state='pending' and email_next_attempt_at <= now()
          order by created_at limit 1 for update skip locked)
      update owed.notifications n set email_state='sending', email_attempts=email_attempts+1, email_claimed_at=now()
      from next where n.id=next.id returning n.id`);
    if (!claimed[0]) break;
    const n = (await query<Outgoing>(`select n.id,n.kind,n.message,n.created_at,c.email,c.email_verified,c.name,
        r.title,r.employer_name,g.amount_cents,g.deadline,g.payout_batch_id
      from owed.notifications n join owed.candidates c on c.id=n.recipient_id
      left join owed.guarantees g on g.id=n.guarantee_id left join owed.roles r on r.id=g.role_id
      where n.id=$1`, [claimed[0].id]))[0]!;
    if (!n.email || (direct() && !n.email_verified)) {
      await query("update owed.notifications set email_state='failed', email_error='No verified email on file.' where id=$1", [n.id]);
      continue;
    }
    const to = deliveryAddress(n.email);
    const text = emailText({
      to,
      intended: n.email,
      name: n.name,
      title: n.title,
      employerName: n.employer_name,
      message: n.message,
      appUrl: process.env.APP_URL,
    });
    try {
      await sendMailWithHtmlFallback(mailer, {
        to,
        subject: subjects[n.kind] ?? "Owed update",
        text,
        messageId: `<${n.id}@notifications.owed>`,
      }, () => renderNotificationEmail({
        kind: n.kind,
        appOrigin: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
        message: n.message,
        name: n.name,
        title: n.title,
        employerName: n.employer_name,
        amountCents: n.amount_cents,
        deadline: n.deadline,
        paypalReference: n.payout_batch_id,
        paidAt: n.created_at,
        intendedRecipient: to === n.email ? undefined : n.email ?? undefined,
      }));
      await query("update owed.notifications set email_state='sent', email_sent_at=now(), email_error=null where id=$1 and email_state='sending'", [n.id]);
      sent++;
    } catch (error) {
      await query(`update owed.notifications set email_error=$3,
        email_next_attempt_at=now() + email_attempts * interval '5 minutes', email_state=case
          when not $2 then 'unknown' when email_attempts < 3 then 'pending' else 'failed' end
        where id=$1 and email_state='sending'`, [n.id, definitelyNotSent(error), describe(error)]);
    }
  }
  return sent;
}

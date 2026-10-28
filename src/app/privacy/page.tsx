import { PlainFooter } from "@/components/Footer";

export const metadata = { title: "Privacy · Owed" };

export default function PrivacyPage() {
  return <>
    <main>
      <div className="page-head"><h1>Privacy</h1><p className="secondary">What Owed stores, and who it is shared with.</p></div>
      <ol className="rows measure">
        <li className="stack-8" style={{ padding: "12px 0" }}><h2>From PayPal</h2><p>When you sign in with PayPal, Owed stores your PayPal payer ID, your name, your email and whether PayPal has verified them. It uses the payer ID to send payouts and the email to match private invitations.</p></li>
        <li className="stack-8" style={{ padding: "12px 0" }}><h2>Roles and messages</h2><p>Owed stores each role, the candidate names and PayPal emails the employer enters, the deadlines, the status messages sent and the PayPal references for every hold, charge and payout.</p></li>
        <li className="stack-8" style={{ padding: "12px 0" }}><h2>Shared with</h2><p>PayPal processes the holds and payouts. When an employer asks AI to draft or check a message, the status, the role title, the employer name and the message text go to the AI model through OpenRouter. Candidate names and emails are not sent. Emails are sent through Gmail.</p></li>
      </ol>
    </main>
    <PlainFooter />
  </>;
}

import { PlainFooter } from "@/components/Footer";

export const metadata = { title: "Terms · Owed" };

export default function TermsPage() {
  return <>
    <main>
      <div className="page-head"><h1>Terms</h1><p className="secondary">Owed is a PayPal AI Hackathon project running in the PayPal sandbox.</p></div>
      <ol className="rows measure">
        <li className="stack-8" style={{ padding: "12px 0" }}><h2>Sandbox only</h2><p>Every hold, charge and payout uses PayPal sandbox accounts. No real money moves, and no real employer or candidate relationship is created.</p></li>
        <li className="stack-8" style={{ padding: "12px 0" }}><h2>What a guarantee means</h2><p>An employer promises to send an interviewed candidate a status by a set date. If no status is sent by then, Owed charges that candidate&apos;s guarantee from the employer&apos;s PayPal hold and pays it to the candidate&apos;s PayPal account. When the role closes, the rest of the hold is released.</p></li>
        <li className="stack-8" style={{ padding: "12px 0" }}><h2>Messages</h2><p>Status messages say whether the candidate is moving forward, not moving forward or still deciding. They never give reasons. AI may draft and check the wording, and the employer decides what is sent. AI never decides whether money moves.</p></li>
        <li className="stack-8" style={{ padding: "12px 0" }}><h2>Fees</h2><p>In this sandbox build, Owed pays the PayPal fees, and candidates receive the full guarantee.</p></li>
      </ol>
    </main>
    <PlainFooter />
  </>;
}

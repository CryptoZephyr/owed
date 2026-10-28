import { Notice } from "@/components/Notice";
import { PromiseForm } from "@/components/PromiseForm";
import { SilhouetteFooter } from "@/components/Footer";
import { actor } from "@/lib/owed/auth";
import s from "./landing.module.css";

function defaultDeadline(): string {
  const d = new Date(Date.now() + 7 * 86400000);
  return `${d.toISOString().slice(0, 10)}T12:00`;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await actor();
  return <>
    <main className={s.landing}>
      {error && <Notice kind="error" title="That didn't go through">{error}</Notice>}
      <div className={s.hero}>
        <h1 className={s.headline}>Promise every candidate you interview an answer.</h1>
        <p className={s.lede}>Owed backs your reply date with money held in PayPal. Reply in time and the hold is released. Miss the date and the candidate is paid.</p>
      </div>
      <PromiseForm mode="demo" defaults={{ deadline: defaultDeadline() }} signedIn={!!user}>
        <section id="how-it-works" aria-labelledby="how" className="section">
          <h2 id="how">How it works</h2>
          <ol className={s.steps}>
            <li>You approve one PayPal hold that covers every place on the role. Nothing is charged yet.</li>
            <li>Each interviewed candidate claims their guarantee with the PayPal account you invited.</li>
            <li>You send each candidate a status before the deadline. Owed reminds you 24 hours before it.</li>
            <li>Anyone who hears nothing by the deadline is paid from the hold. The rest is released when the role closes.</li>
          </ol>
        </section>
      </PromiseForm>
      <p className="secondary">Invited by an employer? Open the private link they sent you, or <a href="/auth/paypal?returnTo=/candidate">see your guarantees</a>.</p>
    </main>
    <SilhouetteFooter />
  </>;
}

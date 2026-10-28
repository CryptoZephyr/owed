import { notFound } from "next/navigation";
import { actor } from "@/lib/owed/auth";
import { invitationDetails } from "@/lib/owed/roles";
import { money } from "@/lib/present";
import { unavailableInvitationAccountLine } from "@/lib/owed/invitation-copy";
import { ButtonLink, Button } from "@/components/Button";
import { Deadline } from "@/components/Deadline";
import { Line, Receipt } from "@/components/Receipt";
import { SilhouetteFooter } from "@/components/Footer";
import { acceptAction, logoutToInviteAction } from "../../actions";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{43}$/.test(token)) notFound();
  const user = await actor();
  if (!user) return <>
    <main>
      <div className="page-head"><h1>A private invitation</h1>
        <p className="measure">An employer has promised to reply to you by a set date. Sign in with the PayPal account this invitation was sent to, and you&apos;ll see the promise and the amount behind it.</p></div>
      <div className="actions"><ButtonLink href={`/auth/paypal?returnTo=${encodeURIComponent(`/invite/${token}`)}`}>Sign in with PayPal to see the promise</ButtonLink></div>
    </main>
    <SilhouetteFooter />
  </>;
  const invite = await invitationDetails(user, token);
  if (!invite) return <>
    <main>
      <div className="page-head">
        <h1>Invitation unavailable</h1>
        <p className="secondary">{unavailableInvitationAccountLine(user.name)}</p>
        <p className="measure">This invitation can&apos;t be opened with this PayPal account.</p>
      </div>
      <div className="actions">
        <form action={logoutToInviteAction}>
          <input type="hidden" name="token" value={token} />
          <Button variant="secondary">Sign out and use another PayPal account</Button>
        </form>
        <ButtonLink href="/">Go to the Owed home page</ButtonLink>
      </div>
    </main>
    <SilhouetteFooter />
  </>;
  return <>
    <main>
      <div className="page-head"><p className="secondary">{invite.employer_name} · {invite.title}</p><h1>This employer promised to reply.</h1></div>
      <div className="stack-24" style={{ maxWidth: 560 }}>
        <Deadline deadline={invite.deadline} />
        <Receipt label="Guarantee">
          <Line label="Employer" value={invite.employer_name} />
          <Line label="Role" value={invite.title} />
          <Line label="Paid to you if no reply" value={money(invite.amount_cents)} total />
        </Receipt>
        <p className="measure">If no status reaches you by then, Owed pays you {money(invite.amount_cents)} through PayPal. It goes only to the PayPal account that accepts this invitation.</p>
        {invite.candidate_id ? <p className="secondary">You&apos;ve accepted this guarantee. <a href="/candidate">See its status</a>.</p>
          : <form action={acceptAction} className="actions"><input type="hidden" name="token" value={token} /><Button>Accept with my PayPal account</Button></form>}
      </div>
    </main>
    <SilhouetteFooter />
  </>;
}

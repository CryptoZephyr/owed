import { notFound } from "next/navigation";
import { actor } from "@/lib/owed/auth";
import { invitationDetails } from "@/lib/owed/roles";
import { acceptAction } from "../../actions";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{43}$/.test(token)) notFound();
  const user = await actor();
  if (!user) return <main><h1>Private invitation</h1><p>Connect your PayPal account to view an invitation intended for your verified PayPal email.</p>
    <a href={`/auth/paypal?returnTo=${encodeURIComponent(`/invite/${token}`)}`}>Connect with PayPal sandbox</a></main>;
  const invite = await invitationDetails(user, token);
  if (!invite) notFound();
  return <main><h1>A guarantee from {invite.employer_name}</h1><p>{invite.title}. USD {(invite.amount_cents / 100).toFixed(2)} if no status arrives by {invite.deadline.toISOString()} UTC.</p>
    <p>This guarantee pays only to the PayPal account that accepts the invitation.</p>
    {invite.candidate_id ? <p>You already accepted this guarantee.</p>
      : <form action={acceptAction}><input type="hidden" name="token" value={token} /><button type="submit">Accept guarantee with my connected PayPal account</button></form>}
  </main>;
}

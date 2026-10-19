import { notFound } from "next/navigation";
import { actor } from "@/lib/owed/auth";
import { query } from "@/lib/owed/db";
import { hashToken } from "@/lib/owed/roles";
import { acceptAction } from "../../actions";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{43}$/.test(token)) notFound();
  const user = await actor();
  const invite = (await query<{ title: string; employer_name: string; amount_cents: number; deadline: Date; candidate_id: string | null }>(`select r.title,r.employer_name,g.amount_cents,g.deadline,g.candidate_id
    from owed.guarantees g join owed.roles r on r.id=g.role_id where g.invite_hash=$1`, [hashToken(token)]))[0];
  if (!invite) notFound();
  return <main><h1>A guarantee from {invite.employer_name}</h1><p>{invite.title}. USD {(invite.amount_cents / 100).toFixed(2)} if no status arrives by {invite.deadline.toISOString()} UTC.</p>
    <p>Connect a verified PayPal account to receive the full guarantee. This private invitation belongs to one candidate. Only accept an invitation intended for you.</p>
    {!user ? <a href={`/auth/paypal?returnTo=${encodeURIComponent(`/invite/${token}`)}`}>Connect with PayPal sandbox</a>
      : invite.candidate_id && invite.candidate_id !== user.id ? <p>This invitation has already been claimed.</p>
        : <form action={acceptAction}><input type="hidden" name="token" value={token} /><button type="submit">Accept guarantee with my connected PayPal account</button></form>}
  </main>;
}

import { requireActor } from "@/lib/owed/auth";
import { query } from "@/lib/owed/db";
import type { Guarantee } from "@/lib/owed/domain";
import { flagAction } from "../actions";

export default async function CandidatePage() {
  const user = await requireActor();
  const guarantees = await query<Guarantee & { title: string; employer_name: string }>(`select g.*,r.title,r.employer_name
    from owed.guarantees g join owed.roles r on r.id=g.role_id where g.candidate_id=$1 order by g.created_at desc`, [user.id]);
  return <main><h1>Your guarantees</h1><p>Your PayPal account is {user.verified ? "verified and connected" : "not verified"}. Payouts go to the account connected through PayPal, never an address entered in a form.</p>
    {!guarantees.length && <p>No guarantees yet. Open the private invitation from your employer to connect one.</p>}
    <ul>{guarantees.map((g) => <li key={g.id}><article><h2>{g.title} at {g.employer_name}</h2>
      <p>Guarantee: USD {(g.amount_cents / 100).toFixed(2)}. Deadline, UTC: {g.deadline.toISOString()}. Status: {g.status}.</p>
      {g.payout_status && <p>PayPal payout status: {g.payout_status}. A pending or unclaimed payout is not marked paid.</p>}
      {g.closure_message && <p>{g.closure_message}</p>}
      {g.status === "needs_attention" && <p>The payment needs operator review. Owed won&apos;t send a second payment to replace an unknown outcome.</p>}
      <form action={flagAction}><input type="hidden" name="id" value={g.id} /><button type="submit" disabled={!!g.flagged_at}>{g.flagged_at ? "Review requested" : "Flag this for review"}</button></form>
    </article></li>)}</ul>
    <p>Payment status is checked by the minute scheduler. <a href="/candidate">Refresh status</a>.</p>
  </main>;
}

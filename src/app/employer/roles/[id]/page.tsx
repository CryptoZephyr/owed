import { notFound } from "next/navigation";
import { z } from "zod";
import { appOrigin, requireActor } from "@/lib/owed/auth";
import { query } from "@/lib/owed/db";
import type { Guarantee, Role } from "@/lib/owed/domain";
import { closeGuaranteeAction, closeRoleAction, fundRoleAction, inviteAction } from "../../../actions";

export default async function RolePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ invitation?: string }>;
}) {
  const user = await requireActor();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const role = (await query<Role>("select * from owed.roles where id=$1 and employer_id=$2", [id, user.id]))[0];
  if (!role) notFound();
  const guarantees = await query<Guarantee>("select * from owed.guarantees where role_id=$1 order by created_at", [id]);
  const operations = await query<{ id: string; kind: string; state: string }>("select id,kind,state from owed.paypal_operations where role_id=$1 order by created_at", [id]);
  const { invitation } = await searchParams;
  const invite = invitation && /^[\w-]{43}$/.test(invitation) ? `${appOrigin()}/invite/${invitation}` : null;
  return <main>
    <h1>{role.title}</h1><p>{role.employer_name}</p>
    <dl><dt>Status</dt><dd>{role.status}</dd><dt>Hold</dt><dd>USD {(role.hold_cents / 100).toFixed(2)}</dd>
      <dt>Charged</dt><dd>USD {(role.charged_cents / 100).toFixed(2)}</dd><dt>Deadline, UTC</dt><dd>{role.deadline.toISOString()}</dd>
      <dt>Hold expires</dt><dd>{role.expires_at?.toISOString() ?? "Not authorized"}</dd></dl>
    <p>PayPal operations run on the minute scheduler. <a href={`/employer/roles/${id}`}>Refresh status</a>.</p>
    {role.status === "draft" && <form action={fundRoleAction}><input type="hidden" name="id" value={id} /><button type="submit">Prepare PayPal hold</button></form>}
    {role.status === "approval_pending" && role.approve_url && <p><a href={role.approve_url} rel="noreferrer">Approve this hold in PayPal sandbox</a></p>}
    {role.status === "needs_attention" && <p role="alert">A PayPal outcome needs operator review. No new hold or payment will be created to replace an unknown one.</p>}
    {role.status === "active" && <section><h2>Invite an interviewed candidate</h2>
      <p>{guarantees.length} of {role.capacity} funded places allocated. A private link can be claimed by one verified PayPal account. Share it only with the intended candidate.</p>
      <form action={inviteAction}><input type="hidden" name="id" value={id} /><label>Candidate label <input name="label" required maxLength={120} /></label> <button type="submit">Create private invitation</button></form>
    </section>}
    {invite && <section><h2>Private invitation</h2><p>Copy this link now. Owed stores only its hash, so it cannot show it again.</p><p><a href={invite}>{invite}</a></p></section>}
    <h2>Candidates</h2>
    <ul>{guarantees.map((g) => <li key={g.id}><article><h3>{g.candidate_label}</h3>
      <p>{g.candidate_id ? "PayPal connected" : "Awaiting candidate connection"}. {g.status}. USD {(g.amount_cents / 100).toFixed(2)}. Due {g.deadline.toISOString()}.</p>
      {g.closure_message && <p>{g.closure_message}</p>}{g.flagged_at && <p>Candidate requested a review. A flag does not change payment rules.</p>}
      {["invited", "pending"].includes(g.status) && <form action={closeGuaranteeAction}>
        <input type="hidden" name="id" value={g.id} />
        <p><label>Status <select name="status"><option value="moving_forward">Moving forward</option><option value="not_moving_forward">Not moving forward</option>{!g.extended && <option value="still_deciding">Still deciding, with a new date</option>}</select></label></p>
        <p><label>New deadline in UTC, only for still deciding <input name="newDeadline" type="datetime-local" /></label></p>
        <p>Owed sends a status-only message, without rejection reasons. A new date can be set once and must fit within the hold.</p>
        <button type="submit">Send status</button>
      </form>}
    </article></li>)}</ul>
    {role.status === "active" && <form action={closeRoleAction}><input type="hidden" name="id" value={id} /><p>Once every guarantee is closed or paid, release the rest of the hold.</p><button type="submit">Close role and release unused hold</button></form>}
    <h2>Payment operations</h2><ul>{operations.map((op) => <li key={op.id}>{op.kind}: {op.state}</li>)}</ul>
  </main>;
}

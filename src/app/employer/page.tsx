import { requireActor } from "@/lib/owed/auth";
import { query } from "@/lib/owed/db";
import type { Role } from "@/lib/owed/domain";
import { createRoleAction } from "../actions";

export default async function EmployerPage() {
  const user = await requireActor();
  const roles = await query<Role>("select * from owed.roles where employer_id=$1 order by created_at desc", [user.id]);
  const notices = await query<{ id: string; message: string }>("select id,message from owed.notifications where recipient_id=$1 order by created_at desc limit 20", [user.id]);
  return <main>
    <h1>Employer dashboard</h1>
    {!user.verified && <p>Use a verified PayPal account to fund a role.</p>}
    <h2>Your roles</h2>
    <ul>{roles.map((role) => <li key={role.id}><a href={`/employer/roles/${role.id}`}>{role.title}</a> ({role.status})</li>)}</ul>
    <h2>Create a role</h2>
    <form action={createRoleAction}>
      <p><label>Role title <input name="title" required maxLength={160} /></label></p>
      <p><label>Employer name <input name="employerName" required maxLength={120} /></label></p>
      <p><label>Guarantee per candidate, USD cents <input name="guaranteeCents" type="number" min={100} max={100000} step={1} defaultValue={1000} required /></label></p>
      <p><label>Interviewed candidates to cover <input name="capacity" type="number" min={1} max={100} step={1} defaultValue={1} required /></label></p>
      <p><label>Closure deadline, UTC <input name="deadline" type="datetime-local" required /></label></p>
      <p>Choose a date within 21 days. The hold covers the guarantee times the number of places. Candidates always receive the full guarantee.
        This sandbox build funds PayPal processing and payout fees from the merchant balance, not the candidate&apos;s guarantee. Employer fee recovery is not implemented.</p>
      <button type="submit">Create role</button>
    </form>
    <h2>Notifications</h2><ul>{notices.map((n) => <li key={n.id}>{n.message}</li>)}</ul>
  </main>;
}

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { query, transaction } from "./db";
import { assertDeadline, closureInput, DomainError, fixedClosureMessage, intendedEmail, mentionsDeadline, roleInput } from "./domain";
import type { Actor, ClosureStatus, Guarantee, Role } from "./domain";
import type { ClosureContext, Review } from "./closure-ai";

export const hashToken = (value: string): string => createHash("sha256").update(value).digest("hex");

export async function enqueue(db: PoolClient, roleId: string, kind: string, businessKey: string, input: object): Promise<void> {
  await db.query(`insert into owed.paypal_operations (role_id, kind, business_key, input) values ($1,$2,$3,$4)
    on conflict (kind, business_key) do nothing`, [roleId, kind, businessKey, JSON.stringify(input)]);
}

export async function lockedRole(db: PoolClient, id: string, actor?: Actor): Promise<Role> {
  const role = (await db.query<Role>("select * from owed.roles where id = $1 for update", [id])).rows[0];
  if (!role || (actor && role.employer_id !== actor.id)) throw new DomainError("Role not found.", 404);
  return role;
}

export async function createRole(actor: Actor, raw: unknown): Promise<string> {
  if (!actor.verified) throw new DomainError("Use a verified PayPal account.", 403);
  const input = roleInput.parse(raw);
  const deadline = new Date(input.deadline);
  assertDeadline(deadline);
  return transaction(async (db) => {
    const row = (await db.query<{ id: string }>(`insert into owed.roles
      (employer_id,title,employer_name,guarantee_cents,capacity,hold_cents,deadline)
      values ($1,$2,$3,$4,$5,$4::integer*$5::integer,$6) returning id`,
    [actor.id, input.title, input.employerName, input.guaranteeCents, input.capacity, deadline])).rows[0]!;
    return row.id;
  });
}

export async function fundRole(actor: Actor, id: string, origin: string): Promise<void> {
  await transaction(async (db) => {
    const role = await lockedRole(db, id, actor);
    if (!["draft", "approval_pending"].includes(role.status)) throw new DomainError("This role already has a hold.");
    assertDeadline(role.deadline);
    await enqueue(db, id, "create_hold", id, {
      roleId: id, amountCents: role.hold_cents, description: `Owed: ${role.title.slice(0, 120)}`,
      returnUrl: `${origin}/employer/roles/${id}/approve`, cancelUrl: `${origin}/employer/roles/${id}`,
    });
  });
}

export async function approveRole(actor: Actor, id: string, orderId: string): Promise<void> {
  await transaction(async (db) => {
    const role = await lockedRole(db, id, actor);
    if (!role.order_id || role.order_id !== orderId) throw new DomainError("PayPal order does not match this role.", 400);
    if (role.status === "active") return;
    if (role.status !== "approval_pending") throw new DomainError("This role cannot be authorized.");
    assertDeadline(role.deadline);
    await enqueue(db, id, "authorize_hold", orderId, { orderId, payerId: actor.payer_id, amountCents: role.hold_cents, deadline: role.deadline.toISOString() });
  });
}

export async function inviteCandidate(actor: Actor, id: string, label: string, paypalEmail: string): Promise<string> {
  const name = label.trim();
  if (!name || name.length > 120) throw new DomainError("Enter a candidate label of up to 120 characters.", 400);
  const email = intendedEmail.parse(paypalEmail);
  const token = randomBytes(32).toString("base64url");
  await transaction(async (db) => {
    const role = await lockedRole(db, id, actor);
    if (role.status !== "active" || !role.expires_at) throw new DomainError("Authorize the role's hold first.");
    assertDeadline(role.deadline, new Date(), role.expires_at);
    const count = (await db.query<{ count: string }>("select count(*) from owed.guarantees where role_id=$1", [id])).rows[0]!;
    if (Number(count.count) >= role.capacity) throw new DomainError("Every funded place is already allocated.");
    const duplicate = await db.query("select id from owed.guarantees where role_id=$1 and intended_email=$2", [id, email]);
    if (duplicate.rowCount) throw new DomainError("This PayPal email is already invited for this role.");
    await db.query(`insert into owed.guarantees (role_id, invite_hash, candidate_label, intended_email, deadline, amount_cents)
      values ($1,$2,$3,$4,$5,$6)`, [id, hashToken(token), name, email, role.deadline, role.guarantee_cents]);
  });
  return token;
}

export async function correctInvitationEmail(actor: Actor, id: string, previousEmail: string, paypalEmail: string): Promise<{ roleId: string; token: string }> {
  const email = intendedEmail.parse(paypalEmail);
  const token = randomBytes(32).toString("base64url");
  return transaction(async (db) => {
    const initial = (await db.query<{ role_id: string }>("select role_id from owed.guarantees where id=$1", [id])).rows[0];
    if (!initial) throw new DomainError("Guarantee not found.", 404);
    const role = await lockedRole(db, initial.role_id, actor);
    const g = (await db.query<Guarantee>("select * from owed.guarantees where id=$1 for update", [id])).rows[0];
    if (!g || g.role_id !== role.id) throw new DomainError("Guarantee not found.", 404);
    if (role.status !== "active" || !role.expires_at || g.status !== "invited" || g.candidate_id || g.capture_id) {
      throw new DomainError("Only an unclaimed invitation on an active role can be corrected.");
    }
    const now = (await db.query<{ now: Date }>("select clock_timestamp() as now")).rows[0]!.now;
    if (g.deadline <= now) throw new DomainError("The guarantee deadline has passed. Contact the operator.");
    if (role.expires_at <= now) throw new DomainError("The role hold has expired. Contact the operator.");
    if (g.intended_email !== (previousEmail || null)) throw new DomainError("The invitation has changed. Refresh the role page before correcting it.");
    if (email === g.intended_email) throw new DomainError("Enter a different PayPal email.", 400);
    const duplicate = await db.query("select id from owed.guarantees where role_id=$1 and intended_email=$2 and id<>$3", [role.id, email, id]);
    if (duplicate.rowCount) throw new DomainError("This PayPal email is already invited for this role.");
    await db.query("update owed.guarantees set intended_email=$2,invite_hash=$3 where id=$1", [id, email, hashToken(token)]);
    return { roleId: role.id, token };
  });
}

export async function invitationDetails(actor: Actor | null, token: string): Promise<{
  title: string; employer_name: string; amount_cents: number; deadline: Date; candidate_id: string | null;
} | null> {
  if (!actor) return null;
  return (await query<{ title: string; employer_name: string; amount_cents: number; deadline: Date; candidate_id: string | null }>(
    `select r.title,r.employer_name,g.amount_cents,g.deadline,g.candidate_id
    from owed.guarantees g join owed.roles r on r.id=g.role_id
    join owed.candidates c on c.id=$2
    where g.invite_hash=$1 and c.verified and r.employer_id<>c.id
      and (g.candidate_id=c.id or (g.candidate_id is null and c.email_verified and c.email=g.intended_email))`,
    [hashToken(token), actor.id],
  ))[0] ?? null;
}

export async function acceptInvite(actor: Actor, token: string): Promise<void> {
  if (!actor.verified) throw new DomainError("Connect a verified PayPal account to receive a guarantee.", 403);
  await transaction(async (db) => {
    const existing = (await db.query<Guarantee>("select * from owed.guarantees where invite_hash=$1", [hashToken(token)])).rows[0];
    if (!existing) throw new DomainError("Invitation not found.", 404);
    const role = await lockedRole(db, existing.role_id);
    const g = (await db.query<Guarantee>("select * from owed.guarantees where id=$1 for update", [existing.id])).rows[0]!;
    if (g.invite_hash !== hashToken(token)) throw new DomainError("Invitation not found.", 404);
    if (g.candidate_id === actor.id) return;
    if (g.candidate_id) throw new DomainError("This invitation has already been claimed.", 403);
    if (role.employer_id === actor.id) throw new DomainError("An employer cannot claim their own guarantee.", 403);
    const identity = (await db.query<Actor>("select email,email_verified from owed.candidates where id=$1", [actor.id])).rows[0];
    if (!g.intended_email || !identity?.email_verified || identity.email !== g.intended_email) {
      throw new DomainError("This invitation requires the intended candidate's verified PayPal email.", 403);
    }
    const captured = g.status === "awaiting_account" && !!g.capture_id;
    const closed = g.status === "closed";
    if ((!captured && !closed && role.status !== "active") || !["invited", "overdue", "charging", "awaiting_account", "closed"].includes(g.status)) throw new DomainError("This invitation is no longer available.");
    const duplicate = await db.query("select id from owed.guarantees where role_id=$1 and candidate_id=$2", [role.id, actor.id]);
    if (duplicate.rowCount) throw new DomainError("This PayPal account already has a guarantee for this role.");
    await db.query(`update owed.guarantees set candidate_id=$2,
      status=case when status in ('closed','charging') then status when capture_id is not null then 'paying'
        when deadline <= now() then 'overdue' else 'pending' end where id=$1`, [g.id, actor.id]);
    if (captured) await enqueue(db, role.id, "payout", g.id, { guaranteeId: g.id, payerId: actor.payer_id, amountCents: g.amount_cents, employerName: role.employer_name });
  });
}

export async function closeGuarantee(actor: Actor, id: string, raw: unknown, review?: Review): Promise<void> {
  const input = closureInput.parse(raw);
  if (input.message && (!review || review.blocking.length)) throw new DomainError("Review the message before sending it.");
  await transaction(async (db) => {
    const initial = (await db.query<Guarantee>("select * from owed.guarantees where id=$1", [id])).rows[0];
    if (!initial) throw new DomainError("Guarantee not found.", 404);
    const role = await lockedRole(db, initial.role_id, actor);
    const g = (await db.query<Guarantee>("select * from owed.guarantees where id=$1 for update", [id])).rows[0]!;
    const now = (await db.query<{ now: Date }>("select clock_timestamp() as now")).rows[0]!.now;
    if (role.status !== "active" || !["invited", "pending"].includes(g.status) || g.deadline <= now) {
      throw new DomainError("The deadline has passed or this guarantee is already settled. Closure cannot cancel an owed payment.");
    }
    let deadline = g.deadline;
    if (input.status === "still_deciding") {
      if (g.extended || !input.newDeadline || !role.expires_at) throw new DomainError("A new date can be set once while the hold is valid.");
      deadline = new Date(input.newDeadline);
      assertDeadline(deadline, now, role.expires_at);
      if (deadline <= g.deadline) throw new DomainError("The new deadline must be after the existing one.", 400);
    }
    const message = input.message ?? fixedClosureMessage(input.status, deadline);
    if (input.status === "still_deciding" && !mentionsDeadline(message, deadline)) {
      throw new DomainError("A still deciding message must state the new deadline date and time.", 400);
    }
    await db.query(`update owed.guarantees set closure_status=$2, closure_message=$3, deadline=$4,
      extended=extended or $5, status=case when $5 then status else 'closed' end,
      closed_at=case when $5 then null else now() end, nudged_at=null, closure_review=$6 where id=$1`,
    [id, input.status, message, deadline, input.status === "still_deciding", review ? JSON.stringify(review) : null]);
    await db.query("delete from owed.closure_drafts where guarantee_id=$1", [id]);
    if (g.candidate_id) await db.query(`insert into owed.notifications (recipient_id,guarantee_id,kind,message)
      values ($1,$2,$3,$4) on conflict do nothing`, [g.candidate_id, id, input.status, message]);
  });
}

export type ClosureDraft = { guarantee_id: string; status: ClosureStatus; new_deadline: Date | null; message: string; review: Review };

export async function closureContext(actor: Actor, id: string, raw: unknown): Promise<ClosureContext & { roleId: string }> {
  const input = closureInput.parse(raw);
  const g = (await query<Guarantee & { title: string; employer_name: string; role_status: string; expires_at: Date | null }>(
    `select g.*, r.title, r.employer_name, r.status as role_status, r.expires_at from owed.guarantees g
      join owed.roles r on r.id=g.role_id where g.id=$1 and r.employer_id=$2`, [id, actor.id]))[0];
  if (!g) throw new DomainError("Guarantee not found.", 404);
  if (g.role_status !== "active" || !["invited", "pending"].includes(g.status) || g.deadline <= new Date()) {
    throw new DomainError("The deadline has passed or this guarantee is already settled. Closure cannot cancel an owed payment.");
  }
  let newDeadline: Date | undefined;
  if (input.status === "still_deciding") {
    if (g.extended || !input.newDeadline || !g.expires_at) throw new DomainError("A new date can be set once while the hold is valid.");
    newDeadline = new Date(input.newDeadline);
    assertDeadline(newDeadline, new Date(), g.expires_at);
    if (newDeadline <= g.deadline) throw new DomainError("The new deadline must be after the existing one.", 400);
  }
  return { roleId: g.role_id, status: input.status, title: g.title, employerName: g.employer_name, newDeadline };
}

export async function storeClosureDraft(actor: Actor, id: string, ctx: ClosureContext, message: string, review: Review): Promise<void> {
  const saved = await query(`insert into owed.closure_drafts (guarantee_id,status,new_deadline,message,review)
    select g.id,$3,$4,$5,$6 from owed.guarantees g join owed.roles r on r.id=g.role_id where g.id=$1 and r.employer_id=$2
    on conflict (guarantee_id) do update set status=excluded.status, new_deadline=excluded.new_deadline,
      message=excluded.message, review=excluded.review, updated_at=now()
    returning guarantee_id`, [id, actor.id, ctx.status, ctx.newDeadline ?? null, message, JSON.stringify(review)]);
  if (!saved[0]) throw new DomainError("Guarantee not found.", 404);
}

export async function closureDraft(actor: Actor, id: string): Promise<ClosureDraft | undefined> {
  return (await query<ClosureDraft>(`select d.* from owed.closure_drafts d join owed.guarantees g on g.id=d.guarantee_id
    join owed.roles r on r.id=g.role_id where d.guarantee_id=$1 and r.employer_id=$2`, [id, actor.id]))[0];
}

export async function discardClosureDraft(actor: Actor, id: string): Promise<string> {
  const rows = await query<{ role_id: string }>(`delete from owed.closure_drafts d using owed.guarantees g, owed.roles r
    where d.guarantee_id=$1 and g.id=d.guarantee_id and r.id=g.role_id and r.employer_id=$2 returning g.role_id`, [id, actor.id]);
  if (!rows[0]) throw new DomainError("Draft not found.", 404);
  return rows[0].role_id;
}

export async function closeRole(actor: Actor, id: string): Promise<void> {
  await transaction(async (db) => {
    const role = await lockedRole(db, id, actor);
    if (role.status === "closed" || role.status === "closing") return;
    if (role.status !== "active" || !role.authorization_id) throw new DomainError("This role has no active hold to release.");
    const unresolved = await db.query(`select id from owed.guarantees where role_id=$1
      and status not in ('closed','paid','unclaimed') limit 1`, [id]);
    if (unresolved.rowCount) throw new DomainError("Give every candidate closure and settle owed payments before closing the role.");
    await db.query("update owed.roles set status='closing' where id=$1", [id]);
    await enqueue(db, id, "release_hold", role.authorization_id, { roleId: id, authorizationId: role.authorization_id });
  });
}

export async function flagGuarantee(actor: Actor, id: string): Promise<void> {
  const rows = await query(`update owed.guarantees set flagged_at=coalesce(flagged_at,now())
    where id=$1 and candidate_id=$2 returning id`, [id, actor.id]);
  if (!rows.length) throw new DomainError("Guarantee not found.", 404);
}

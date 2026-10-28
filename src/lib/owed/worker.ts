import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PaypalClient } from "paypal";
import { query, transaction } from "./db";
import { enqueue, lockedRole } from "./roles";
import type { Guarantee } from "./domain";
import { authorizeRoleHold, chargeGuarantee, createRoleHold, getCapture, getHold, getOrderHold, releaseHold, renewHold } from "../paypal/holds";
import { getPayoutBatch, payCandidate } from "../paypal/payouts";
import { translatePayPalFailure } from "../paypal/errors";

export type Operation = {
  id: string; role_id: string; kind: string; business_key: string; input: Record<string, unknown>;
  state: string; result: Record<string, unknown> | null; attempts: number; lease_token: string;
  first_sent_at: Date | null;
};
export type Outcome = { state: "succeeded" | "pending" | "manual_review"; result: Record<string, unknown> };
export type Provider = (operation: Operation) => Promise<Outcome>;

export async function schedule(): Promise<void> {
  await query("select owed.tick()");
  const roles = await query<{ id: string }>(`select r.id from owed.roles r where r.status='active' and exists (
    select 1 from owed.guarantees g where g.role_id=r.id and (g.status='overdue' or
      (g.status in ('pending','invited') and not r.renewed and r.authorized_at <= now()-interval '4 days'))
    ) order by r.created_at limit 100`);
  for (const row of roles) await transaction(async (db) => {
    const role = await lockedRole(db, row.id);
    if (role.status !== "active" || !role.authorization_id || !role.authorized_at || !role.expires_at) return;
    const now = (await db.query<{ now: Date }>("select clock_timestamp() as now")).rows[0]!.now;
    if (role.expires_at <= now) {
      await db.query("update owed.roles set status='needs_attention' where id=$1", [role.id]);
      return;
    }
    const pending = await db.query("select id from owed.guarantees where role_id=$1 and status in ('pending','invited') limit 1", [role.id]);
    if (!role.renewed && pending.rowCount && now.getTime() >= role.authorized_at.getTime() + 4 * 86400000) {
      await enqueue(db, role.id, "renew_hold", role.authorization_id, { authorizationId: role.authorization_id });
    }
    const renewing = await db.query("select id from owed.paypal_operations where role_id=$1 and kind='renew_hold' and state not in ('succeeded','rejected')", [role.id]);
    if (renewing.rowCount) return;
    const due = (await db.query<Guarantee>(`select * from owed.guarantees
      where role_id=$1 and status='overdue' for update`, [role.id])).rows;
    for (const g of due) {
      await enqueue(db, role.id, "charge_guarantee", g.id, {
        authorizationId: role.authorization_id, guaranteeId: g.id, amountCents: g.amount_cents, finalCapture: false,
        employerName: role.employer_name,
      });
      await db.query("update owed.guarantees set status='charging' where id=$1", [g.id]);
    }
  });
}

export async function claim(): Promise<Operation | undefined> {
  return transaction(async (db) => {
    const result = await db.query<Operation>(`select o.* from owed.paypal_operations o
      where o.state in ('queued','processing','unknown','pending') and o.next_attempt_at <= now()
        and (o.lease_until is null or o.lease_until < now())
        and not exists (select 1 from owed.paypal_operations older where older.role_id=o.role_id
          and older.kind <> 'payout' and older.state not in ('succeeded','rejected') and (older.created_at,older.id) < (o.created_at,o.id))
      order by o.created_at,o.id for update of o skip locked limit 1`);
    const op = result.rows[0];
    if (!op) return;
    const token = randomUUID();
    const claimed = await db.query<Operation>(`update owed.paypal_operations set state='processing', lease_token=$2,
      lease_until=now()+interval '2 minutes', first_sent_at=coalesce(first_sent_at,now()),
      attempts=attempts+1, updated_at=now() where id=$1 returning *`, [op.id, token]);
    return claimed.rows[0];
  });
}

function requiredString(input: Record<string, unknown>, key: string): string {
  return z.string().min(1).parse(input[key]);
}

export function createProvider(client?: PaypalClient): Provider { return async (op) => {
  const input = op.input;
  const replay = op.attempts > 1;
  const age = Date.now() - (op.first_sent_at?.getTime() ?? Date.now());
  const succeeded = (result: object): Outcome => ({ state: "succeeded", result: { ...result } });
  const pending = (result: object): Outcome => ({ state: "pending", result: { ...result } });
  const manual = (result = op.result ?? {}): Outcome => ({ state: "manual_review", result });
  switch (op.kind) {
    case "create_hold": {
      if (replay && age > 5 * 60000) return manual();
      return succeeded(await createRoleHold(z.object({ roleId: z.string(), amountCents: z.number(), description: z.string(), returnUrl: z.string(), cancelUrl: z.string() }).parse(input), client));
    }
    case "authorize_hold": {
      const orderId = requiredString(input, "orderId");
      const existing = replay ? await getOrderHold(orderId, client) : null;
      if (!existing && replay && age > 5 * 60000) return manual();
      if (!existing && Date.parse(z.iso.datetime({ offset: true }).parse(input.deadline)) <= Date.now()) return manual();
      const result = existing ?? await authorizeRoleHold(orderId, client);
      if (result.payerId !== input.payerId || result.hold.amountCents !== input.amountCents || result.hold.status !== "CREATED" || !result.hold.expiresAt) return manual(result);
      return succeeded(result);
    }
    case "charge_guarantee": {
      const known = op.result?.captureId;
      if (!known && replay) {
        await getHold(requiredString(input, "authorizationId"), client);
        if (age > 5 * 60000) return manual();
      }
      const result = typeof known === "string" ? await getCapture(known, client) : await chargeGuarantee(z.object({
        authorizationId: z.string(), guaranteeId: z.string(), amountCents: z.number(), finalCapture: z.boolean(),
      }).parse(input), client);
      if (result.amountCents !== input.amountCents) return manual(result);
      if (result.status === "COMPLETED") return succeeded(result);
      return result.status === "PENDING" ? pending(result) : manual(result);
    }
    case "payout": {
      if (typeof op.result?.batchId !== "string") {
        if (replay && age > 29 * 86400000) return manual();
        const result = await payCandidate(z.object({ guaranteeId: z.string(), payerId: z.string(), amountCents: z.number(), employerName: z.string() }).parse(input));
        return pending(result);
      }
      const batchId = op.result.batchId;
      const batch = await getPayoutBatch(batchId);
      const item = batch.items.find((item) => item.guaranteeId === input.guaranteeId);
      if (!item) return ["DENIED", "CANCELED"].includes(batch.status) ? manual() : pending({ batchId, status: batch.status });
      if (item.amountCents !== input.amountCents) return manual();
      const result = { batchId, status: item.status, feeCents: item.feeCents };
      if (item.status === "SUCCESS") return succeeded(result);
      if (["PENDING", "UNCLAIMED", "ONHOLD", "BLOCKED"].includes(item.status)) return pending(result);
      return { state: "manual_review", result };
    }
    case "release_hold": {
      const authorizationId = requiredString(input, "authorizationId");
      const hold = await getHold(authorizationId, client);
      if (["VOIDED", "CAPTURED", "EXPIRED"].includes(hold.status)) return succeeded(hold);
      if (replay && age > 5 * 60000) return manual();
      const released = await releaseHold({ authorizationId, roleId: requiredString(input, "roleId") }, client);
      return ["VOIDED", "CAPTURED", "EXPIRED"].includes(released.status) ? succeeded(released) : pending(released);
    }
    case "renew_hold": {
      if (replay) {
        await getHold(requiredString(input, "authorizationId"), client);
        if (age > 5 * 60000) return manual();
      }
      const hold = await renewHold(requiredString(input, "authorizationId"), client);
      return hold.status === "CREATED" && hold.expiresAt ? succeeded(hold) : manual();
    }
    default: throw new Error("Unsupported PayPal operation.");
  }
}; }

export const paypalProvider = createProvider();

export async function finish(op: Operation, outcome: Outcome): Promise<void> {
  await transaction(async (db) => {
    const role = await lockedRole(db, op.role_id);
    const current = await db.query(`select id from owed.paypal_operations where id=$1 and lease_token=$2 and state='processing' for update`, [op.id, op.lease_token]);
    if (!current.rowCount) return;
    const result = outcome.result;
    await db.query(`update owed.paypal_operations set state=$3,result=$4,lease_until=null,
      next_attempt_at=now()+interval '1 minute',updated_at=now() where id=$1 and lease_token=$2`,
    [op.id, op.lease_token, outcome.state, JSON.stringify(result)]);
    if (outcome.state === "manual_review") {
      if (op.kind === "charge_guarantee" || op.kind === "payout") await db.query("update owed.guarantees set status='needs_attention' where id=$1", [op.business_key]);
      else await db.query("update owed.roles set status='needs_attention' where id=$1", [op.role_id]);
      return;
    }
    if (op.kind === "payout") {
      await db.query(`update owed.guarantees set payout_batch_id=$2,payout_status=$3,status=$4 where id=$1`,
      [op.business_key, result.batchId, result.status, outcome.state === "succeeded" ? "paid" : result.status === "UNCLAIMED" ? "unclaimed" : "paying"]);
      if (outcome.state === "succeeded") {
        await db.query(`insert into owed.notifications (recipient_id,guarantee_id,kind,message)
          select candidate_id, id, 'paid', 'No status arrived by the deadline, so Owed paid your guarantee of $'
            || to_char(amount_cents / 100.0, 'FM999,999,999,990.00') || ' through PayPal.'
          from owed.guarantees where id=$1 and candidate_id is not null on conflict do nothing`, [op.business_key]);
      }
    }
    if (outcome.state !== "succeeded") return;
    switch (op.kind) {
      case "create_hold":
        await db.query("update owed.roles set order_id=$2,approve_url=$3,status='approval_pending' where id=$1", [role.id, result.orderId, result.approveUrl]);
        break;
      case "authorize_hold": {
        const hold = z.object({ authorizationId: z.string(), expiresAt: z.iso.datetime({ offset: true }), amountCents: z.number() }).parse(result.hold);
        const now = (await db.query<{ now: Date }>("select clock_timestamp() as now")).rows[0]!.now;
        const usable = role.deadline > now && role.deadline.getTime() <= Date.parse(hold.expiresAt) - 86400000;
        await db.query(`update owed.roles set authorization_id=$2,expires_at=$3,authorized_at=now(),status=$4 where id=$1`, [role.id, hold.authorizationId, hold.expiresAt, usable ? "active" : "closing"]);
        if (!usable) await enqueue(db, role.id, "release_hold", hold.authorizationId, { roleId: role.id, authorizationId: hold.authorizationId });
        break;
      }
      case "charge_guarantee": {
        if (role.authorization_id !== op.input.authorizationId || role.charged_cents + Number(op.input.amountCents) > role.hold_cents) throw new Error("PayPal capture does not match the funded role.");
        await db.query("update owed.roles set charged_cents=charged_cents+$2 where id=$1", [role.id, op.input.amountCents]);
        await db.query("update owed.guarantees set capture_id=$2,status=case when candidate_id is null then 'awaiting_account' else 'paying' end where id=$1", [op.business_key, result.captureId]);
        const candidate = (await db.query<{ payer_id: string }>(`select c.payer_id from owed.candidates c
          join owed.guarantees g on g.candidate_id=c.id where g.id=$1 and c.verified`, [op.business_key])).rows[0];
        if (candidate) await enqueue(db, role.id, "payout", op.business_key, { guaranteeId: op.business_key, payerId: candidate.payer_id, amountCents: op.input.amountCents, employerName: op.input.employerName });
        else await db.query("update owed.guarantees set status='needs_attention' where id=$1 and candidate_id is not null", [op.business_key]);
        break;
      }
      case "release_hold":
        await db.query("update owed.roles set status='closed' where id=$1", [role.id]);
        break;
      case "renew_hold":
        await db.query("update owed.roles set authorization_id=$2,expires_at=$3,renewed=true where id=$1", [role.id, result.authorizationId, result.expiresAt]);
        break;
    }
  });
}

export async function preflight(op: Operation): Promise<boolean> {
  return transaction(async (db) => {
    const role = await lockedRole(db, op.role_id);
    const input = op.input;
    switch (op.kind) {
      case "create_hold": return role.status === "draft" && input.roleId === role.id && input.amountCents === role.hold_cents;
      case "authorize_hold": {
        const owner = (await db.query<{ payer_id: string }>("select payer_id from owed.candidates where id=$1", [role.employer_id])).rows[0];
        const now = (await db.query<{ now: Date }>("select clock_timestamp() as now")).rows[0]!.now;
        return role.status === "approval_pending" && input.orderId === role.order_id && input.payerId === owner?.payer_id && input.amountCents === role.hold_cents
          && input.deadline === role.deadline.toISOString() && (role.deadline > now || op.attempts > 1);
      }
      case "renew_hold": return role.status === "active" && !role.renewed && input.authorizationId === role.authorization_id;
      case "release_hold": return role.status === "closing" && input.authorizationId === role.authorization_id;
      case "charge_guarantee": {
        const g = (await db.query<Guarantee>("select * from owed.guarantees where id=$1 and role_id=$2", [op.business_key, role.id])).rows[0];
        return role.status === "active" && input.authorizationId === role.authorization_id && !!g && g.status === "charging"
          && input.guaranteeId === g.id && input.amountCents === g.amount_cents && input.finalCapture === false
          && role.charged_cents + g.amount_cents <= role.hold_cents;
      }
      case "payout": {
        const g = (await db.query<Guarantee & { payer_id: string; verified: boolean; payout_batch_id: string | null }>(`select g.*,c.payer_id,c.verified from owed.guarantees g
          join owed.candidates c on c.id=g.candidate_id where g.id=$1 and g.role_id=$2`, [op.business_key, role.id])).rows[0];
        return !!g && !!g.capture_id && ["paying", "unclaimed"].includes(g.status)
          && (op.result?.batchId === undefined ? g.verified : typeof op.result.batchId === "string" && op.result.batchId === g.payout_batch_id)
          && input.guaranteeId === g.id && input.payerId === g.payer_id && input.amountCents === g.amount_cents;
      }
      default: return false;
    }
  });
}

export async function runWorker(limit = 10, provider: Provider = paypalProvider): Promise<number> {
  await schedule();
  let count = 0;
  while (count < limit) {
    const op = await claim();
    if (!op) break;
    try {
      const valid = await preflight(op);
      await finish(op, valid ? await provider(op) : { state: "manual_review", result: op.result ?? {} });
    } catch (error) {
      const failure = translatePayPalFailure(error, { write: true });
      const notSent = failure.kind === "credentials" && !failure.sent;
      const state = notSent ? "queued" : failure.kind === "rejected" ? "rejected" : failure.kind === "integration_defect" ? "manual_review" : "unknown";
      await query(`update owed.paypal_operations set state=$3,failure=$4,lease_until=null,
        next_attempt_at=now()+interval '1 minute',updated_at=now() where id=$1 and lease_token=$2 and state='processing'`,
      [op.id, op.lease_token, state, JSON.stringify(failure)]);
      if (notSent) await query("update owed.paypal_operations set attempts=0,first_sent_at=null where id=$1 and lease_token=$2 and state='queued'", [op.id, op.lease_token]);
      if (state === "rejected" || state === "manual_review") {
        await query("update owed.roles set status='needs_attention' where id=$1", [op.role_id]);
      }
    }
    count++;
  }
  return count;
}

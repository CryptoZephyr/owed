import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { database, query, transaction } from "../src/lib/owed/db";
import type { Actor, Guarantee, Role } from "../src/lib/owed/domain";
import { acceptInvite, approveRole, closeGuarantee, closeRole, createRole, enqueue, flagGuarantee, fundRole, inviteCandidate } from "../src/lib/owed/roles";
import { claim, finish, preflight, runWorker, schedule } from "../src/lib/owed/worker";
import type { Provider } from "../src/lib/owed/worker";
import { newLoginState, consumeLoginState } from "../src/lib/owed/auth";
import { PayPalRestConnectionError } from "../src/lib/paypal/rest";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/owed_test");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/owed_test") throw new Error("Database tests require a dedicated localhost owed_test database.");
process.env.DATABASE_URL = url.href;
let employer: Actor;
let candidate: Actor;
const deadline = () => new Date(Date.now() + 2 * 86400000).toISOString();

async function person(): Promise<Actor> {
  const id = randomUUID();
  return (await query<Actor>(`insert into owed.candidates (id,paypal_user_id,payer_id,name,verified)
    values ($1::uuid,$1::text,$1::text,'Test member',true) returning *`, [id]))[0]!;
}

async function role(capacity = 1): Promise<string> {
  const id = await createRole(employer, { title: "Engineer", employerName: "Example", guaranteeCents: 1000, capacity, deadline: deadline() });
  await query(`update owed.roles set status='active',authorization_id=$2,order_id=$3,authorized_at=now(),expires_at=now()+interval '29 days' where id=$1`, [id, `auth-${id}`, `order-${id}`]);
  return id;
}

async function due(id: string): Promise<void> {
  await query("update owed.guarantees set deadline=now()-interval '1 second' where role_id=$1", [id]);
}

const provider: Provider = async (op) => {
  switch (op.kind) {
    case "create_hold": return { state: "succeeded", result: { orderId: `order-${op.role_id}`, approveUrl: "https://www.sandbox.paypal.com/checkoutnow?token=test" } };
    case "authorize_hold": return { state: "succeeded", result: { hold: { authorizationId: `auth-${op.role_id}`, amountCents: op.input.amountCents, expiresAt: new Date(Date.now() + 29 * 86400000).toISOString() } } };
    case "charge_guarantee": return { state: "succeeded", result: { captureId: `capture-${op.business_key}`, amountCents: op.input.amountCents, status: "COMPLETED" } };
    case "payout": return { state: "succeeded", result: { batchId: `batch-${op.business_key}`, status: "SUCCESS" } };
    case "release_hold": return { state: "succeeded", result: { status: "VOIDED" } };
    case "renew_hold": return { state: "succeeded", result: { authorizationId: `renewed-${op.role_id}`, expiresAt: new Date(Date.now() + 29 * 86400000).toISOString() } };
    default: throw new Error("Unknown operation in fixture");
  }
};

before(async () => {
  await query("drop schema if exists owed cascade");
  await query(await readFile(new URL("../supabase/migrations/202610190001_owed.sql", import.meta.url), "utf8"));
});
beforeEach(async () => {
  await query("truncate owed.candidates,owed.roles,owed.guarantees,owed.paypal_operations,owed.sessions,owed.login_states,owed.notifications cascade");
  employer = await person(); candidate = await person();
});
after(async () => { await database().end(); });

test("duplicate funding requests persist one operation and require the exact stored order", async () => {
  const id = await createRole(employer, { title: "Engineer", employerName: "Example", guaranteeCents: 1000, capacity: 1, deadline: deadline() });
  await Promise.all(Array.from({ length: 8 }, () => fundRole(employer, id, "https://owed.example")));
  assert.equal((await query("select id from owed.paypal_operations")).length, 1);
  await runWorker(10, provider);
  await assert.rejects(approveRole(employer, id, "wrong-order"), /does not match/);
  await approveRole(employer, id, `order-${id}`);
  await runWorker(10, provider);
  assert.equal((await query<Role>("select * from owed.roles where id=$1", [id]))[0]?.status, "active");
});

test("unique kind/business_key rejects direct duplicates with PostgreSQL 23505", async () => {
  const id = await role();
  await transaction((db) => enqueue(db, id, "payout", "key", {}));
  await assert.rejects(query("insert into owed.paypal_operations (role_id,kind,business_key,input) values ($1,'payout','key','{}')", [id]), (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "23505");
});

test("expired PayPal approvals cannot enqueue a new authorization", async () => {
  const id = await createRole(employer, { title: "Engineer", employerName: "Example", guaranteeCents: 1000, capacity: 1, deadline: deadline() });
  await fundRole(employer, id, "https://owed.example");
  await runWorker(1, provider);
  await query("update owed.roles set deadline=now()-interval '1 second' where id=$1", [id]);
  await assert.rejects(approveRole(employer, id, `order-${id}`), /future deadline/);
  assert.equal((await query("select id from owed.paypal_operations where kind='authorize_hold'")).length, 0);
});

test("an authorization queued before a deadline cannot be sent after it expires", async () => {
  const id = await role();
  await query("update owed.roles set status='approval_pending',authorization_id=null,deadline=now()-interval '1 second' where id=$1", [id]);
  const r = (await query<Role>("select * from owed.roles where id=$1", [id]))[0]!;
  await transaction((db) => enqueue(db, id, "authorize_hold", r.order_id!, { orderId: r.order_id, payerId: employer.payer_id, amountCents: r.hold_cents, deadline: r.deadline.toISOString() }));
  let calls = 0;
  await runWorker(1, async (op) => { calls++; return provider(op); });
  assert.equal(calls, 0);
  assert.equal((await query<Role>("select * from owed.roles where id=$1", [id]))[0]?.status, "needs_attention");
});

test("an unknown authorization can still reconcile after the deadline and queues release", async () => {
  const id = await role();
  await query("update owed.roles set status='approval_pending',authorization_id=null,deadline=now()-interval '1 second' where id=$1", [id]);
  const r = (await query<Role>("select * from owed.roles where id=$1", [id]))[0]!;
  await transaction((db) => enqueue(db, id, "authorize_hold", r.order_id!, { orderId: r.order_id, payerId: employer.payer_id, amountCents: r.hold_cents, deadline: r.deadline.toISOString() }));
  await query("update owed.paypal_operations set state='unknown',attempts=1 where kind='authorize_hold'");
  const op = (await claim())!;
  assert.equal(await preflight(op), true);
  await finish(op, await provider(op));
  assert.equal((await query<Role>("select * from owed.roles where id=$1", [id]))[0]?.status, "closing");
  assert.equal((await query("select id from owed.paypal_operations where kind='release_hold'")).length, 1);
});

for (const reason of ["elapsed deadline", "insufficient authorization lifetime"]) {
  test(`authorization finishing with ${reason} releases the original hold without activating the role`, async () => {
    const id = await createRole(employer, { title: "Engineer", employerName: "Example", guaranteeCents: 1000, capacity: 1, deadline: deadline() });
    await fundRole(employer, id, "https://owed.example");
    await runWorker(1, provider);
    await approveRole(employer, id, `order-${id}`);
    const op = (await claim())!;
    assert.equal(await preflight(op), true);
    const outcome = await provider(op);
    if (reason === "elapsed deadline") await query("update owed.roles set deadline=now()-interval '1 second' where id=$1", [id]);
    else outcome.result.hold = { authorizationId: `auth-${id}`, amountCents: 1000, expiresAt: new Date(Date.now() + 86400000).toISOString() };
    await finish(op, outcome);
    const r = (await query<Role>("select * from owed.roles where id=$1", [id]))[0]!;
    assert.equal(r.status, "closing");
    assert.equal(r.authorization_id, `auth-${id}`);
    const release = (await query<{ business_key: string }>("select business_key from owed.paypal_operations where kind='release_hold'"))[0]!;
    assert.equal(release.business_key, r.authorization_id);
    await runWorker(1, provider);
    assert.equal((await query<Role>("select * from owed.roles where id=$1", [id]))[0]?.status, "closed");
  });
}

test("a saved payout keeps reconciling after verification is lost without submitting again", async () => {
  const id = await role();
  const token = await inviteCandidate(employer, id, "Candidate");
  await acceptInvite(candidate, token);
  await due(id);
  await runWorker(1, provider);
  let submissions = 0;
  let reads = 0;
  const pendingProvider: Provider = async (op) => {
    if (!op.result?.batchId) {
      submissions++;
      return { state: "pending", result: { batchId: "saved-batch", status: "PENDING" } };
    }
    reads++;
    assert.equal(op.result.batchId, "saved-batch");
    assert.equal(op.input.payerId, candidate.payer_id);
    return { state: "succeeded", result: { batchId: "saved-batch", status: "SUCCESS" } };
  };
  await runWorker(1, pendingProvider);
  await query("update owed.candidates set verified=false where id=$1", [candidate.id]);
  await query("update owed.paypal_operations set next_attempt_at=now() where kind='payout'");
  const op = (await claim())!;
  assert.equal(await preflight({ ...op, result: { batchId: "other-batch" } }), false);
  assert.equal(await preflight({ ...op, input: { ...op.input, payerId: employer.payer_id } }), false);
  assert.equal(await preflight(op), true);
  await finish(op, await pendingProvider(op));
  assert.equal(submissions, 1);
  assert.equal(reads, 1);
  assert.equal((await query<Guarantee>("select * from owed.guarantees"))[0]?.status, "paid");
});

test("loss of verification still blocks the first payout submission", async () => {
  const id = await role();
  const token = await inviteCandidate(employer, id, "Candidate");
  await acceptInvite(candidate, token);
  await due(id);
  await runWorker(1, provider);
  await query("update owed.candidates set verified=false where id=$1", [candidate.id]);
  let calls = 0;
  await runWorker(1, async (op) => { calls++; return provider(op); });
  assert.equal(calls, 0);
  assert.equal((await query<Guarantee>("select * from owed.guarantees"))[0]?.status, "needs_attention");
});

test("simultaneous workers claim once, stale completion cannot overwrite a new lease", async () => {
  const id = await role();
  await transaction((db) => enqueue(db, id, "renew_hold", id, { authorizationId: `auth-${id}` }));
  const claims = (await Promise.all(Array.from({ length: 8 }, () => claim()))).filter((op) => !!op);
  assert.equal(claims.length, 1);
  const old = claims[0]!;
  await query("update owed.paypal_operations set lease_until=now()-interval '1 second' where id=$1", [old.id]);
  const next = (await claim())!;
  assert.notEqual(old.lease_token, next.lease_token);
  await finish(old, await provider(old));
  assert.equal((await query("select id from owed.paypal_operations where state='succeeded'")).length, 0);
  await finish(next, await provider(next));
  assert.equal((await query<Role>("select * from owed.roles where id=$1", [id]))[0]?.renewed, true);
});

test("capacity is transactional and ownership checks protect all employer changes", async () => {
  const id = await role();
  const attempts = await Promise.allSettled([inviteCandidate(employer, id, "One"), inviteCandidate(employer, id, "Two")]);
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  await assert.rejects(inviteCandidate(candidate, id, "Intruder"), /not found/);
  const g = (await query<Guarantee>("select * from owed.guarantees"))[0]!;
  await assert.rejects(closeGuarantee(candidate, g.id, { status: "not_moving_forward" }), /not found/);
  await assert.rejects(flagGuarantee(employer, g.id), /not found/);
});

test("one verified account claims an invite, and another account cannot replace its payer", async () => {
  const id = await role();
  const token = await inviteCandidate(employer, id, "Candidate");
  await assert.rejects(acceptInvite(employer, token), /own guarantee/);
  await assert.rejects(acceptInvite({ ...candidate, verified: false }, token), /verified/);
  await acceptInvite(candidate, token);
  await acceptInvite(candidate, token);
  await assert.rejects(acceptInvite(await person(), token), /already been claimed/);
  assert.equal((await query<Guarantee>("select * from owed.guarantees"))[0]?.candidate_id, candidate.id);
});

test("deadline charges once, pays the connected candidate once, releases the remaining hold", async () => {
  const id = await role(2);
  const token = await inviteCandidate(employer, id, "Candidate");
  await acceptInvite(candidate, token);
  await due(id);
  await runWorker(10, provider);
  await runWorker(10, provider);
  const g = (await query<Guarantee>("select * from owed.guarantees"))[0]!;
  assert.equal(g.status, "paid");
  const r = (await query<Role>("select * from owed.roles where id=$1", [id]))[0]!;
  assert.equal(r.charged_cents, 1000);
  assert.equal(r.hold_cents, 2000);
  const payout = (await query<{ input: { payerId: string } }>("select input from owed.paypal_operations where kind='payout'"))[0]!;
  assert.equal(payout.input.payerId, candidate.payer_id);
  await closeRole(employer, id);
  await runWorker(10, provider);
  assert.equal((await query<Role>("select * from owed.roles where id=$1", [id]))[0]?.status, "closed");
});

test("a disconnected candidate's deadline is funded, then paid when they connect", async () => {
  const id = await role();
  const token = await inviteCandidate(employer, id, "Candidate");
  await due(id);
  await runWorker(10, provider);
  assert.equal((await query<Guarantee>("select * from owed.guarantees"))[0]?.status, "awaiting_account");
  assert.equal((await query("select id from owed.paypal_operations where kind='payout'")).length, 0);
  await acceptInvite(candidate, token);
  await runWorker(10, provider);
  assert.equal((await query<Guarantee>("select * from owed.guarantees"))[0]?.status, "paid");
});

test("closure before the deadline releases eligibility, late closure cannot erase a payment", async () => {
  const id = await role(2);
  await inviteCandidate(employer, id, "Early");
  await inviteCandidate(employer, id, "Late");
  const guarantees = await query<Guarantee>("select * from owed.guarantees order by created_at,id");
  await closeGuarantee(employer, guarantees[0]!.id, { status: "not_moving_forward", message: "Ignored custom rejection reasons" });
  await due(id);
  await assert.rejects(closeGuarantee(employer, guarantees[1]!.id, { status: "moving_forward" }), /deadline has passed/);
  await runWorker(10, provider);
  assert.equal((await query<Guarantee>("select * from owed.guarantees where id=$1", [guarantees[0]!.id]))[0]?.closure_message, "Thank you for your time. We are not moving forward with your application.");
  assert.equal((await query<Role>("select * from owed.roles where id=$1", [id]))[0]?.charged_cents, 1000);
});

test("extensions are once-only, must move forward and must fit inside the PayPal authorization", async () => {
  const id = await role();
  await inviteCandidate(employer, id, "Candidate");
  const g = (await query<Guarantee>("select * from owed.guarantees"))[0]!;
  await assert.rejects(closeGuarantee(employer, g.id, { status: "still_deciding", newDeadline: new Date(Date.now() + 86400000).toISOString() }), /after the existing/);
  await closeGuarantee(employer, g.id, { status: "still_deciding", newDeadline: new Date(Date.now() + 3 * 86400000).toISOString() });
  await assert.rejects(closeGuarantee(employer, g.id, { status: "still_deciding", newDeadline: new Date(Date.now() + 4 * 86400000).toISOString() }), /once/);
});

test("nudge ticks deduplicate notifications and session state is consumed once", async () => {
  const id = await role();
  await inviteCandidate(employer, id, "Candidate");
  await query("update owed.guarantees set deadline=now()+interval '1 hour'");
  await query("select owed.tick()"); await query("select owed.tick()");
  assert.equal((await query("select id from owed.notifications where kind='deadline_nudge'")).length, 1);
  const state = await newLoginState("/candidate");
  assert.equal(await consumeLoginState(state), "/candidate");
  assert.equal(await consumeLoginState(state), null);
});

test("ambiguous writes stay unknown with the same immutable business input", async () => {
  const id = await role();
  await inviteCandidate(employer, id, "Candidate");
  await due(id);
  let sends = 0;
  await runWorker(1, async () => { sends++; throw new PayPalRestConnectionError(null); });
  const op = (await query<{ state: string; business_key: string; input: unknown }>("select * from owed.paypal_operations where kind='charge_guarantee'"))[0]!;
  assert.equal(op.state, "unknown");
  await runWorker(10, provider);
  assert.equal(sends, 1);
  assert.equal((await query("select id from owed.paypal_operations where kind='payout'")).length, 0);
  await assert.rejects(closeRole(employer, id), /settle owed payments/);
});

test("mismatched authorization, budget and payout recipient are stopped before the provider", async () => {
  const id = await role();
  const token = await inviteCandidate(employer, id, "Candidate");
  await acceptInvite(candidate, token);
  await due(id); await schedule();
  const op = (await claim())!;
  assert.equal(await preflight(op), true);
  assert.equal(await preflight({ ...op, input: { ...op.input, authorizationId: "other-role" } }), false);
  assert.equal(await preflight({ ...op, input: { ...op.input, amountCents: 100000 } }), false);
  await finish(op, await provider(op));
  const payout = (await claim())!;
  assert.equal(await preflight(payout), true);
  assert.equal(await preflight({ ...payout, input: { ...payout.input, payerId: employer.payer_id } }), false);
});

test("Supabase-facing tables have RLS enabled and no public schema privileges", async () => {
  const tables = await query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='owed' and c.relkind='r'");
  assert.equal(tables.length, 7);
  assert.equal(tables.every((table) => table.relrowsecurity), true);
  const grants = await query("select 1 from pg_namespace n,aclexplode(n.nspacl) a where n.nspname='owed' and a.grantee=0");
  assert.equal(grants.length, 0);
});

for (const kind of ["create_hold", "authorize_hold", "charge_guarantee", "payout", "release_hold", "renew_hold"]) {
  test(`${kind}: lost connection preserves the claim and retry settles it once`, async () => {
    let id: string;
    if (["create_hold", "authorize_hold"].includes(kind)) {
      id = await createRole(employer, { title: "Engineer", employerName: "Example", guaranteeCents: 1000, capacity: 1, deadline: deadline() });
      await fundRole(employer, id, "https://owed.example");
      if (kind === "authorize_hold") { await runWorker(1, provider); await approveRole(employer, id, `order-${id}`); }
    } else {
      id = await role();
      if (kind === "release_hold") await closeRole(employer, id);
      else {
        const token = await inviteCandidate(employer, id, "Candidate");
        await acceptInvite(candidate, token);
        if (kind === "renew_hold") await query("update owed.roles set authorized_at=now()-interval '5 days' where id=$1", [id]);
        else { await due(id); if (kind === "payout") await runWorker(1, provider); }
      }
    }
    await runWorker(1, async () => { throw new PayPalRestConnectionError(null); });
    const op = (await query<{ id: string; input: unknown; state: string; attempts: number }>("select * from owed.paypal_operations where kind=$1", [kind]))[0]!;
    assert.equal(op.state, "unknown");
    await query("update owed.paypal_operations set next_attempt_at=now() where id=$1", [op.id]);
    await runWorker(1, provider);
    const settled = (await query<{ id: string; input: unknown; state: string; attempts: number }>("select * from owed.paypal_operations where id=$1", [op.id]))[0]!;
    assert.equal(settled.state, "succeeded");
    assert.equal(settled.attempts, 2);
    assert.deepEqual(settled.input, op.input);
  });
}

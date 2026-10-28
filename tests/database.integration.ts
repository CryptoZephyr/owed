import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { database, query, transaction } from "../src/lib/owed/db";
import type { Actor, Guarantee, Role } from "../src/lib/owed/domain";
import { acceptInvite, approveRole, closeGuarantee, closeRole, closureContext, closureDraft, correctInvitationEmail, createRole, enqueue, flagGuarantee, fundRole, hashToken, inviteCandidate, invitationDetails, storeClosureDraft } from "../src/lib/owed/roles";
import { claim, finish, preflight, runWorker, schedule } from "../src/lib/owed/worker";
import type { Provider } from "../src/lib/owed/worker";
import { newLoginState, consumeLoginState } from "../src/lib/owed/auth";
import { PayPalRestConnectionError } from "../src/lib/paypal/rest";
import { sendEmails } from "../src/lib/owed/email";
import type { Mail, Mailer } from "../src/lib/owed/email";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/owed_test");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/owed_test") throw new Error("Database tests require a dedicated localhost owed_test database.");
process.env.DATABASE_URL = url.href;
let employer: Actor;
let candidate: Actor;
const deadline = () => new Date(Date.now() + 2 * 86400000).toISOString();

async function person(): Promise<Actor> {
  const id = randomUUID();
  return (await query<Actor>(`insert into owed.candidates (id,paypal_user_id,payer_id,name,email,verified,email_verified)
    values ($1::uuid,$1::text,$1::text,'Test member',$2,true,true) returning *`, [id, `${id}@example.test`]))[0]!;
}

async function personWithEmail(email: string): Promise<Actor> {
  const member = await person();
  await query("update owed.candidates set email=$2 where id=$1", [member.id, email]);
  return { ...member, email };
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
  await query(await readFile(new URL("../supabase/migrations/202610190002_invitation_identity.sql", import.meta.url), "utf8"));
  await query(await readFile(new URL("../supabase/migrations/202610200001_email_outbox.sql", import.meta.url), "utf8"));
  await query(await readFile(new URL("../supabase/migrations/202610200002_closure_drafts.sql", import.meta.url), "utf8"));
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
  const token = await inviteCandidate(employer, id, "Candidate", candidate.email!);
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
  const token = await inviteCandidate(employer, id, "Candidate", candidate.email!);
  await acceptInvite(candidate, token);
  await due(id);
  await runWorker(1, provider);
  await query("update owed.candidates set verified=false where id=$1", [candidate.id]);
  let calls = 0;
  await runWorker(1, async (op) => { calls++; return provider(op); });
  assert.equal(calls, 0);
  assert.equal((await query<Guarantee>("select * from owed.guarantees"))[0]?.status, "needs_attention");
});

test("only the intended email-verified PayPal account can view or claim an invitation", async () => {
  const id = await role();
  const token = await inviteCandidate(employer, id, "Candidate", ` ${candidate.email!.toUpperCase()} `);
  const stranger = await person();
  assert.equal(await invitationDetails(null, token), null);
  assert.equal(await invitationDetails(stranger, token), null);
  assert.equal(await invitationDetails(employer, token), null);
  await assert.rejects(acceptInvite(stranger, token), /intended/);
  assert.equal((await query<Guarantee>("select * from owed.guarantees"))[0]?.candidate_id, null);
  const detail = await invitationDetails(candidate, token);
  assert.equal(detail?.employer_name, "Example");
  assert.equal(detail?.amount_cents, 1000);
  await query("update owed.candidates set email_verified=false where id=$1", [candidate.id]);
  assert.equal(await invitationDetails(candidate, token), null);
  await assert.rejects(acceptInvite(candidate, token), /email/);
  await query("update owed.candidates set email_verified=true,verified=false where id=$1", [candidate.id]);
  assert.equal(await invitationDetails(candidate, token), null);
  await query("update owed.candidates set verified=true where id=$1", [candidate.id]);
  await acceptInvite(candidate, token);
  await query("update owed.candidates set email=$2,email_verified=false where id=$1", [candidate.id, "new@example.test"]);
  assert.equal((await invitationDetails(candidate, token))?.employer_name, "Example");
  assert.equal(await invitationDetails(stranger, token), null);
  await assert.rejects(acceptInvite(stranger, token), /claimed/);
});

test("missing intended identity fails closed, and invalid or duplicate addresses cannot consume a place", async () => {
  const id = await role(2);
  await assert.rejects(inviteCandidate(employer, id, "Candidate", "bad address"), /email/);
  assert.equal((await query("select * from owed.guarantees")).length, 0);
  const token = await inviteCandidate(employer, id, "Candidate", candidate.email!);
  await assert.rejects(inviteCandidate(employer, id, "Another", candidate.email!.toUpperCase()), /already invited/);
  const legacy = (await query<Guarantee>("select * from owed.guarantees"))[0]!;
  await query("update owed.guarantees set intended_email=null where id=$1", [legacy.id]);
  assert.equal(await invitationDetails(candidate, token), null);
  await assert.rejects(acceptInvite(candidate, token), /intended/);
});

test("correcting an unclaimed address rotates its link without reallocating or charging the guarantee", async () => {
  const id = await role();
  const wrong = await person();
  const oldToken = await inviteCandidate(employer, id, "Candidate", wrong.email!);
  const original = (await query<Guarantee>("select * from owed.guarantees"))[0]!;
  assert.equal((await invitationDetails(wrong, oldToken))?.amount_cents, 1000);
  const replacement = await correctInvitationEmail(employer, original.id, wrong.email!, ` ${candidate.email!.toUpperCase()} `);
  assert.equal(replacement.roleId, id);
  assert.notEqual(replacement.token, oldToken);
  assert.equal(await invitationDetails(wrong, oldToken), null);
  await assert.rejects(acceptInvite(wrong, oldToken), /not found/);
  assert.equal(await invitationDetails(wrong, replacement.token), null);
  assert.equal((await invitationDetails(candidate, replacement.token))?.amount_cents, 1000);
  const [updated] = await query<Guarantee>("select * from owed.guarantees");
  assert.equal(updated?.id, original.id);
  assert.equal(updated?.role_id, id);
  assert.equal(updated?.amount_cents, original.amount_cents);
  assert.equal(updated?.deadline.toISOString(), original.deadline.toISOString());
  assert.equal(updated?.candidate_label, original.candidate_label);
  assert.equal((await query("select * from owed.guarantees")).length, 1);
  assert.equal((await query("select * from owed.paypal_operations")).length, 0);
  await acceptInvite(candidate, replacement.token);
  await due(id);
  await runWorker(10, provider);
  const payout = (await query<{ input: { payerId: string } }>("select input from owed.paypal_operations where kind='payout'"))[0]!;
  assert.equal(payout.input.payerId, candidate.payer_id);
});

test("email correction refuses strangers, stale forms, duplicate addresses, claims and expired guarantees", async () => {
  const id = await role(2);
  const other = await person();
  const token = await inviteCandidate(employer, id, "Candidate", candidate.email!);
  await inviteCandidate(employer, id, "Other", other.email!);
  const original = (await query<Guarantee>("select * from owed.guarantees where intended_email=$1", [candidate.email]))[0]!;
  await assert.rejects(correctInvitationEmail(other, original.id, candidate.email!, "changed@example.test"), /not found/);
  await assert.rejects(correctInvitationEmail(employer, original.id, candidate.email!, "invalid email"), /email/);
  await assert.rejects(correctInvitationEmail(employer, original.id, candidate.email!, other.email!.toUpperCase()), /already invited/);
  await assert.rejects(correctInvitationEmail(employer, original.id, candidate.email!, candidate.email!), /different/);
  const replacement = await correctInvitationEmail(employer, original.id, candidate.email!, "changed@example.test");
  await assert.rejects(correctInvitationEmail(employer, original.id, candidate.email!, other.email!), /changed/);
  const newCandidate = await personWithEmail("changed@example.test");
  assert.ok(await invitationDetails(newCandidate, replacement.token));
  assert.equal(await invitationDetails(candidate, token), null);
  await acceptInvite(newCandidate, replacement.token);
  await assert.rejects(correctInvitationEmail(employer, original.id, "changed@example.test", "another@example.test"), /unclaimed/);
  const unclaimed = (await query<Guarantee>("select * from owed.guarantees where intended_email=$1", [other.email]))[0]!;
  await due(id);
  await assert.rejects(correctInvitationEmail(employer, unclaimed.id, other.email!, "later@example.test"), /deadline/);
  await query("update owed.guarantees set status='charging' where id=$1", [unclaimed.id]);
  await assert.rejects(correctInvitationEmail(employer, unclaimed.id, other.email!, "later@example.test"), /unclaimed/);
  assert.equal((await query<Guarantee>("select * from owed.guarantees where id=$1", [unclaimed.id]))[0]?.intended_email, other.email);
});

test("an in-flight claim cannot use the old link after its hash is replaced", async () => {
  const id = await role();
  const wrong = await person();
  const oldToken = await inviteCandidate(employer, id, "Candidate", wrong.email!);
  const original = (await query<Guarantee>("select * from owed.guarantees"))[0]!;
  let claimAttempt!: Promise<void>;
  await transaction(async (db) => {
    await db.query("select id from owed.roles where id=$1 for update", [id]);
    claimAttempt = acceptInvite(wrong, oldToken);
    let blocked = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const [state] = await query<{ waiting: boolean }>(`select exists(select 1 from pg_stat_activity
        where datname=current_database() and wait_event_type='Lock'
          and query like 'select * from owed.roles where id = $1 for update%') as waiting`);
      if (state?.waiting) { blocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(blocked, true, "The claim must have read the old hash before the invitation changes.");
    await db.query("update owed.guarantees set invite_hash=$2,intended_email=$3 where id=$1",
      [original.id, hashToken(randomBytes(32).toString("base64url")), candidate.email]);
  });
  await assert.rejects(claimAttempt, /Invitation not found/);
  assert.equal((await query<Guarantee>("select * from owed.guarantees where id=$1", [original.id]))[0]?.candidate_id, null);
});

test("a legacy unclaimed invitation without an intended email can be reissued before its deadline", async () => {
  const id = await role();
  const oldToken = await inviteCandidate(employer, id, "Candidate", candidate.email!);
  const original = (await query<Guarantee>("select * from owed.guarantees"))[0]!;
  await query("update owed.guarantees set intended_email=null where id=$1", [original.id]);
  assert.equal(await invitationDetails(candidate, oldToken), null);
  const replacement = await correctInvitationEmail(employer, original.id, "", candidate.email!);
  assert.equal(await invitationDetails(candidate, oldToken), null);
  assert.ok(await invitationDetails(candidate, replacement.token));
  await acceptInvite(candidate, replacement.token);
  assert.equal((await query<Guarantee>("select * from owed.guarantees"))[0]?.candidate_id, candidate.id);
});

test("correction cannot issue a new link against an expired hold", async () => {
  const id = await role();
  const token = await inviteCandidate(employer, id, "Candidate", candidate.email!);
  const original = (await query<Guarantee>("select * from owed.guarantees"))[0]!;
  await query("update owed.roles set expires_at=now()-interval '1 second' where id=$1", [id]);
  await assert.rejects(correctInvitationEmail(employer, original.id, candidate.email!, "changed@example.test"), /hold has expired/);
  assert.equal((await query<Guarantee>("select * from owed.guarantees"))[0]?.invite_hash, hashToken(token));
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
  const attempts = await Promise.allSettled([inviteCandidate(employer, id, "One", candidate.email!), inviteCandidate(employer, id, "Two", `${candidate.email!.replace("@", "+other@")}`)]);
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  await assert.rejects(inviteCandidate(candidate, id, "Intruder", candidate.email!), /not found/);
  const g = (await query<Guarantee>("select * from owed.guarantees"))[0]!;
  await assert.rejects(closeGuarantee(candidate, g.id, { status: "not_moving_forward" }), /not found/);
  await assert.rejects(flagGuarantee(employer, g.id), /not found/);
});

test("one verified account claims an invite, and another account cannot replace its payer", async () => {
  const id = await role();
  const token = await inviteCandidate(employer, id, "Candidate", candidate.email!);
  await assert.rejects(acceptInvite(employer, token), /own guarantee/);
  await assert.rejects(acceptInvite({ ...candidate, verified: false }, token), /verified/);
  await acceptInvite(candidate, token);
  await acceptInvite(candidate, token);
  await assert.rejects(acceptInvite(await person(), token), /already been claimed/);
  assert.equal((await query<Guarantee>("select * from owed.guarantees"))[0]?.candidate_id, candidate.id);
});

test("deadline charges once, pays the connected candidate once, releases the remaining hold", async () => {
  const id = await role(2);
  const token = await inviteCandidate(employer, id, "Candidate", candidate.email!);
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
  const token = await inviteCandidate(employer, id, "Candidate", candidate.email!);
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
  await inviteCandidate(employer, id, "Early", candidate.email!);
  await inviteCandidate(employer, id, "Late", `${candidate.email!.replace("@", "+other@")}`);
  const guarantees = await query<Guarantee>("select * from owed.guarantees order by created_at,id");
  await assert.rejects(closeGuarantee(employer, guarantees[0]!.id, { status: "not_moving_forward", message: "Custom rejection reasons" }), /Review/);
  await closeGuarantee(employer, guarantees[0]!.id, { status: "not_moving_forward" });
  await due(id);
  await assert.rejects(closeGuarantee(employer, guarantees[1]!.id, { status: "moving_forward" }), /deadline has passed/);
  await runWorker(10, provider);
  assert.equal((await query<Guarantee>("select * from owed.guarantees where id=$1", [guarantees[0]!.id]))[0]?.closure_message, "Thank you for your time. We are not moving forward with your application.");
  assert.equal((await query<Role>("select * from owed.roles where id=$1", [id]))[0]?.charged_cents, 1000);
});

test("extensions are once-only, must move forward and must fit inside the PayPal authorization", async () => {
  const id = await role();
  await inviteCandidate(employer, id, "Candidate", candidate.email!);
  const g = (await query<Guarantee>("select * from owed.guarantees"))[0]!;
  await assert.rejects(closeGuarantee(employer, g.id, { status: "still_deciding", newDeadline: new Date(Date.now() + 86400000).toISOString() }), /after the existing/);
  await closeGuarantee(employer, g.id, { status: "still_deciding", newDeadline: new Date(Date.now() + 3 * 86400000).toISOString() });
  await assert.rejects(closeGuarantee(employer, g.id, { status: "still_deciding", newDeadline: new Date(Date.now() + 4 * 86400000).toISOString() }), /once/);
});

test("nudge ticks deduplicate notifications and session state is consumed once", async () => {
  const id = await role();
  await inviteCandidate(employer, id, "Candidate", candidate.email!);
  await query("update owed.guarantees set deadline=now()+interval '1 hour'");
  await query("select owed.tick()"); await query("select owed.tick()");
  assert.equal((await query("select id from owed.notifications where kind='deadline_nudge'")).length, 1);
  const state = await newLoginState("/candidate");
  assert.equal(await consumeLoginState(state), "/candidate");
  assert.equal(await consumeLoginState(state), null);
});

test("ambiguous writes stay unknown with the same immutable business input", async () => {
  const id = await role();
  await inviteCandidate(employer, id, "Candidate", candidate.email!);
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
  const token = await inviteCandidate(employer, id, "Candidate", candidate.email!);
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
  assert.equal(tables.length, 8);
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
        const token = await inviteCandidate(employer, id, "Candidate", candidate.email!);
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

test("closure and payout emails go once to the sandbox inbox with the intended recipient named", async () => {
  process.env.EMAIL_SANDBOX_RECIPIENT = "inbox@example.test";
  const sent: Mail[] = [];
  const mailer: Mailer = { verify: async () => {}, send: async (mail) => { sent.push(mail); } };
  const id = await role(2);
  await acceptInvite(candidate, await inviteCandidate(employer, id, "Candidate", candidate.email!));
  const other = await person();
  await acceptInvite(other, await inviteCandidate(employer, id, "Other", other.email!));
  const closed = (await query<Guarantee>("select * from owed.guarantees where candidate_id=$1", [candidate.id]))[0]!;
  await closeGuarantee(employer, closed.id, { status: "not_moving_forward" });
  assert.equal(await sendEmails(5, mailer), 1);
  assert.equal(await sendEmails(5, mailer), 0);
  assert.equal(sent[0]!.to, "inbox@example.test");
  assert.ok(sent[0]!.text.includes(`Intended recipient: ${candidate.email}`));
  assert.ok(sent[0]!.text.includes("Role: Engineer at Example"));
  assert.ok(sent[0]!.text.includes("We are not moving forward"));
  await query("update owed.guarantees set deadline=now()-interval '1 second' where candidate_id=$1", [other.id]);
  for (let i = 0; i < 3; i++) {
    await runWorker(5, provider);
    await query("update owed.paypal_operations set next_attempt_at=now() where state in ('queued','pending')");
  }
  assert.equal((await query<Guarantee>("select * from owed.guarantees where candidate_id=$1", [other.id]))[0]?.status, "paid");
  sent.length = 0;
  await sendEmails(5, mailer);
  const paid = sent.filter((mail) => mail.subject === "Owed paid your guarantee");
  assert.equal(paid.length, 1);
  assert.ok(paid[0]!.text.includes(`Intended recipient: ${other.email}`));
  assert.ok(paid[0]!.text.includes("$10.00"));
});

test("rejected emails back off and retry three times, unknown sends never repeat, outages claim nothing", async () => {
  process.env.EMAIL_SANDBOX_RECIPIENT = "inbox@example.test";
  const notify = async (state = "pending") => (await query<{ id: string }>(`insert into owed.notifications
    (recipient_id,kind,message,email_state,email_claimed_at) values ($1,'still_deciding','Status',$2,
    case when $2='sending' then now()-interval '10 minutes' end) returning id`, [candidate.id, state]))[0]!.id;
  const stateOf = async (id: string) => (await query<{ email_state: string; email_attempts: number }>(
    "select email_state,email_attempts from owed.notifications where id=$1", [id]))[0]!;
  const ok = async () => {};
  let calls = 0;
  const rejected = await notify();
  const rejecting: Mailer = { verify: ok, send: async () => { throw Object.assign(new Error("rejected"), { responseCode: 451 }); } };
  await sendEmails(5, rejecting);
  await sendEmails(5, rejecting);
  assert.deepEqual(await stateOf(rejected), { email_state: "pending", email_attempts: 1 });
  for (let i = 0; i < 3; i++) {
    await query("update owed.notifications set email_next_attempt_at=now() where id=$1", [rejected]);
    await sendEmails(5, rejecting);
  }
  assert.deepEqual(await stateOf(rejected), { email_state: "failed", email_attempts: 3 });
  const down = await notify();
  assert.equal(await sendEmails(5, { verify: async () => { throw new Error("down"); }, send: async () => { calls++; } }), 0);
  assert.deepEqual(await stateOf(down), { email_state: "pending", email_attempts: 0 });
  await query("delete from owed.notifications where id=$1", [down]);
  const dropped = await notify();
  await sendEmails(5, { verify: ok, send: async () => { throw Object.assign(new Error("dropped"), { code: "ECONNECTION" }); } });
  assert.equal((await stateOf(dropped)).email_state, "unknown");
  const interrupted = await notify("sending");
  assert.equal(await sendEmails(5, { verify: ok, send: async () => { calls++; } }), 0);
  assert.equal(calls, 0);
  assert.equal((await stateOf(interrupted)).email_state, "unknown");
});

test("direct delivery refuses an address PayPal has not verified", async () => {
  process.env.EMAIL_DELIVER_TO_RECIPIENTS = "true";
  try {
    await query("update owed.candidates set email_verified=false where id=$1", [candidate.id]);
    const id = (await query<{ id: string }>("insert into owed.notifications (recipient_id,kind,message) values ($1,'paid','Paid') returning id", [candidate.id]))[0]!.id;
    let calls = 0;
    assert.equal(await sendEmails(5, { verify: async () => {}, send: async () => { calls++; } }), 0);
    assert.equal(calls, 0);
    assert.equal((await query<{ email_state: string }>("select email_state from owed.notifications where id=$1", [id]))[0]?.email_state, "failed");
  } finally {
    delete process.env.EMAIL_DELIVER_TO_RECIPIENTS;
  }
});

test("an AI-drafted closure is private to the employer, needs a review to send, and clears its draft", async () => {
  const id = await role();
  await acceptInvite(candidate, await inviteCandidate(employer, id, "Candidate", candidate.email!));
  const g = (await query<Guarantee>("select * from owed.guarantees where role_id=$1", [id]))[0]!;
  const ctx = await closureContext(employer, g.id, { status: "not_moving_forward" });
  await assert.rejects(closureContext(candidate, g.id, { status: "not_moving_forward" }), /not found/);
  const review = { source: "ai" as const, model: "test-model", flags: [], blocking: [] };
  const text = "We are not moving forward with your application. Thank you for your time.";
  await assert.rejects(storeClosureDraft(candidate, g.id, ctx, text, review), /not found/);
  await storeClosureDraft(employer, g.id, ctx, text, review);
  assert.equal((await closureDraft(employer, g.id))?.message, text);
  assert.equal(await closureDraft(candidate, g.id), undefined);
  await assert.rejects(closeGuarantee(employer, g.id, { status: "not_moving_forward", message: text }), /Review/);
  await assert.rejects(closeGuarantee(employer, g.id, { status: "not_moving_forward", message: text }, { ...review, blocking: ["Remove links"] }), /Review/);
  await closeGuarantee(employer, g.id, { status: "not_moving_forward", message: text }, review);
  const closed = (await query<Guarantee & { closure_review: { model: string } }>("select * from owed.guarantees where id=$1", [g.id]))[0]!;
  assert.equal(closed.closure_message, text);
  assert.equal(closed.closure_review.model, "test-model");
  assert.equal(await closureDraft(employer, g.id), undefined);
  assert.equal((await query<{ message: string }>("select message from owed.notifications where guarantee_id=$1", [g.id]))[0]?.message, text);
});

test("a custom still deciding message must state the new date", async () => {
  const id = await role();
  await acceptInvite(candidate, await inviteCandidate(employer, id, "Candidate", candidate.email!));
  const g = (await query<Guarantee>("select * from owed.guarantees where role_id=$1", [id]))[0]!;
  const later = new Date(g.deadline.getTime() + 86400000).toISOString();
  const review = { source: "ai" as const, model: "test-model", flags: [], blocking: [] };
  await assert.rejects(closeGuarantee(employer, g.id, { status: "still_deciding", newDeadline: later, message: `We are still deciding and will reply on ${later.slice(0, 10)}.` }, review), /new deadline/);
  await closeGuarantee(employer, g.id, { status: "still_deciding", newDeadline: later, message: `We are still deciding and will reply by ${later.slice(0, 10)} ${later.slice(11, 16)} UTC.` }, review);
  assert.equal((await query<Guarantee>("select * from owed.guarantees where id=$1", [g.id]))[0]?.extended, true);
});

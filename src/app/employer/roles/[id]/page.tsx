import { notFound } from "next/navigation";
import { z } from "zod";
import { appOrigin, requireActor } from "@/lib/owed/auth";
import { query } from "@/lib/owed/db";
import type { Guarantee, Role } from "@/lib/owed/domain";
import { formatDeadline } from "@/lib/format";
import { guaranteeState, isOpen, money, operationKind, operationState, payoutDetail, roleState, formatTime } from "@/lib/present";
import { Button, ButtonLink } from "@/components/Button";
import { Deadline } from "@/components/Deadline";
import { Acknowledge, Field, StatusChoice } from "@/components/Fields";
import { Line, Receipt } from "@/components/Receipt";
import { Notice } from "@/components/Notice";
import { PlainFooter } from "@/components/Footer";
import { Stamp } from "@/components/Stamp";
import { Status } from "@/components/Status";
import { closeGuaranteeAction, closeRoleAction, correctInvitationAction, discardClosureDraftAction, draftClosureAction, fundRoleAction, inviteAction, sendClosureDraftAction } from "../../../actions";
import { hashToken } from "@/lib/owed/roles";
import type { ClosureDraft } from "@/lib/owed/roles";
import s from "./role.module.css";

type Row = Guarantee & { payout_batch_id: string | null; paid_at: Date | null };
type Operation = { id: string; kind: string; state: string; updated_at: Date };

const statusLabels: Record<string, string> = { moving_forward: "Moving forward", not_moving_forward: "Not moving forward", still_deciding: "Still deciding" };

export default async function RolePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ invitation?: string }>;
}) {
  const user = await requireActor();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const role = (await query<Role & { created_at: Date }>("select * from owed.roles where id=$1 and employer_id=$2", [id, user.id]))[0];
  if (!role) notFound();
  const guarantees = await query<Row>(`select g.*, op.updated_at as paid_at from owed.guarantees g
    left join owed.paypal_operations op on op.kind='payout' and op.business_key=g.id::text and op.state='succeeded'
    where g.role_id=$1 order by g.created_at`, [id]);
  const drafts = new Map((await query<ClosureDraft>("select * from owed.closure_drafts where guarantee_id = any($1::uuid[])", [guarantees.map((g) => g.id)])).map((d) => [d.guarantee_id, d]));
  const operations = await query<Operation>("select id,kind,state,updated_at from owed.paypal_operations where role_id=$1 order by created_at", [id]);
  const released = operations.find((op) => op.kind === "release_hold" && op.state === "succeeded");
  const { invitation } = await searchParams;
  const invite = invitation && /^[\w-]{43}$/.test(invitation) && guarantees.some((g) => g.invite_hash === hashToken(invitation))
    ? `${appOrigin()}/invite/${invitation}` : null;
  const now = new Date();
  const st = roleState(role.status);
  return <>
    <main>
      <div className="page-head">
        <p className="secondary">{role.employer_name}</p>
        <div className={s.titleRow}><h1>{role.title}</h1>{role.status !== "closed" && <Status word={st.word} tone={st.tone} id={`role-${role.id}`} />}</div>
      </div>

      <section className={s.summary} aria-label="Hold">
        <div className="stack-16">
          <Receipt label="Hold receipt">
            <Line label="Guarantee per place" value={money(role.guarantee_cents)} />
            <Line label="Places used" value={`${guarantees.length} of ${role.capacity}`} />
            <Line label="Charged to candidates" value={money(role.charged_cents)} />
            {role.status === "closed" ? <Line label="Released to you" value={money(role.hold_cents - role.charged_cents)} total />
              : ["draft", "approval_pending"].includes(role.status) ? <Line label="Hold to approve" value={money(role.hold_cents)} total />
              : <Line label="Held in PayPal" value={money(role.hold_cents - role.charged_cents)} total />}
          </Receipt>
          {role.expires_at && role.status !== "closed" && <p className="secondary small">PayPal hold valid until {formatDeadline(role.expires_at)}.</p>}
        </div>
        <div className="stack-16">
          {role.status === "closed" ? <Stamp kind="released" amount={money(role.hold_cents - role.charged_cents)} time={released ? formatTime(released.updated_at) : undefined} />
            : <Deadline deadline={role.deadline} start={role.authorized_at} now={now} />}
        </div>
      </section>

      {role.status === "draft" && <form action={fundRoleAction} className="actions"><input type="hidden" name="id" value={id} />
        <Button>Prepare the PayPal hold</Button><span className="secondary small">You&apos;ll approve {money(role.hold_cents)} in PayPal next.</span></form>}
      {role.status === "approval_pending" && role.approve_url && <div className="actions"><ButtonLink href={role.approve_url}>Approve the hold in PayPal</ButtonLink>
        <span className="secondary small">PayPal sandbox opens. Come back here when it&apos;s approved.</span></div>}
      {role.status === "needs_attention" && <Notice kind="error" title="A PayPal outcome needs review">Owed won&apos;t create a new hold or payment to replace one whose outcome is unknown. The operator is checking it with PayPal.</Notice>}
      {role.status === "closing" && <Notice kind="info" title="Releasing the rest of the hold">PayPal is voiding what&apos;s left. This page updates every minute.</Notice>}

      {invite && <Notice kind="info" title="Copy this link now">
        <p className="mono" style={{ wordBreak: "break-all" }}><a href={invite}>{invite}</a></p>
        <p className="secondary small">Send it only to this candidate. Owed stores only a hash of it, so it can&apos;t show it again.</p>
      </Notice>}

      {role.status === "active" && guarantees.length < role.capacity && <section className="section" aria-labelledby="invite">
        <h2 id="invite">Invite an interviewed candidate</h2>
        <p className="secondary measure">{role.capacity - guarantees.length} of {role.capacity} places left. Only the PayPal account with this email can open the invitation.</p>
        <form action={inviteAction} className={s.invite}><input type="hidden" name="id" value={id} />
          <Field label="Candidate name" name="label" required maxLength={120} />
          <Field label="Candidate's PayPal email" name="paypalEmail" type="email" inputMode="email" required maxLength={254} />
          <div className="actions"><Button>Create private invitation</Button></div>
        </form>
      </section>}

      <section className="section" aria-labelledby="candidates">
        <h2 id="candidates">Candidates</h2>
        {!guarantees.length && <p className="secondary">{["draft", "approval_pending"].includes(role.status)
          ? "You can invite candidates once PayPal approves the hold."
          : "No candidates yet. Invite each person you interviewed."}</p>}
        <ul className={s.candidates}>{guarantees.map((g) => {
          const state = guaranteeState(g, now);
          const draft = drafts.get(g.id);
          const open = isOpen(g.status);
          const detail = payoutDetail(g.status);
          return <li key={g.id} className={s.candidate}>
            <div className={s.row}>
              <div className="stack-8">
                <div className={s.nameRow}><h3>{g.candidate_label}</h3>{state.kind === "status" && <Status word={state.word} tone={state.tone} id={`g-${g.id}`} />}</div>
                <p className="secondary small">{g.candidate_id ? "Accepted with PayPal" : `Not accepted yet. Invited as ${g.intended_email ?? "an earlier invitation"}`}</p>
                {detail && <p className="secondary small">{detail}</p>}
              </div>
              <div className={s.side}>
                {state.kind === "stamp" ? <Stamp kind={state.stamp} amount={money(g.amount_cents)} id={`g-${g.id}`} reference={g.payout_batch_id ?? undefined} time={g.paid_at ? formatTime(g.paid_at) : undefined} />
                  : open ? <Deadline deadline={g.deadline} start={role.authorized_at} now={now} compact /> : <Receipt><Line label="Guarantee" value={money(g.amount_cents)} /></Receipt>}
              </div>
            </div>

            {g.closure_message && <div className="stack-8"><p className="secondary small">Message sent</p><p className="letter">{g.closure_message}</p></div>}
            {g.flagged_at && <Notice kind="info">The candidate asked for a review. A review request doesn&apos;t change the payment rules.</Notice>}

            {role.status === "active" && g.status === "invited" && !g.candidate_id && g.deadline > now && <details className={s.details}>
              <summary>Correct the PayPal email</summary>
              <form action={correctInvitationAction} className={s.invite}>
                <input type="hidden" name="id" value={g.id} /><input type="hidden" name="previousEmail" value={g.intended_email ?? ""} />
                <Field label="Correct PayPal email" name="paypalEmail" type="email" inputMode="email" required maxLength={254}
                  description="Only before the candidate accepts. The old link stops working, so send them the new one." />
                <div className="actions"><Button variant="secondary">Correct email and replace the link</Button></div>
              </form>
            </details>}

            {open && draft && <form id={`closure-${g.id}`} action={sendClosureDraftAction} className={`${s.panel} fade-in`}>
              <input type="hidden" name="id" value={g.id} />
              <div className="stack-8">
                <h4 className={s.panelTitle}>Message to {g.candidate_label}</h4>
                <p className="secondary small">{statusLabels[draft.status] ?? draft.status}{draft.new_deadline ? `, new date ${formatDeadline(draft.new_deadline)}` : ""}. {draft.review.draftUnavailable ? "You can edit this message freely. It's checked again before sending." : draft.review.source === "ai" ? "Drafted and checked by AI. Edit it freely, it's checked again before sending." : draft.review.source === "fixed" ? "Owed's standard message." : "The AI check is unavailable, so only Owed's standard message can be sent."}</p>
              </div>
              {draft.review.draftUnavailable && <Notice kind="warning" title="AI drafting didn't respond">Owed&apos;s standard message is filled in instead. You can send it, edit it or try drafting again later.</Notice>}
              <Field label="Letter" name="message" defaultValue={draft.message} maxLength={1200} rows={6} multiline letter required />
              {draft.review.blocking.length > 0 && <Notice kind="error" title="This message can't be sent yet"><ul className="stack-8">{draft.review.blocking.map((flag, i) => <li key={i}>{flag}</li>)}</ul></Notice>}
              {draft.review.flags.length > 0 && <Notice kind="warning" title="Check this wording">
                <ul className={s.flags}>{draft.review.flags.map((flag, i) => <li key={i}>{flag}</li>)}</ul>
                <Acknowledge name="acknowledged" value="yes">I reviewed the flagged wording and want to send this message unchanged.</Acknowledge>
              </Notice>}
              <div className="actions"><Button>Send this message</Button><Button variant="quiet" formAction={discardClosureDraftAction} formNoValidate>Discard draft</Button></div>
            </form>}

            {open && !draft && <form action={closeGuaranteeAction} className={s.panel}>
              <input type="hidden" name="id" value={g.id} />
              <h4 className={s.panelTitle}>Send {g.candidate_label} a status</h4>
              <StatusChoice name="status" deadlineFor="still_deciding" deadlineName="newDeadline" deadlineLabel="New reply deadline"
                deadlineDescription="Once only, and within the PayPal hold."
                options={[
                  { value: "moving_forward", label: "Moving forward" },
                  { value: "not_moving_forward", label: "Not moving forward" },
                  ...(!g.extended ? [{ value: "still_deciding", label: "Still deciding", detail: "Set a new date once. The message states it exactly." }] : []),
                ]} />
              <p className="secondary small measure">The message states the status only, never reasons. AI can draft it for you to edit, and it checks the wording before anything is sent.</p>
              <div className="actions"><Button>Send standard message</Button><Button variant="secondary" formAction={draftClosureAction}>Draft message with AI</Button></div>
            </form>}
          </li>;
        })}</ul>
      </section>

      {role.status === "active" && <section className="section" aria-labelledby="close">
        <h2 id="close">Close the role</h2>
        <form action={closeRoleAction} className="stack-16"><input type="hidden" name="id" value={id} />
          <p className="secondary measure">When every candidate has a status or has been paid, close the role and PayPal releases what&apos;s left of the hold.</p>
          <div className="actions"><Button variant="secondary">Close role and release the rest</Button></div></form>
      </section>}

      <section className="section" aria-labelledby="operations">
        <h2 id="operations">PayPal activity</h2>
        {!operations.length ? <p className="secondary">Nothing sent to PayPal yet.</p> : <ul className="rows">{operations.map((op) => <li key={op.id} className={s.op}>
          <span>{operationKind(op.kind)}</span><span className={s.opState}>{operationState(op.state)}</span><span className="mono secondary">{formatDeadline(op.updated_at)}</span>
        </li>)}</ul>}
        <p className="secondary small">PayPal updates run every minute. <a href={`/employer/roles/${id}`}>Refresh</a>.</p>
      </section>
    </main>
    <PlainFooter />
  </>;
}

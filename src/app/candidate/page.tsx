import { requireActor } from "@/lib/owed/auth";
import { query } from "@/lib/owed/db";
import type { Guarantee } from "@/lib/owed/domain";
import { guaranteeState, isOpen, money, payoutDetail, formatTime } from "@/lib/present";
import { Button } from "@/components/Button";
import { Deadline } from "@/components/Deadline";
import { Line, Receipt } from "@/components/Receipt";
import { Notice } from "@/components/Notice";
import { SilhouetteFooter } from "@/components/Footer";
import { Stamp } from "@/components/Stamp";
import { Status } from "@/components/Status";
import { flagAction } from "../actions";
import s from "./candidate.module.css";

type Row = Guarantee & { title: string; employer_name: string; payout_batch_id: string | null; paid_at: Date | null };

export default async function CandidatePage() {
  const user = await requireActor();
  const guarantees = await query<Row>(`select g.*,r.title,r.employer_name,op.updated_at as paid_at
    from owed.guarantees g join owed.roles r on r.id=g.role_id
    left join owed.paypal_operations op on op.kind='payout' and op.business_key=g.id::text and op.state='succeeded'
    where g.candidate_id=$1 order by g.created_at desc`, [user.id]);
  const now = new Date();
  return <>
    <main>
      <div className="page-head"><h1>Your guarantees</h1>
        <p className="secondary measure">Your PayPal account is {user.verified ? "verified and connected" : "not verified"}. Payouts go only to this PayPal account.</p></div>
      {!guarantees.length && <p className="secondary">No guarantees yet. Open the private invitation your employer sent you to add one.</p>}
      <ul className={s.list}>{guarantees.map((g) => {
        const state = guaranteeState(g, now);
        const detail = payoutDetail(g.status, "candidate");
        return <li key={g.id} className={s.item}>
          <article className="stack-16">
            <div className={s.head}><h2>{g.title} <span className="secondary">at {g.employer_name}</span></h2>
              {state.kind === "status" && <Status word={state.word} tone={state.tone} id={`g-${g.id}`} />}</div>
            {state.kind === "stamp" && <Stamp kind={state.stamp} amount={money(g.amount_cents)} id={`g-${g.id}`}
              reference={g.payout_batch_id ?? undefined} time={g.paid_at ? formatTime(g.paid_at) : undefined} />}
            {g.closure_message && <div className="stack-8"><p className="secondary small">Message from {g.employer_name}</p><p className="letter">{g.closure_message}</p></div>}
            {isOpen(g.status) && <Deadline deadline={g.deadline} now={now} />}
            {state.kind === "status" && <Receipt label="Guarantee"><Line label={isOpen(g.status) ? "Paid to you if no reply" : "Guarantee"} value={money(g.amount_cents)} /></Receipt>}
            {detail && <p className="secondary">{detail}</p>}
            {g.status === "needs_attention" && <Notice kind="error" title="This payment needs review">Owed won&apos;t send a second payment to replace one whose outcome is unknown. The operator is checking it with PayPal.</Notice>}
            <form action={flagAction} className="actions"><input type="hidden" name="id" value={g.id} />
              <Button variant="quiet" isDisabled={!!g.flagged_at}>{g.flagged_at ? "Review requested" : "Something looks wrong? Ask for a review"}</Button></form>
          </article>
        </li>;
      })}</ul>
      <p className="secondary small">Payment status updates every minute. <a href="/candidate">Refresh</a>.</p>
    </main>
    <SilhouetteFooter />
  </>;
}

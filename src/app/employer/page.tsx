import Link from "next/link";
import { requireActor } from "@/lib/owed/auth";
import { query } from "@/lib/owed/db";
import type { Role } from "@/lib/owed/domain";
import { formatDeadline } from "@/lib/format";
import { money, roleState, formatTime } from "@/lib/present";
import { Line, Receipt } from "@/components/Receipt";
import { Notice } from "@/components/Notice";
import { PlainFooter } from "@/components/Footer";
import { PromiseForm } from "@/components/PromiseForm";
import { Status } from "@/components/Status";
import { createRoleAction } from "../actions";
import s from "./employer.module.css";

type Row = Role & { used: number; missed: number; nearest: Date | null };

const pick = (value: string | undefined, pattern: RegExp) => (value && pattern.test(value) ? value : undefined);

export default async function EmployerPage({ searchParams }: { searchParams: Promise<{ places?: string; amount?: string; deadline?: string }> }) {
  const user = await requireActor();
  const params = await searchParams;
  const defaults = {
    places: pick(params.places, /^\d{1,3}$/), amount: pick(params.amount, /^\d{1,4}(\.\d{1,2})?$/),
    deadline: pick(params.deadline, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  };
  const roles = await query<Row>(`select r.*, count(g.id)::int as used,
      count(g.id) filter (where g.status in ('overdue','charging','awaiting_account','paying','paid','unclaimed'))::int as missed,
      min(g.deadline) filter (where g.status in ('invited','pending')) as nearest
    from owed.roles r left join owed.guarantees g on g.role_id=r.id where r.employer_id=$1 group by r.id order by r.created_at desc`, [user.id]);
  const notices = await query<{ id: string; message: string; created_at: Date }>("select id,message,created_at from owed.notifications where recipient_id=$1 order by created_at desc limit 20", [user.id]);
  return <>
    <main>
      <div className="page-head"><h1>Your roles</h1><p className="secondary">Every role is a promise to reply by a date, backed by a PayPal hold.</p></div>
      {!user.verified && <Notice kind="warning" title="Your PayPal account isn't verified">Use a verified PayPal account to fund a role.</Notice>}
      <section className="section" aria-label="Roles">
        {!roles.length ? <p className="secondary">No roles yet. Write your first promise below.</p> : <ul className={s.roles}>{roles.map((role) => {
          const st = roleState(role.status);
          return <li key={role.id} className={s.role}>
            <div className={s.head}><Link href={`/employer/roles/${role.id}`} className={s.title}>{role.title}</Link>
              {role.missed > 0 ? <Status word={`Deadline missed ${role.missed}`} tone="red" /> : <Status word={st.word} tone={st.tone} id={`role-${role.id}`} />}</div>
            <Receipt label={`${role.title} summary`}>
              {["draft", "approval_pending"].includes(role.status) ? <Line label="Hold to approve" value={money(role.hold_cents)} />
                : <Line label="Held" value={role.status === "closed" ? "Released" : money(role.hold_cents - role.charged_cents)} />}
              <Line label="Places used" value={`${role.used} of ${role.capacity}`} />
              <Line label="Nearest reply due" value={role.nearest ? formatDeadline(role.nearest) : "None open"} />
            </Receipt>
          </li>;
        })}</ul>}
      </section>
      <section className="section" aria-labelledby="new">
        <h2 id="new">New role</h2>
        <PromiseForm mode="role" defaults={defaults} action={createRoleAction} />
      </section>
      <section className="section" aria-labelledby="notifications">
        <h2 id="notifications">Notifications</h2>
        {!notices.length ? <p className="secondary">Nothing yet. Owed tells you here 24 hours before a reply is due.</p>
          : <ul className="rows">{notices.map((n) => <li key={n.id} className={s.notice}><p>{n.message}</p><p className="mono secondary">{formatTime(n.created_at)}</p></li>)}</ul>}
      </section>
    </main>
    <PlainFooter />
  </>;
}

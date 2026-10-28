import type { Metadata } from "next";
import { Button, ButtonLink } from "@/components/Button";
import { Deadline } from "@/components/Deadline";
import { Acknowledge, DeadlineField, Field, StatusChoice } from "@/components/Fields";
import { Lockup } from "@/components/Lockup";
import { Mark } from "@/components/Mark";
import { Line, Receipt } from "@/components/Receipt";
import { Notice } from "@/components/Notice";
import { PlainFooter, SilhouetteFooter } from "@/components/Footer";
import { PromiseForm } from "@/components/PromiseForm";
import { Stamp } from "@/components/Stamp";
import { Status } from "@/components/Status";
import { tokens } from "@/design/tokens";
import s from "./design.module.css";

export const metadata: Metadata = { title: "Components · Owed", robots: { index: false } };

const day = 86400000;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="section" aria-label={title} id={title.toLowerCase().replace(/[^a-z]+/g, "-")}><h2>{title}</h2><div className={s.block}>{children}</div></section>;
}

export default function DesignPage() {
  const now = new Date("2026-10-28T12:00:00Z");
  const colors = Object.entries(tokens.color);
  const statuses = Object.entries(tokens.status);
  return <>
    <main>
      <div className="page-head"><h1>Components</h1><p className="secondary measure">Every Owed component in every state, for design review. Values come from the tokens file only.</p></div>

      <Block title="Logo">
        <div className={s.row}><Mark size={64} label="Owed" /><Mark size={32} /><Mark size={16} /><Lockup href={null} /></div>
        <div className={s.inkPanel}><Mark size={64} tone="paper" /><Lockup tone="paper" href={null} /></div>
      </Block>

      <Block title="Colour">
        <ul className={s.swatches}>{[...colors, ...statuses.map(([k, v]) => [`status ${k}`, v] as const)].map(([name, value]) => <li key={name}>
          <span className={s.swatch} style={{ background: value }} /><span>{name}</span><span className="mono secondary">{value}</span></li>)}</ul>
      </Block>

      <Block title="Type">
        <p className={s.landing}>Promise every candidate an answer.</p>
        <h1>Page title in Newsreader</h1>
        <h2>Section title</h2>
        <p className={s.figure}>$1,250.00</p>
        <p>Body copy is IBM Plex Sans at 16 / 24. Short, direct sentences that name the money and the date.</p>
        <p className="small secondary">Label and supporting copy, 14 / 20.</p>
        <Status word="Status word" />
        <p className="mono">PayPal reference 8SX4431565137083E · 2026-10-28 12:00 UTC</p>
        <p className="letter">Thank you for your time. We are not moving forward with your application.</p>
      </Block>

      <Block title="Status lines">
        <div className={s.row}>
          <Status word="Waiting for reply" /><Status word="Reply due in 23 h" tone="amber" /><Status word="Moving forward" tone="green" />
          <Status word="Not moving forward" /><Status word="Still deciding" tone="blue" /><Status word="Deadline missed" tone="red" />
        </div>
      </Block>

      <Block title="Stamps">
        <div className={s.row}>
          <Stamp kind="paid" amount="$25.00" reference="2T9UZG3X22C74" time="2026-10-28 12:01 UTC" />
          <Stamp kind="released" amount="$50.00" time="2026-10-28 12:05 UTC" />
          <Stamp kind="unclaimed" amount="$25.00" />
        </div>
      </Block>

      <Block title="Receipt and amounts">
        <div className={s.narrow}><Receipt label="Example hold">
          <Line label="Guarantee per place" value="$25.00" /><Line label="Places used" value="2 of 3" />
          <Line label="Charged to candidates" value="$0.00" /><Line label="Held in PayPal" value="$75.00" total />
        </Receipt></div>
      </Block>

      <Block title="Deadlines">
        <div className={s.row}>
          <Deadline deadline={new Date(now.getTime() + 2.2 * day)} start={new Date(now.getTime() - 5 * day)} now={now} />
          <Deadline deadline={new Date(now.getTime() + 0.4 * day)} start={new Date(now.getTime() - 6 * day)} now={now} compact />
          <Deadline deadline={new Date(now.getTime() - 0.1 * day)} now={now} />
        </div>
      </Block>

      <Block title="Buttons">
        <div className={s.row}>
          <Button type="button">Send standard message</Button><Button type="button" variant="secondary">Draft message with AI</Button>
          <Button type="button" variant="quiet">Discard draft</Button><Button type="button" isDisabled>Review requested</Button>
          <ButtonLink href="#buttons">Continue with PayPal</ButtonLink>
        </div>
      </Block>

      <Block title="Fields">
        <form className={s.narrow} action="#">
          <div className="stack-16">
            <Field label="Candidate name" name="demo-name" required />
            <Field label="Candidate's PayPal email" name="demo-email" type="email" description="Only this PayPal account can open the invitation." />
            <DeadlineField label="New reply deadline" name="demo-deadline" description="Once only, and within the PayPal hold." />
            <Field label="Letter" name="demo-letter" multiline letter defaultValue="Thank you for your time. We are still deciding. We will send you a status by 2026-11-02 12:00 UTC." />
            <StatusChoice name="demo-status" deadlineFor="still_deciding" deadlineName="demo-new" options={[
              { value: "moving_forward", label: "Moving forward" }, { value: "not_moving_forward", label: "Not moving forward" },
              { value: "still_deciding", label: "Still deciding", detail: "Set a new date once. The message states it exactly." }]} />
            <Acknowledge name="demo-ack" value="yes">I reviewed the flagged wording and want to send this message unchanged.</Acknowledge>
          </div>
        </form>
      </Block>

      <Block title="Promise sentence">
        <PromiseForm mode="demo" defaults={{ deadline: "2026-11-04T12:00" }} />
      </Block>

      <Block title="Notices">
        <Notice kind="info" title="Copy this link now">Owed stores only a hash of it, so it can&apos;t show it again.</Notice>
        <Notice kind="warning" title="Check this wording"><p>Gives a reason for the decision.</p></Notice>
        <Notice kind="error" title="This message can't be sent yet">A still-deciding message must state the new cutoff, 2026-11-02 12:00 UTC.</Notice>
      </Block>

      <Block title="Empty state">
        <p className="secondary">No roles yet. Write your first promise below.</p>
      </Block>
    </main>
    <PlainFooter />
    <SilhouetteFooter />
  </>;
}

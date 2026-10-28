import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";
import type { CSSProperties } from "react";
import { formatDeadline } from "../format";
import { money } from "../present";
import { tokens } from "../../design/tokens";

export type EmailTemplateProps = {
  kind: string;
  appOrigin: string;
  message: string;
  name?: string | null;
  title?: string | null;
  employerName?: string | null;
  amountCents?: number | null;
  deadline?: Date | null;
  paypalReference?: string | null;
  paidAt?: Date | null;
  intendedRecipient?: string;
};

const emailSerif = tokens.font.serif.replace(/^"Newsreader Variable",\s*/, "");
const emailSans = tokens.font.sans.replace(/^"IBM Plex Sans",\s*/, "");
const emailMono = tokens.font.mono.replace(/^"IBM Plex Mono",\s*/, "");

const bodyStyle: CSSProperties = {
  margin: 0,
  backgroundColor: tokens.color.canvas,
  color: tokens.color.text,
  fontFamily: emailSans,
  fontSize: `${tokens.type.body.size}px`,
  lineHeight: `${tokens.type.body.lineHeight}px`,
};

const sectionRuleStyle: CSSProperties = {
  borderColor: tokens.color.border,
  borderStyle: "solid",
  borderWidth: "1px 0 0",
  margin: 0,
};

const statusStyle: CSSProperties = {
  color: tokens.color.text,
  fontFamily: emailSans,
  fontSize: `${tokens.type.status.size}px`,
  fontWeight: tokens.type.status.weight,
  letterSpacing: tokens.type.status.tracking,
  lineHeight: `${tokens.type.status.lineHeight}px`,
  margin: 0,
};

const statusRules: Record<string, string> = {
  moving_forward: tokens.status.green,
  not_moving_forward: tokens.status.neutral,
  still_deciding: tokens.status.blue,
};

function amount(cents?: number | null): string {
  return cents === undefined || cents === null ? "" : money(cents);
}

function displayRole(props: EmailTemplateProps): string | undefined {
  return props.title && props.employerName ? `Role: ${props.title} at ${props.employerName}` : undefined;
}

function StatusWord({ label, color }: { label: string; color: string }) {
  return (
    <>
      <Text style={statusStyle}>{label}</Text>
      <Hr
        style={{
          backgroundColor: color,
          border: 0,
          height: "2px",
          margin: `${tokens.space.s3}px 0 ${tokens.space.s5}px`,
          width: `${tokens.space.s5}px`,
        }}
      />
    </>
  );
}

function LeaderRow({ label, value }: { label: string; value: string }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: `${tokens.space.s3}px` }}>
      <tbody>
        <tr>
          <td style={{ paddingRight: `${tokens.space.s3}px`, verticalAlign: "bottom", whiteSpace: "nowrap" }}>
          <Text style={{ fontFamily: emailSans, fontSize: `${tokens.type.label.size}px`, lineHeight: `${tokens.type.label.lineHeight}px`, margin: 0 }}>{label}</Text>
          </td>
          <td style={{ borderBottom: `1px dotted ${tokens.color.border}`, width: "100%", verticalAlign: "bottom" }}>
          <Text style={{ fontSize: "1px", lineHeight: "1px", margin: 0 }}>&nbsp;</Text>
          </td>
          <td style={{ paddingLeft: `${tokens.space.s3}px`, textAlign: "right", verticalAlign: "bottom", whiteSpace: "nowrap" }}>
          <Text style={{ fontFamily: emailSans, fontSize: `${tokens.type.label.size}px`, lineHeight: `${tokens.type.label.lineHeight}px`, margin: 0 }}>{value}</Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function ContextLine({ children }: { children: string }) {
  return (
    <Text style={{ color: tokens.color.textSecondary, fontFamily: emailSans, fontSize: `${tokens.type.reference.size}px`, lineHeight: `${tokens.type.reference.lineHeight}px`, margin: `0 0 ${tokens.space.s3}px` }}>
      {children}
    </Text>
  );
}

function ClosureLetter(props: EmailTemplateProps) {
  const status = props.kind;
  const label = status.replaceAll("_", " ").toUpperCase();

  return (
    <>
      <StatusWord label={label} color={statusRules[status] ?? tokens.color.text} />
      {props.name ? <Text style={{ ...bodyStyle, marginBottom: `${tokens.space.s3}px` }}>Hello {props.name},</Text> : null}
      {displayRole(props) ? <ContextLine>{displayRole(props)!}</ContextLine> : null}
      {amount(props.amountCents) ? <ContextLine>{`Guarantee: ${amount(props.amountCents)}`}</ContextLine> : null}
      <Text style={{ ...bodyStyle, color: tokens.color.text, fontFamily: emailSerif, fontSize: "18px", lineHeight: "28px", margin: 0 }}>{props.message}</Text>
    </>
  );
}

function DeadlineReceipt(props: EmailTemplateProps) {
  return (
    <>
      <StatusWord label="DUE SOON" color={tokens.status.amber} />
      {displayRole(props) ? <ContextLine>{displayRole(props)!}</ContextLine> : null}
      <LeaderRow label="Guarantee" value={amount(props.amountCents)} />
      <LeaderRow label="Reply due" value={props.deadline ? formatDeadline(props.deadline) : ""} />
      <Text style={{ ...bodyStyle, margin: `${tokens.space.s5}px 0 0` }}>
        If no status arrives by the deadline, Owed will pay the guarantee to the candidate.
      </Text>
    </>
  );
}

function PaidReceipt(props: EmailTemplateProps) {
  const role = displayRole(props);
  const paymentDetails = [
    props.paypalReference ? `PayPal reference: ${props.paypalReference}` : "PayPal reference unavailable",
    props.paidAt ? `Paid at: ${formatDeadline(props.paidAt)}` : undefined,
  ].filter(Boolean).join(" · ");

  return (
    <>
      {role ? (
        <Text style={{ color: tokens.color.textSecondary, fontFamily: emailSans, fontSize: `${tokens.type.label.size}px`, lineHeight: `${tokens.type.label.lineHeight}px`, margin: `0 0 ${tokens.space.s3}px` }}>
          {role}
        </Text>
      ) : null}
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{
          border: `2px solid ${tokens.color.text}`,
          borderRadius: `${tokens.radius.panel}px`,
          marginBottom: `${tokens.space.s3}px`,
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: `${tokens.space.s3}px ${tokens.space.s4}px` }}>
              <Text style={{ ...statusStyle, marginBottom: `${tokens.space.s2}px` }}>PAID</Text>
              <Text
                style={{
                  color: tokens.color.text,
                  fontFamily: emailSans,
                  fontSize: `${tokens.type.figure.size}px`,
                  fontWeight: 500,
                  lineHeight: `${tokens.type.figure.lineHeight}px`,
                  margin: `0 0 ${tokens.space.s2}px`,
                }}
              >
                {amount(props.amountCents)}
              </Text>
              <Text
                style={{
                  color: tokens.color.textSecondary,
                  fontFamily: emailMono,
                  fontSize: `${tokens.type.reference.size}px`,
                  lineHeight: `${tokens.type.reference.lineHeight}px`,
                  margin: 0,
                }}
              >
                {paymentDetails}
              </Text>
            </td>
          </tr>
        </tbody>
      </table>
      <LeaderRow label="Paid" value={amount(props.amountCents)} />
    </>
  );
}

function EmailContent(props: EmailTemplateProps) {
  if (props.kind === "deadline_nudge") return <DeadlineReceipt {...props} />;
  if (props.kind === "paid") return <PaidReceipt {...props} />;
  if (props.kind in statusRules) return <ClosureLetter {...props} />;
  return <Text style={{ ...bodyStyle, margin: 0 }}>{props.message}</Text>;
}

export function EmailTemplate(props: EmailTemplateProps) {
  const preview = props.kind === "deadline_nudge"
    ? "A candidate is waiting for a status."
    : props.kind === "paid"
      ? "Owed paid your guarantee."
      : props.kind.replaceAll("_", " ");

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={{ backgroundColor: tokens.color.canvas, margin: "0 auto", maxWidth: "560px", width: "100%" }}>
          <Section style={{ padding: `${tokens.space.s7}px ${tokens.space.s5}px ${tokens.space.s5}px` }}>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign: "middle", width: "20px" }}>
                  <Img src={`${props.appOrigin}/owed-mark@2x.png`} width={20} height={20} alt="Owed" style={{ display: "block" }} />
                  </td>
                  <td style={{ paddingLeft: "7px", verticalAlign: "middle" }}>
                  <Text style={{ color: tokens.color.text, fontFamily: emailSerif, fontSize: `${tokens.space.s5}px`, fontWeight: 500, lineHeight: `${tokens.space.s6}px`, margin: 0 }}>
                    Owed
                  </Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
          <Hr style={sectionRuleStyle} />
          {props.intendedRecipient ? (
            <Section style={{ padding: `${tokens.space.s3}px ${tokens.space.s5}px 0` }}>
              <Text style={{ color: tokens.color.textSecondary, fontFamily: emailSans, fontSize: `${tokens.type.reference.size}px`, lineHeight: `${tokens.type.reference.lineHeight}px`, margin: 0 }}>
                Sandbox delivery. Intended recipient: {props.intendedRecipient}
              </Text>
            </Section>
          ) : null}
          <Section style={{ padding: `${tokens.space.s5}px` }}>
            <EmailContent {...props} />
          </Section>
          <Hr style={sectionRuleStyle} />
          <Section style={{ padding: `${tokens.space.s5}px` }}>
            <Text style={{ color: tokens.color.textSecondary, fontFamily: emailSans, fontSize: `${tokens.type.reference.size}px`, lineHeight: `${tokens.type.reference.lineHeight}px`, margin: `0 0 ${tokens.space.s2}px` }}>
              Every interviewed candidate hears back by a set date, or gets paid.
            </Text>
            <Text style={{ color: tokens.color.textSecondary, fontFamily: emailSans, fontSize: `${tokens.type.reference.size}px`, lineHeight: `${tokens.type.reference.lineHeight}px`, margin: 0 }}>
              Payments by PayPal
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function renderNotificationEmail(props: EmailTemplateProps): Promise<string> {
  return render(<EmailTemplate {...props} />);
}

import assert from "node:assert/strict";
import test from "node:test";
import { formatDeadline } from "../src/lib/format";
import { emailText, sendMailWithHtmlFallback } from "../src/lib/owed/email";
import type { Mail } from "../src/lib/owed/email";
import { renderNotificationEmail } from "../src/lib/owed/email-template";

const shared = {
  appOrigin: "https://owed.example",
  message: "Thank you for your time. We are moving forward with your application.",
  name: "Morgan",
  title: "Engineer",
  employerName: "Example",
  amountCents: 2500,
  deadline: new Date("2026-10-30T12:00:00.000Z"),
  paypalReference: "PAYOUT-123",
  paidAt: new Date("2026-10-28T11:00:00.000Z"),
};

const emails = [
  ["moving_forward", "MOVING FORWARD"],
  ["not_moving_forward", "NOT MOVING FORWARD"],
  ["still_deciding", "STILL DECIDING"],
  ["deadline_nudge", "DUE SOON"],
  ["paid", "PAID"],
] as const;

for (const [kind, status] of emails) {
  test(`${kind} email includes its amount and status`, async () => {
    const html = await renderNotificationEmail({ ...shared, kind });
    assert.ok(html.includes("$25.00"));
    assert.ok(html.includes(status));
  });
}

test("email HTML has a role and status-based document title", async () => {
  for (const [kind] of emails) {
    const html = await renderNotificationEmail({ ...shared, kind });
    assert.ok(html.includes("<title>"));
    if (kind === "paid") assert.ok(html.includes("<title>Owed: your guarantee was paid for Engineer</title>"));
    else if (kind === "deadline_nudge") assert.ok(html.includes("<title>Owed: reply due for Engineer</title>"));
    else assert.ok(html.includes("<title>Owed: your status for Engineer</title>"));
  }
});

test("email amounts use dollar signs and thousands separators", async () => {
  const html = await renderNotificationEmail({ ...shared, kind: "paid", amountCents: 125000 });
  assert.ok(html.includes("$1,250.00"));
});

test("deadline nudge names the candidate and links to the role in HTML and text", async () => {
  const roleUrl = "https://owed.example/employer/roles/role-123";
  const html = await renderNotificationEmail({
    ...shared,
    kind: "deadline_nudge",
    candidateLabel: "Ben Cole",
    roleUrl,
  });
  assert.ok(html.includes("Candidate"));
  assert.ok(html.includes("Ben Cole"));
  assert.ok(html.includes(`href="${roleUrl}"`));
  assert.ok(html.includes(">Open the role</a>"));

  const text = emailText({
    to: "sandbox@example.test",
    intended: "candidate@example.test",
    name: "Morgan",
    title: "Engineer",
    employerName: "Example",
    message: "A candidate is waiting for a status.",
    candidateLabel: "Ben Cole",
    roleUrl,
    appUrl: "https://owed.example",
  });
  assert.ok(text.includes("Candidate: Ben Cole"));
  assert.ok(text.includes(`Open the role: ${roleUrl}`));
  assert.ok(!text.endsWith("https://owed.example"));
});

test("not-moving-forward uses the neutral rule color", async () => {
  const html = await renderNotificationEmail({ ...shared, kind: "not_moving_forward" });
  assert.ok(html.includes("#5C625D"));
  assert.ok(!html.includes("#B3402F"));
});

test("closure message paragraphs use the email-safe serif stack", async () => {
  const html = await renderNotificationEmail({ ...shared, kind: "moving_forward" });
  const messageIndex = html.indexOf(shared.message);
  const paragraphStart = html.lastIndexOf("<p", messageIndex);
  const paragraphEnd = html.indexOf("</p>", messageIndex);
  const paragraph = html.slice(paragraphStart, paragraphEnd);
  assert.ok(paragraph.includes('font-family:Georgia, &quot;Times New Roman&quot;, serif'));
  assert.ok(paragraph.includes("font-size:18px"));
  assert.ok(paragraph.includes("line-height:28px"));
});

test("paid email stamps the amount and payment details above its leader row", async () => {
  const html = await renderNotificationEmail({ ...shared, kind: "paid" });
  assert.ok(html.includes("border:2px solid #1F2421"));
  assert.ok(html.includes("border-radius:0px"));
  assert.ok(html.includes("PayPal reference: PAYOUT-123 · Paid at: 28 Oct 2026, 11:00 UTC"));
  assert.ok(html.indexOf("PAYOUT-123") < html.lastIndexOf("$25.00"));
});

test("paid email shows role context above the stamp in secondary label text", async () => {
  const html = await renderNotificationEmail({ ...shared, kind: "paid" });
  const roleText = "Role: Engineer at Example";
  const roleIndex = html.indexOf(roleText);
  const roleParagraphStart = html.lastIndexOf("<p", roleIndex);
  const roleParagraphEnd = html.indexOf("</p>", roleIndex);
  const roleParagraph = html.slice(roleParagraphStart, roleParagraphEnd);
  assert.ok(roleIndex >= 0 && roleIndex < html.indexOf("PAID"));
  assert.ok(roleParagraph.includes("#5C625D"));
  assert.ok(roleParagraph.includes("font-size:14px"));
  assert.ok(roleParagraph.includes("line-height:20px"));

  const missingTitle = await renderNotificationEmail({ ...shared, kind: "paid", title: null });
  const missingEmployer = await renderNotificationEmail({ ...shared, kind: "paid", employerName: null });
  assert.ok(!missingTitle.includes("Role:"));
  assert.ok(!missingEmployer.includes("Role:"));
});

test("plain-text content keeps the existing sandbox body and spacing", () => {
  assert.equal(emailText({
    to: "sandbox@example.test",
    intended: "candidate@example.test",
    name: "Morgan",
    title: "Engineer",
    employerName: "Example",
    message: "We are moving forward.",
    appUrl: "https://owed.example",
  }), [
    "Sandbox delivery. Intended recipient: candidate@example.test",
    "Hello Morgan,",
    "Role: Engineer at Example",
    "We are moving forward.",
    "https://owed.example",
  ].join("\n\n"));
});

test("sends plain text when HTML rendering fails", async () => {
  const sent: Mail[] = [];
  const mail = {
    to: "candidate@example.test",
    subject: "Your application status",
    text: "The existing plain-text message.",
    messageId: "<notification@notifications.owed>",
  };
  await sendMailWithHtmlFallback({ send: async (message) => { sent.push(message); } }, mail, async () => {
    throw new Error("render failed");
  });
  assert.deepEqual(sent, [mail]);
  assert.equal(sent[0]?.html, undefined);
});

test("deadline formatter writes UTC dates in the design-system format", () => {
  assert.equal(formatDeadline(new Date("2026-10-30T12:00:00.000Z")), "30 Oct 2026, 12:00 UTC");
});

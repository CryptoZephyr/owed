import assert from "node:assert/strict";
import test from "node:test";
import { formatDeadline } from "../src/lib/format";
import { emailText } from "../src/lib/owed/email";
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
    assert.ok(html.includes("USD 25.00"));
    assert.ok(html.includes(status));
  });
}

test("not-moving-forward uses the neutral rule color", async () => {
  const html = await renderNotificationEmail({ ...shared, kind: "not_moving_forward" });
  assert.ok(html.includes("#5C625D"));
  assert.ok(!html.includes("#B3402F"));
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

test("deadline formatter writes UTC dates in the design-system format", () => {
  assert.equal(formatDeadline(new Date("2026-10-30T12:00:00.000Z")), "30 Oct 2026, 12:00 UTC");
});

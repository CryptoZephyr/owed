import assert from "node:assert/strict";
import test from "node:test";
import { unavailableInvitationAccountLine } from "../src/lib/owed/invitation-copy";

test("unavailable invitation identifies the signed-in account without an intended email", () => {
  const line = unavailableInvitationAccountLine("Casey Morgan");
  assert.equal(line, "You're signed in with PayPal as Casey Morgan.");
  assert.ok(!line.includes("recipient@example.test"));
});

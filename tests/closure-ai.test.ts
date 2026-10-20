import { test } from "node:test";
import assert from "node:assert/strict";
import { blockingFlags, draftClosure, reviewClosure } from "../src/lib/owed/closure-ai";
import type { Chat } from "../src/lib/owed/closure-ai";
import { fixedClosureMessage } from "../src/lib/owed/domain";

const ctx = { status: "not_moving_forward" as const, title: "Engineer", employerName: "Example" };
const deciding = { status: "still_deciding" as const, title: "Engineer", employerName: "Example", newDeadline: new Date("2026-10-30T12:00:00Z") };

test("an AI draft is reviewed before it is offered", async () => {
  const prompts: string[] = [];
  const chat: Chat = async (system, user) => {
    prompts.push(user);
    return system.includes("Review the draft") ? "{\"flags\":[\"Gives a reason: 'too junior'.\"]}"
      : "Here it is: {\"message\":\"We are not moving forward with your application for Engineer at Example.\"}";
  };
  const out = await draftClosure(ctx, chat);
  assert.equal(out.message, "We are not moving forward with your application for Engineer at Example.");
  assert.equal(out.review.source, "ai");
  assert.deepEqual(out.review.flags, ["Gives a reason: 'too junior'."]);
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1]!.includes(out.message));
});

test("an unavailable model falls back to the standard message and blocks custom text", async () => {
  const failing: Chat = async () => { throw new Error("HTTP 429"); };
  const draft = await draftClosure(ctx, failing);
  assert.equal(draft.message, fixedClosureMessage("not_moving_forward"));
  assert.equal(draft.review.source, "fixed");
  const review = await reviewClosure(ctx, "We are not moving forward.", failing);
  assert.equal(review.source, "unavailable");
  assert.equal(review.blocking.length, 1);
  assert.equal((await reviewClosure(ctx, "We are not moving forward.", async () => "no json")).source, "unavailable");
  assert.equal((await reviewClosure(ctx, "We are not moving forward.", async () => "{\"flags\":\"none\"}")).source, "unavailable");
});

test("hard rules block a missing new date and links whatever the model says", async () => {
  const clean: Chat = async () => "{\"flags\":[]}";
  assert.equal((await reviewClosure(deciding, "We are still deciding.", clean)).blocking.length, 1);
  assert.equal((await reviewClosure(deciding, "We are still deciding and will reply by 2026-10-30.", clean)).blocking.length, 1);
  assert.deepEqual(await reviewClosure(deciding, "We are still deciding and will reply by 2026-10-30 12:00 UTC.", clean),
    { source: "ai", model: "minimax/minimax-m3.1-flash:free", flags: [], blocking: [] });
  assert.equal(blockingFlags(ctx, "See https://example.com").length, 1);
  assert.equal(blockingFlags(ctx, "Write to hr@example.com").length, 1);
  const standard = await reviewClosure(deciding, fixedClosureMessage("still_deciding", deciding.newDeadline), async () => { throw new Error("unused"); });
  assert.deepEqual(standard, { source: "fixed", flags: [], blocking: [] });
});

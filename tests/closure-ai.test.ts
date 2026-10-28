import { test } from "node:test";
import assert from "node:assert/strict";
import { blockingFlags, draftClosure, reviewClosure } from "../src/lib/owed/closure-ai";
import type { Chat } from "../src/lib/owed/closure-ai";
import { deadlineText, fixedClosureMessage, mentionsDeadline } from "../src/lib/owed/domain";

const ctx = { status: "not_moving_forward" as const, title: "Engineer", employerName: "Example" };
const deciding = { status: "still_deciding" as const, title: "Engineer", employerName: "Example", newDeadline: new Date("2026-10-30T12:00:00Z") };

test("fixed still-deciding messages use the formatted deadline", () => {
  const message = fixedClosureMessage("still_deciding", deciding.newDeadline);
  assert.ok(message.includes(deadlineText(deciding.newDeadline)));
  assert.equal(message, "We are still deciding. We will send you a status by 2026-10-30 12:00 UTC.");
  assert.equal(mentionsDeadline(message, deciding.newDeadline), true);
});

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
  assert.equal(out.review.draftUnavailable, undefined);
  assert.deepEqual(out.review.flags, ["Gives a reason: 'too junior'."]);
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1]!.includes(out.message));
});

test("an unavailable model falls back to the standard message and blocks custom text", async () => {
  const failing: Chat = async () => { throw new Error("HTTP 429"); };
  const draft = await draftClosure(ctx, failing);
  assert.equal(draft.message, fixedClosureMessage("not_moving_forward"));
  assert.equal(draft.review.source, "fixed");
  assert.equal(draft.review.draftUnavailable, true);
  const review = await reviewClosure(ctx, "We are not moving forward.", failing);
  assert.equal(review.source, "unavailable");
  assert.equal(review.blocking.length, 1);
  assert.equal((await reviewClosure(ctx, "We are not moving forward.", async () => "no json")).source, "unavailable");
  assert.equal((await reviewClosure(ctx, "We are not moving forward.", async () => "{\"flags\":\"none\"}")).source, "unavailable");
});

test("AI failures log only an error message or a generic fallback", async () => {
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    await draftClosure(ctx, async () => { throw new Error("OpenRouter returned HTTP 429."); });
    await reviewClosure(ctx, "We are not moving forward.", async () => { throw "sensitive"; });
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(warnings, [
    ["closure AI draft failed:", "OpenRouter returned HTTP 429."],
    ["closure AI review failed:", "unknown error"],
  ]);
});

test("hard rules block a missing new date and links whatever the model says", async () => {
  const clean: Chat = async () => "{\"flags\":[]}";
  assert.equal((await reviewClosure(deciding, "We are still deciding.", clean)).blocking.length, 1);
  assert.equal((await reviewClosure(deciding, "We are still deciding and will reply by 2026-10-30.", clean)).blocking.length, 1);
  assert.deepEqual(await reviewClosure(deciding, "We are still deciding and will reply by 2026-10-30 12:00 UTC.", clean),
    { source: "ai", model: "nvidia/nemotron-3.5-super-vl:free", flags: [], blocking: [] });
  for (const wrong of ["We will reply by 2026-10-30 11:00 UTC. Our office opens at 12:00.", "We will reply by 2026-10-30 12:00.",
    "We will reply by 2026-10-30 12:00 UTC or 2026-10-30 11:00 UTC."]) assert.equal(blockingFlags(deciding, wrong).length, 1, wrong);
  assert.equal(blockingFlags(deciding, "We will reply by 2026-10-30 12:00 UTC, which is 2026-10-30T12:00 in ISO form.").length, 0);
  assert.equal(blockingFlags(ctx, "See https://example.com").length, 1);
  assert.equal(blockingFlags(ctx, "Write to hr@example.com").length, 1);
  const standard = await reviewClosure(deciding, fixedClosureMessage("still_deciding", deciding.newDeadline), async () => { throw new Error("unused"); });
  assert.deepEqual(standard, { source: "fixed", flags: [], blocking: [] });
});

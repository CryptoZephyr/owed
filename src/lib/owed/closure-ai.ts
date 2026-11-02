import "server-only";
import { z } from "zod";
import { deadlineText, fixedClosureMessage, mentionsDeadline, normalizeDeadlineMentions } from "./domain";
import type { ClosureStatus } from "./domain";

export type ClosureContext = { status: ClosureStatus; title: string; employerName: string; deadline?: Date; newDeadline?: Date };
export type Review = { source: "ai" | "fixed" | "unavailable"; model?: string; flags: string[]; blocking: string[]; draftUnavailable?: true };
export type Chat = (system: string, user: string) => Promise<string>;

export const closureModel = (): string => process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

const rules = "Owed sends closure messages to job candidates after an interview. A closure message tells the candidate one status and nothing else. "
  + "It never gives reasons or feedback, never compares the candidate with others, never promises future roles or outcomes, and never mentions age, "
  + "gender, race, ethnicity, religion, disability, health, pregnancy, family, nationality or any other personal characteristic. It is polite, plain "
  + "and under 120 words, does not use the candidate's name, and contains no links, email addresses or phone numbers.";

const labels: Record<ClosureStatus, string> = {
  moving_forward: "moving forward with the application",
  not_moving_forward: "not moving forward with the application",
  still_deciding: "still deciding",
};

function describe(ctx: ClosureContext): string {
  const cutoff = ctx.newDeadline && deadlineText(ctx.newDeadline);
  return [`Status: ${labels[ctx.status]}.`, `Role: ${ctx.title} at ${ctx.employerName}.`,
    ctx.status === "still_deciding" && cutoff ? `The team will send a final status by ${cutoff}. The message must state this exact cutoff, written as ${cutoff}.` : undefined,
  ].filter(Boolean).join("\n");
}

export async function openRouterChat(system: string, user: string): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set.");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Owed" },
    body: JSON.stringify({ model: closureModel(), temperature: 0.2, max_tokens: 2000, reasoning: { effort: "low" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!response.ok) throw new Error(`OpenRouter returned HTTP ${response.status}.`);
  const body = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1) }).parse(await response.json());
  return body.choices[0]!.message.content ?? "";
}

function parse<T>(text: string, schema: z.ZodType<T>): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model did not return JSON.");
  return schema.parse(JSON.parse(text.slice(start, end + 1)));
}

export function blockingFlags(ctx: ClosureContext, message: string): string[] {
  const flags: string[] = [];
  if (ctx.status === "still_deciding" && ctx.newDeadline && !mentionsDeadline(message, ctx.newDeadline)) {
    flags.push(`State the new deadline ${deadlineText(ctx.newDeadline)} in the message.`);
  }
  if (/https?:\/\/|www\.|@/i.test(message)) flags.push("Remove links and email addresses.");
  return flags;
}

export async function reviewClosure(ctx: ClosureContext, message: string, chat: Chat = openRouterChat): Promise<Review> {
  const blocking = blockingFlags(ctx, message);
  if (message === fixedClosureMessage(ctx.status, ctx.newDeadline)) return { source: "fixed", flags: [], blocking };
  try {
    const out = parse(await chat(`${rules} Review the draft below against these rules. Also flag it if it does not clearly state the given status, or states a different one. `
      + "Reply only with JSON {\"flags\": string[]}, one short sentence per problem, quoting the risky wording. Use an empty array if the draft follows every rule.",
    `${describe(ctx)}\nDraft:\n${message}`), z.object({ flags: z.array(z.string().trim().min(1).max(300)).max(10) }));
    return { source: "ai", model: closureModel(), flags: out.flags, blocking };
  } catch (error) {
    console.warn("closure AI review failed:", errorMessage(error));
    return { source: "unavailable", flags: [], blocking: [...blocking, "The AI review is unavailable right now. Send Owed's standard message or try again later."] };
  }
}

export async function draftClosure(ctx: ClosureContext, chat: Chat = openRouterChat): Promise<{ message: string; review: Review }> {
  try {
    const out = parse(await chat(`${rules} Write the message. Reply only with JSON {"message": string}.`, describe(ctx)),
      z.object({ message: z.string().trim().min(1).max(1200) }));
    const review = await reviewClosure(ctx, out.message, chat);
    const deadline = ctx.newDeadline ?? ctx.deadline;
    const message = deadline ? normalizeDeadlineMentions(out.message, deadline) : out.message;
    return { message, review };
  } catch (error) {
    console.warn("closure AI draft failed:", errorMessage(error));
    return { message: fixedClosureMessage(ctx.status, ctx.newDeadline), review: { source: "fixed", flags: [], blocking: [], draftUnavailable: true } };
  }
}

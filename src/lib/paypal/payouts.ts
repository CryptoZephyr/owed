import "server-only";
import { z } from "zod";
import { toCents, usd } from "@/lib/money";
import { PayPalRestError, paypalRest } from "./rest";
import { paypalApiBase } from "./sdk";

export function duplicatePayoutBatch(error: unknown): string | undefined {
  if (!(error instanceof PayPalRestError) || error.status !== 400) return;
  let body: unknown;
  try { body = JSON.parse(error.body); } catch { return; }
  const duplicate = z.object({
    name: z.literal("USER_BUSINESS_ERROR"),
    details: z.array(z.object({ field: z.string(), issue: z.string(), link: z.array(z.object({ href: z.string(), rel: z.string().optional(), method: z.string().optional() })).optional() })),
  }).safeParse(body);
  if (!duplicate.success) return;
  for (const detail of duplicate.data.details) {
    if (detail.field !== "SENDER_BATCH_ID" || detail.issue !== "Batch with given sender_batch_id already exists") continue;
    for (const link of detail.link ?? []) {
      let url: URL;
      try { url = new URL(link.href); } catch { continue; }
      const match = /^\/v1\/payments\/payouts\/([A-Z0-9]+)$/.exec(url.pathname);
      if (url.origin === paypalApiBase() && !url.username && !url.password && !url.search && !url.hash && match && (!link.method || link.method === "GET")) return match[1];
    }
  }
}

const createdBatchSchema = z.object({
  batch_header: z.object({
    payout_batch_id: z.string(),
    batch_status: z.string(),
  }),
});

const batchSchema = z.object({
  batch_header: z.object({
    payout_batch_id: z.string(),
    batch_status: z.string(),
  }),
  items: z
    .array(
      z.object({
        payout_item_id: z.string(),
        transaction_status: z.string(),
        payout_item: z.object({
          sender_item_id: z.string().optional(),
          amount: z.object({ value: z.string(), currency: z.string() }),
        }),
        payout_item_fee: z.object({ value: z.string() }).optional(),
        errors: z.object({ name: z.string() }).optional(),
      }),
    )
    .default([]),
});

export type PayoutItemStatus = {
  payoutItemId: string;
  guaranteeId: string | undefined;
  status: string;
  amountCents: number;
  feeCents: number | undefined;
  errorName: string | undefined;
};

export async function payCandidate(input: {
  guaranteeId: string;
  payerId: string;
  amountCents: number;
  employerName: string;
}): Promise<{ batchId: string; status: string }> {
  const amount = usd(input.amountCents);
  try {
    const created = createdBatchSchema.parse(
    await paypalRest("/v1/payments/payouts", {
      method: "POST",
      body: {
        sender_batch_header: {
          sender_batch_id: `owed-${input.guaranteeId}`,
          email_subject: `${input.employerName} didn't get back to you`,
          email_message: `${input.employerName} missed the date they promised to reply by. Here's $${amount.value} for your time.`,
        },
        items: [
          {
            recipient_type: "PAYPAL_ID",
            receiver: input.payerId,
            amount: { value: amount.value, currency: amount.currencyCode },
            note: `Owed guarantee from ${input.employerName}`,
            sender_item_id: input.guaranteeId,
          },
        ],
      },
    }),
  );
    return { batchId: created.batch_header.payout_batch_id, status: created.batch_header.batch_status };
  } catch (error) {
    const batchId = duplicatePayoutBatch(error);
    if (!batchId) throw error;
    return { batchId, status: "PENDING" };
  }
}

export async function getPayoutBatch(batchId: string): Promise<{ status: string; items: PayoutItemStatus[] }> {
  const batch = batchSchema.parse(await paypalRest(`/v1/payments/payouts/${encodeURIComponent(batchId)}`));
  return {
    status: batch.batch_header.batch_status,
    items: batch.items.map((item) => ({
      payoutItemId: item.payout_item_id,
      guaranteeId: item.payout_item.sender_item_id,
      status: item.transaction_status,
      amountCents: toCents(item.payout_item.amount.value),
      feeCents: item.payout_item_fee ? toCents(item.payout_item_fee.value) : undefined,
      errorName: item.errors?.name,
    })),
  };
}

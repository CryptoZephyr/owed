import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { paypalRest } from "./rest";

const verificationSchema = z.object({ verification_status: z.string() });

const signatureHeaders = {
  auth_algo: "paypal-auth-algo",
  cert_url: "paypal-cert-url",
  transmission_id: "paypal-transmission-id",
  transmission_sig: "paypal-transmission-sig",
  transmission_time: "paypal-transmission-time",
} as const;

export async function verifyPayPalWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = env().PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new Error("PAYPAL_WEBHOOK_ID is not set, so webhook signatures cannot be verified");
  }
  const signature: Record<string, string> = {};
  for (const [field, header] of Object.entries(signatureHeaders)) {
    const value = headers.get(header);
    if (!value) {
      return false;
    }
    signature[field] = value;
  }
  const result = verificationSchema.parse(
    await paypalRest("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: { ...signature, webhook_id: webhookId, webhook_event: JSON.parse(rawBody) as unknown },
    }),
  );
  return result.verification_status === "SUCCESS";
}

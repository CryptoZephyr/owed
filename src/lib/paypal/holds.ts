import "server-only";
import {
  CheckoutPaymentIntent,
  PayPalExperienceUserAction,
  PayPalWalletContextShippingPreference,
  PaypalError,
} from "paypal";
import type { PaymentAuthorization, PaypalClient } from "paypal";
import { z } from "zod";
import { toCents, usd } from "@/lib/money";
import { paypal, paypalWebBase } from "./sdk";

export type HoldSnapshot = {
  authorizationId: string;
  status: string;
  amountCents: number;
  expiresAt: string | undefined;
};

const paymentSchema = z.object({
  id: z.string().min(1), status: z.string().min(1),
  amount: z.object({ currencyCode: z.literal("USD"), value: z.string() }),
  expirationTime: z.string().optional(),
});

export function snapshot(raw: PaymentAuthorization): HoldSnapshot {
  const authorization = paymentSchema.parse(raw);
  return {
    authorizationId: authorization.id,
    status: authorization.status,
    amountCents: toCents(authorization.amount.value),
    expiresAt: authorization.expirationTime,
  };
}

export async function createRoleHold(input: {
  roleId: string;
  amountCents: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}, client: PaypalClient = paypal()): Promise<{ orderId: string; approveUrl: string }> {
  const order = await client.orders.createOrder({
    payPalRequestId: `owed-role-hold-${input.roleId}`,
    prefer: "return=representation",
    body: {
      intent: CheckoutPaymentIntent.Authorize,
      purchaseUnits: [
        {
          customId: input.roleId,
          description: input.description,
          amount: usd(input.amountCents),
        },
      ],
      paymentSource: {
        paypal: {
          experienceContext: {
            brandName: "Owed",
            shippingPreference: PayPalWalletContextShippingPreference.NoShipping,
            userAction: PayPalExperienceUserAction.PayNow,
            returnUrl: input.returnUrl,
            cancelUrl: input.cancelUrl,
          },
        },
      },
    },
  }, { signal: AbortSignal.timeout(15_000) });
  const approveUrl = order.links?.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href;
  const result = z.object({ orderId: z.string().min(1), approveUrl: z.url() }).parse({ orderId: order.id, approveUrl });
  const approval = new URL(result.approveUrl);
  if (approval.origin !== paypalWebBase() || approval.username || approval.password) {
    throw new z.ZodError([{ code: "custom", path: ["approveUrl"], message: "Unexpected PayPal approval host" }]);
  }
  return result;
}

export async function authorizeRoleHold(orderId: string, client: PaypalClient = paypal()): Promise<{
  hold: HoldSnapshot;
  payerId: string | undefined;
  payerEmail: string | undefined;
}> {
  const result = await client.orders.authorizeOrder({
    id: orderId,
    payPalRequestId: `owed-authorize-${orderId}`,
    prefer: "return=representation",
  }, { signal: AbortSignal.timeout(15_000) });
  const authorization = result.purchaseUnits?.[0]?.payments?.authorizations?.[0];
  return {
    hold: snapshot(authorization ?? {}),
    payerId: result.payer?.payerId ?? result.paymentSource?.paypal?.accountId,
    payerEmail: result.payer?.emailAddress,
  };
}

export async function chargeGuarantee(input: {
  authorizationId: string;
  guaranteeId: string;
  amountCents: number;
  finalCapture: boolean;
}, client: PaypalClient = paypal()): Promise<{ captureId: string; status: string; amountCents: number; paypalFeeCents: number | undefined }> {
  const capture = await client.payments.captureAuthorizedPayment({
    authorizationId: input.authorizationId,
    payPalRequestId: `owed-charge-${input.guaranteeId}`,
    prefer: "return=representation",
    body: { amount: usd(input.amountCents), finalCapture: input.finalCapture },
  }, { signal: AbortSignal.timeout(15_000) });
  const valid = paymentSchema.parse(capture);
  const fee = capture.sellerReceivableBreakdown?.paypalFee?.value;
  return {
    captureId: valid.id,
    status: valid.status,
    amountCents: toCents(valid.amount.value),
    paypalFeeCents: fee === undefined ? undefined : toCents(fee),
  };
}

export async function releaseHold(input: { authorizationId: string; roleId: string }, client: PaypalClient = paypal()): Promise<HoldSnapshot> {
  try {
    await client.payments.voidPayment({
    authorizationId: input.authorizationId,
    payPalRequestId: `owed-release-${input.roleId}-${input.authorizationId}`,
    prefer: "return=representation",
  }, { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    if (!(error instanceof PaypalError) || error.kind !== "decode" || error.status !== 204) throw error;
  }
  return getHold(input.authorizationId, client);
}

export async function renewHold(authorizationId: string, client: PaypalClient = paypal()): Promise<HoldSnapshot> {
  const authorization = await client.payments.reauthorizePayment({
    authorizationId,
    payPalRequestId: `owed-renew-${authorizationId}`,
    prefer: "return=representation",
  }, { signal: AbortSignal.timeout(15_000) });
  return snapshot(authorization);
}

export async function getHold(authorizationId: string, client: PaypalClient = paypal()): Promise<HoldSnapshot> {
  return snapshot(await client.payments.getAuthorizedPayment({ authorizationId }, { signal: AbortSignal.timeout(15_000) }));
}

export async function getCapture(captureId: string, client: PaypalClient = paypal()): Promise<{ captureId: string; status: string; amountCents: number }> {
  const capture = paymentSchema.parse(await client.payments.getCapturedPayment({ captureId }, { signal: AbortSignal.timeout(15_000) }));
  return { captureId: capture.id, status: capture.status, amountCents: toCents(capture.amount.value) };
}

export async function getOrderHold(orderId: string, client: PaypalClient = paypal()): Promise<{ hold: HoldSnapshot; payerId: string | undefined } | null> {
  const order = await client.orders.getOrder({ id: orderId }, { signal: AbortSignal.timeout(15_000) });
  const hold = order.purchaseUnits?.[0]?.payments?.authorizations?.[0];
  return hold ? { hold: snapshot(hold), payerId: order.payer?.payerId ?? order.paymentSource?.paypal?.accountId } : null;
}

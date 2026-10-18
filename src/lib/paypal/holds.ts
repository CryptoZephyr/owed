import "server-only";
import {
  CheckoutPaymentIntent,
  PayPalExperienceUserAction,
  PayPalWalletContextShippingPreference,
} from "paypal";
import type { PaymentAuthorization } from "paypal";
import { toCents, usd } from "@/lib/money";
import { paypal } from "./sdk";

export type HoldSnapshot = {
  authorizationId: string;
  status: string;
  amountCents: number;
  expiresAt: string | undefined;
};

function snapshot(authorization: PaymentAuthorization): HoldSnapshot {
  if (!authorization.id || !authorization.status || !authorization.amount) {
    throw new Error("PayPal returned an authorization without id, status or amount");
  }
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
}): Promise<{ orderId: string; approveUrl: string }> {
  const order = await paypal().orders.createOrder({
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
  });
  const approveUrl = order.links?.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href;
  if (!order.id || !approveUrl) {
    throw new Error("PayPal did not return an order id and approval link");
  }
  return { orderId: order.id, approveUrl };
}

export async function authorizeRoleHold(orderId: string): Promise<{
  hold: HoldSnapshot;
  payerId: string | undefined;
  payerEmail: string | undefined;
}> {
  const result = await paypal().orders.authorizeOrder({
    id: orderId,
    payPalRequestId: `owed-authorize-${orderId}`,
    prefer: "return=representation",
  });
  const authorization = result.purchaseUnits?.[0]?.payments?.authorizations?.[0];
  if (!authorization) {
    throw new Error(`PayPal returned no authorization for order ${orderId}`);
  }
  return {
    hold: snapshot(authorization),
    payerId: result.payer?.payerId,
    payerEmail: result.payer?.emailAddress,
  };
}

export async function chargeGuarantee(input: {
  authorizationId: string;
  guaranteeId: string;
  amountCents: number;
  finalCapture: boolean;
}): Promise<{ captureId: string; status: string; amountCents: number; paypalFeeCents: number | undefined }> {
  const capture = await paypal().payments.captureAuthorizedPayment({
    authorizationId: input.authorizationId,
    payPalRequestId: `owed-charge-${input.guaranteeId}`,
    prefer: "return=representation",
    body: { amount: usd(input.amountCents), finalCapture: input.finalCapture },
  });
  if (!capture.id || !capture.status || !capture.amount) {
    throw new Error("PayPal returned a capture without id, status or amount");
  }
  const fee = capture.sellerReceivableBreakdown?.paypalFee?.value;
  return {
    captureId: capture.id,
    status: capture.status,
    amountCents: toCents(capture.amount.value),
    paypalFeeCents: fee === undefined ? undefined : toCents(fee),
  };
}

export async function releaseHold(input: { authorizationId: string; roleId: string }): Promise<HoldSnapshot> {
  const authorization = await paypal().payments.voidPayment({
    authorizationId: input.authorizationId,
    payPalRequestId: `owed-release-${input.roleId}-${input.authorizationId}`,
    prefer: "return=representation",
  });
  return snapshot(authorization);
}

export async function renewHold(authorizationId: string): Promise<HoldSnapshot> {
  const authorization = await paypal().payments.reauthorizePayment({
    authorizationId,
    payPalRequestId: `owed-renew-${authorizationId}`,
    prefer: "return=representation",
  });
  return snapshot(authorization);
}

export async function getHold(authorizationId: string): Promise<HoldSnapshot> {
  return snapshot(await paypal().payments.getAuthorizedPayment({ authorizationId }));
}

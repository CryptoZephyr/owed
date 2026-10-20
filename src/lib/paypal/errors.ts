import "server-only";
import { PaypalError } from "paypal";
import { z } from "zod";
import { PayPalRestConnectionError, PayPalRestError } from "./rest";

export type PayPalFailure =
  | { kind: "rejected"; status: number; reason: string; debugId: string | undefined }
  | { kind: "credentials"; sent: boolean; debugId: string | undefined }
  | { kind: "rate_limited"; debugId: string | undefined }
  | { kind: "provider_error"; status: number; debugId: string | undefined }
  | { kind: "unknown_outcome"; cause: string }
  | { kind: "unreachable"; cause: string }
  | { kind: "integration_defect"; cause: string };

const errorBodySchema = z.looseObject({
  message: z.string().optional(),
  debugId: z.string().optional(),
  debug_id: z.string().optional(),
  details: z.array(z.looseObject({ issue: z.string().optional(), description: z.string().optional() })).optional(),
});

function readBody(raw: unknown): { reason: string | undefined; debugId: string | undefined } {
  const parsed = errorBodySchema.safeParse(raw);
  if (!parsed.success) {
    return { reason: undefined, debugId: undefined };
  }
  const detail = parsed.data.details?.[0];
  const detailText = detail ? [detail.issue, detail.description].filter(Boolean).join(": ") : "";
  return {
    reason: detailText || parsed.data.message,
    debugId: parsed.data.debugId ?? parsed.data.debug_id,
  };
}

function parseText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function byStatus(status: number, raw: unknown): PayPalFailure {
  const { reason, debugId } = readBody(raw);
  if (status === 401 || status === 403) {
    return { kind: "credentials", sent: true, debugId };
  }
  if (status === 429) {
    return { kind: "rate_limited", debugId };
  }
  if (status >= 400 && status < 500) {
    return { kind: "rejected", status, reason: reason ?? "PayPal rejected the request.", debugId };
  }
  return { kind: "provider_error", status, debugId };
}

export function translatePayPalFailure(err: unknown, context: { write: boolean }): PayPalFailure {
  if (err instanceof DOMException && ["AbortError", "TimeoutError"].includes(err.name)) {
    return context.write ? { kind: "unknown_outcome", cause: "PayPal call deadline exceeded" } : { kind: "unreachable", cause: "PayPal call deadline exceeded" };
  }
  if (err instanceof PaypalError) {
    switch (err.kind) {
      case "api": {
        const payload: object = err.payload;
        const raw =
          "body" in payload
            ? payload.body
            : "rawBody" in payload && payload.rawBody instanceof ArrayBuffer
              ? parseText(new TextDecoder().decode(payload.rawBody))
              : undefined;
        return byStatus(err.status, raw);
      }
      case "decode":
        if (err.status >= 200 && err.status < 300) {
          return context.write
            ? { kind: "unknown_outcome", cause: "PayPal answered but the response could not be read" }
            : { kind: "provider_error", status: err.status, debugId: undefined };
        }
        return byStatus(err.status, undefined);
      case "connection":
      case "timeout":
        return context.write
          ? { kind: "unknown_outcome", cause: `PayPal ${err.kind} failure` }
          : { kind: "unreachable", cause: `PayPal ${err.kind} failure` };
      case "auth":
        return { kind: "credentials", sent: false, debugId: undefined };
      case "encode":
        return { kind: "integration_defect", cause: err.message };
    }
  }
  if (err instanceof PayPalRestError) {
    return byStatus(err.status, parseText(err.body));
  }
  if (err instanceof PayPalRestConnectionError) {
    return context.write
      ? { kind: "unknown_outcome", cause: "PayPal could not be reached" }
      : { kind: "unreachable", cause: "PayPal could not be reached" };
  }
  if (err instanceof z.ZodError) {
    return context.write
      ? { kind: "unknown_outcome", cause: "PayPal answered with an unexpected shape" }
      : { kind: "provider_error", status: 200, debugId: undefined };
  }
  throw err;
}

export function httpResponseFor(failure: PayPalFailure): { status: number; message: string } {
  switch (failure.kind) {
    case "rejected":
      return { status: failure.status, message: failure.reason };
    case "credentials":
      return { status: 502, message: "PayPal rejected Owed's credentials." };
    case "rate_limited":
      return { status: 503, message: "PayPal is rate limiting Owed. Try again shortly." };
    case "provider_error":
      return { status: 502, message: "PayPal is having trouble right now." };
    case "unknown_outcome":
      return { status: 202, message: "Outcome unknown. Owed is checking with PayPal." };
    case "unreachable":
      return { status: 502, message: "PayPal could not be reached." };
    case "integration_defect":
      return { status: 500, message: "Owed sent PayPal an invalid request." };
  }
}

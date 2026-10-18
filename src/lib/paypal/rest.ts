import "server-only";
import { env } from "@/lib/env";
import { paypalApiBase } from "./sdk";

export class PayPalRestError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly debugId: string | undefined,
  ) {
    super(`PayPal REST call failed with status ${status}${debugId ? ` (debug id ${debugId})` : ""}`);
    this.name = "PayPalRestError";
  }
}

export class PayPalRestConnectionError extends Error {
  constructor(cause: unknown) {
    super("PayPal could not be reached", { cause });
    this.name = "PayPalRestConnectionError";
  }
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch (cause) {
    throw new PayPalRestConnectionError(cause);
  }
}

export function basicAuth(): string {
  return Buffer.from(`${env().PAYPAL_CLIENT_ID}:${env().PAYPAL_CLIENT_SECRET}`).toString("base64");
}

let appToken: { value: string; expiresAt: number } | undefined;

export async function postForm<T>(path: string, form: Record<string, string>): Promise<T> {
  const response = await send(`${paypalApiBase()}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth()}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new PayPalRestError(response.status, text, response.headers.get("paypal-debug-id") ?? undefined);
  }
  return JSON.parse(text) as T;
}

async function appAccessToken(): Promise<string> {
  if (appToken && appToken.expiresAt > Date.now() + 60_000) {
    return appToken.value;
  }
  const token = await postForm<{ access_token: string; expires_in: number }>("/v1/oauth2/token", {
    grant_type: "client_credentials",
  });
  appToken = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  return appToken.value;
}

type RestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  requestId?: string;
  accessToken?: string;
};

export async function paypalRest<T>(path: string, options: RestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.accessToken ?? (await appAccessToken())}`,
    Accept: "application/json",
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.requestId) {
    headers["PayPal-Request-Id"] = options.requestId;
  }
  const response = await send(`${paypalApiBase()}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? null : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new PayPalRestError(response.status, text, response.headers.get("paypal-debug-id") ?? undefined);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

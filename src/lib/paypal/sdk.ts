import "server-only";
import { PaypalClient } from "paypal";
import type { ClientOptions } from "paypal";
import { env } from "@/lib/env";

const apiBases = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

const webBases = {
  sandbox: "https://www.sandbox.paypal.com",
  live: "https://www.paypal.com",
} as const;

export function paypalApiBase(): string {
  return apiBases[env().PAYPAL_ENVIRONMENT];
}

export function paypalWebBase(): string {
  return webBases[env().PAYPAL_ENVIRONMENT];
}

let client: PaypalClient | undefined;

export function createPayPalClient(fetch?: ClientOptions["fetch"]): PaypalClient {
  return new PaypalClient({
    fetch,
    serverOptions: { baseUrl: paypalApiBase() },
    retry: { timeout: 10_000 },
    logging: { level: "off", logRequestBody: false },
    oauth2: { clientId: env().PAYPAL_CLIENT_ID, clientSecret: env().PAYPAL_CLIENT_SECRET },
  });
}

export function paypal(): PaypalClient {
  client ??= createPayPalClient();
  return client;
}

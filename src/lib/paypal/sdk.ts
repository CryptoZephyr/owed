import "server-only";
import { PaypalClient } from "paypal";
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

export function paypal(): PaypalClient {
  client ??= new PaypalClient({
    serverOptions: { baseUrl: paypalApiBase() },
    retry: { timeout: 10_000 },
    oauth2: { clientId: env().PAYPAL_CLIENT_ID, clientSecret: env().PAYPAL_CLIENT_SECRET },
  });
  return client;
}

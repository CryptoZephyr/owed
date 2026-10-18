import "server-only";
import { z } from "zod";

const schema = z
  .object({
    PAYPAL_ENVIRONMENT: z.enum(["sandbox", "live"]).default("sandbox"),
    PAYPAL_ALLOW_LIVE: z.enum(["true", "false"]).default("false"),
    PAYPAL_CLIENT_ID: z.string().min(1),
    PAYPAL_CLIENT_SECRET: z.string().min(1),
    PAYPAL_WEBHOOK_ID: z.string().min(1).optional(),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    APP_URL: z.url().default("http://localhost:3000"),
  })
  .refine((value) => value.PAYPAL_ENVIRONMENT === "sandbox" || value.PAYPAL_ALLOW_LIVE === "true", {
    message: "Live PayPal is disabled. Set PAYPAL_ALLOW_LIVE=true only when you intend to move real money.",
    path: ["PAYPAL_ENVIRONMENT"],
  });

export type Env = z.infer<typeof schema>;

let parsed: Env | undefined;

export function env(): Env {
  parsed ??= schema.parse(process.env);
  return parsed;
}

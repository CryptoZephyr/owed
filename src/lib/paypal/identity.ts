import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { paypalRest, postForm } from "./rest";
import { paypalWebBase } from "./sdk";

const loginScopes = ["openid", "profile", "email", "https://uri.paypal.com/services/paypalattributes"];

const userTokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });

const profileSchema = z.object({
  user_id: z.string().min(1),
  name: z.string().optional(),
  email: z.string().optional(),
  emails: z.array(z.object({ value: z.string(), primary: z.boolean().optional() })).optional(),
  payer_id: z.string().min(1),
  verified_account: z.union([z.boolean(), z.string()]).optional(),
});

export type PayPalProfile = {
  userId: string;
  payerId: string;
  name: string | undefined;
  email: string | undefined;
  verified: boolean;
};

export function payPalLoginUrl(input: { state: string; redirectUri: string }): string {
  const params = new URLSearchParams({
    flowEntry: "static",
    client_id: env().PAYPAL_CLIENT_ID,
    response_type: "code",
    scope: loginScopes.join(" "),
    redirect_uri: input.redirectUri,
    state: input.state,
  });
  return `${paypalWebBase()}/connect?${params.toString()}`;
}

export async function payPalProfileFromCode(code: string): Promise<PayPalProfile> {
  const token = userTokenSchema.parse(await postForm("/v1/oauth2/token", { grant_type: "authorization_code", code }));
  const profile = profileSchema.parse(
    await paypalRest("/v1/identity/openidconnect/userinfo?schema=openid", { accessToken: token.access_token }),
  );
  const primaryEmail = profile.emails?.find((entry) => entry.primary)?.value ?? profile.emails?.[0]?.value ?? profile.email;
  return {
    userId: profile.user_id,
    payerId: profile.payer_id,
    name: profile.name,
    email: primaryEmail,
    verified: profile.verified_account === true || profile.verified_account === "true",
  };
}

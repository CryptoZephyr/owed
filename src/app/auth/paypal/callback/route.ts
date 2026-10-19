import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { appOrigin, consumeLoginState, localPath, login } from "@/lib/owed/auth";
import { payPalProfileFromCode } from "@/lib/paypal/identity";
import { httpResponseFor, translatePayPalFailure } from "@/lib/paypal/errors";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const jar = await cookies();
  const expected = jar.get("owed_login_state")?.value;
  const state = request.nextUrl.searchParams.get("state");
  jar.delete("owed_login_state");
  if (!expected || !state || Buffer.byteLength(expected) !== Buffer.byteLength(state) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(state))) {
    return NextResponse.json({ error: "Invalid or expired login state." }, { status: 400 });
  }
  const returnTo = await consumeLoginState(state);
  const code = request.nextUrl.searchParams.get("code");
  if (!returnTo || !code) return NextResponse.redirect(`${appOrigin()}/?error=PayPal+login+was+canceled+or+expired.`);
  try { await login(await payPalProfileFromCode(code)); }
  catch (error) {
    const failure = httpResponseFor(translatePayPalFailure(error, { write: false }));
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
  const response = NextResponse.redirect(`${appOrigin()}${localPath(returnTo)}`);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

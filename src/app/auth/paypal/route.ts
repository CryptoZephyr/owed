import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { appOrigin, cookieOptions, localPath, newLoginState } from "@/lib/owed/auth";
import { payPalLoginUrl } from "@/lib/paypal/identity";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const state = await newLoginState(localPath(request.nextUrl.searchParams.get("returnTo")));
  (await cookies()).set("owed_login_state", state, { ...cookieOptions(), maxAge: 600 });
  return NextResponse.redirect(payPalLoginUrl({ state, redirectUri: `${appOrigin()}/auth/paypal/callback` }));
}

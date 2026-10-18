export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, paypalEnvironment: process.env.PAYPAL_ENVIRONMENT ?? "sandbox" });
}

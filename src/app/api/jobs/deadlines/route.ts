import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runWorker } from "@/lib/owed/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const actual = request.headers.get("authorization") ?? "";
  const hash = (value: string): Buffer => createHash("sha256").update(value).digest();
  if (!secret || secret.length < 32 || !timingSafeEqual(hash(actual), hash(`Bearer ${secret}`))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ processed: await runWorker(1) }, { headers: { "Cache-Control": "no-store" } });
}

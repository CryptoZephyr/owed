import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query, transaction } from "./db";
import { hashToken } from "./roles";
import type { Actor } from "./domain";
import type { PayPalProfile } from "../paypal/identity";

export function appOrigin(): string {
  const url = new URL(process.env.APP_URL ?? "http://localhost:3000");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("APP_URL must be an HTTPS origin, or HTTP localhost for development.");
  }
  return url.origin;
}

export function localPath(path: string | null): string {
  if (!path || !/^\/(employer|candidate|invite\/[-A-Za-z0-9_]+)(\/|$)/.test(path) || path.startsWith("//") || /[\\\r\n]/.test(path)) return "/candidate";
  return path;
}

export const cookieOptions = () => ({ httpOnly: true, secure: new URL(appOrigin()).protocol === "https:", sameSite: "lax" as const, path: "/" });

export async function actor(): Promise<Actor | null> {
  const token = (await cookies()).get("owed_session")?.value;
  if (!token) return null;
  return (await query<Actor>(`select c.id,c.payer_id,c.name,c.verified from owed.sessions s join owed.candidates c on c.id=s.candidate_id
    where s.token_hash=$1 and s.expires_at>now()`, [hashToken(token)]))[0] ?? null;
}

export async function requireActor(): Promise<Actor> {
  const user = await actor();
  if (!user) redirect("/");
  return user;
}

export async function newLoginState(returnTo: string): Promise<string> {
  const state = randomBytes(32).toString("base64url");
  await query("insert into owed.login_states (token_hash,return_to,expires_at) values ($1,$2,now()+interval '10 minutes')", [hashToken(state), localPath(returnTo)]);
  return state;
}

export async function consumeLoginState(state: string): Promise<string | null> {
  const rows = await query<{ return_to: string }>("delete from owed.login_states where token_hash=$1 and expires_at>now() returning return_to", [hashToken(state)]);
  return rows[0]?.return_to ?? null;
}

export async function login(profile: PayPalProfile): Promise<void> {
  const jar = await cookies();
  const oldToken = jar.get("owed_session")?.value;
  const token = randomBytes(32).toString("base64url");
  await transaction(async (db) => {
    const user = (await db.query<{ id: string }>(`insert into owed.candidates (paypal_user_id,payer_id,name,email,verified)
      values ($1,$2,$3,$4,$5) on conflict (paypal_user_id) do update set name=excluded.name,email=excluded.email,
      verified=excluded.verified where owed.candidates.payer_id=excluded.payer_id returning id`,
    [profile.userId, profile.payerId, profile.name ?? "PayPal member", profile.email, profile.verified])).rows[0];
    if (!user) throw new Error("PayPal account identity changed.");
    if (oldToken) await db.query("delete from owed.sessions where token_hash=$1", [hashToken(oldToken)]);
    await db.query("insert into owed.sessions (token_hash,candidate_id,expires_at) values ($1,$2,now()+interval '7 days')", [hashToken(token), user.id]);
  });
  jar.set("owed_session", token, { ...cookieOptions(), maxAge: 7 * 86400 });
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get("owed_session")?.value;
  if (token) await query("delete from owed.sessions where token_hash=$1", [hashToken(token)]);
  jar.delete("owed_session");
}

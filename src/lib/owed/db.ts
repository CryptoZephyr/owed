import "server-only";
import { Pool } from "pg";
import type { PoolClient, QueryResultRow } from "pg";

let pool: Pool | undefined;

export function database(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Owed's DATABASE_URL is required.");
    const url = new URL(connectionString);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (!local && url.searchParams.get("sslmode") !== "verify-full") {
      throw new Error("Owed requires sslmode=verify-full for hosted PostgreSQL.");
    }
    pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 20_000, connectionTimeoutMillis: 10_000 });
  }
  return pool;
}

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await database().query<T>(sql, params)).rows;
}

export async function transaction<T>(run: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await database().connect();
  try {
    await db.query("begin");
    const result = await run(db);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}

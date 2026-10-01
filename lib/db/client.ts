/**
 * Server-side Postgres access (local Postgres in development, Supabase later).
 * Never import this from a client component: DATABASE_URL is a server secret.
 */
import postgres from "postgres";

export type Sql = postgres.Sql;
/** A connection or an open transaction; both can run queries. */
export type Tx = postgres.Sql | postgres.TransactionSql;

const globalForDb = globalThis as unknown as { kiranaSql?: Sql };

export function createSql(url: string): Sql {
  // prepare:false keeps us compatible with Supabase's transaction pooler.
  return postgres(url, { max: 5, prepare: false, onnotice: () => {} });
}

/** Shared connection for the app. Reused across hot reloads in development. */
export function getSql(): Sql {
  if (globalForDb.kiranaSql) return globalForDb.kiranaSql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and set it.");
  globalForDb.kiranaSql = createSql(url);
  return globalForDb.kiranaSql;
}

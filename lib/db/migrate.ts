/** Applies supabase/migrations/*.sql in name order, once each. */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "./client";

export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

export async function migrate(sql: Sql, dir = MIGRATIONS_DIR): Promise<string[]> {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    applied.push(file);
  }
  return applied;
}

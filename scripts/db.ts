/**
 * Database CLI.
 *   npm run db:migrate   apply pending migrations
 *   npm run db:reset     migrate, then load the deterministic demo data
 */
import { createSql } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { resetDemo } from "@/lib/demo/reset";

async function main() {
  const command = process.argv[2];
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example).");
  const sql = createSql(url);
  try {
    const applied = await migrate(sql);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Migrations up to date.");
    if (command === "reset") {
      const t = Date.now();
      const s = await resetDemo(sql);
      console.log(`Demo reset in ${Date.now() - t} ms: ${s.products} products, ${s.customers} customers, ${s.bills} bills, Khata outstanding ₹${s.khataOutstandingPaise / 100}`);
    } else if (command !== "migrate") {
      throw new Error(`Unknown command "${command}". Use migrate or reset.`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

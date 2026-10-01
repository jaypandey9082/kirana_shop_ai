/**
 * Integration tests against a real Postgres database.
 * Run with: npm run test:db  (uses TEST_DATABASE_URL, default postgres:///kirana_test)
 * Skipped when TEST_DATABASE_URL is not set, so `npm run check` works without a database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { resetDemo } from "@/lib/demo/reset";

const url = process.env.TEST_DATABASE_URL;
const ANCHOR = new Date("2026-10-03T09:30:00Z");

describe.skipIf(!url)("database reset", () => {
  let sql: Sql;
  beforeAll(async () => {
    sql = createSql(url!);
    await migrate(sql);
    await resetDemo(sql, ANCHOR);
  });
  afterAll(async () => { await sql?.end(); });

  const snapshot = async () => {
    const [row] = await sql`
      select (select count(*)::int from products) products,
             (select count(*)::int from bills) bills,
             (select count(*)::int from stock_movements) movements,
             (select sum(balance_paise)::int from customer_balances) khata,
             (select stock from products where sku = 'DAI-001') milk,
             (select count(*)::int from events) events`;
    return row;
  };

  it("loads the known totals", async () => {
    const s = await snapshot();
    expect(s.products).toBe(60);
    expect(s.khata).toBe(1_164_000);
    expect(s.milk).toBe(8);
    expect(s.events).toBe(1);
  });

  it("restores exactly the same state after changes", async () => {
    const before = await snapshot();
    await sql`update products set stock = 0 where sku = 'DAI-001'`;
    await sql`insert into events (merchant_id, type, summary) select id, 'test.event', 'test' from merchants`;
    await resetDemo(sql, ANCHOR);
    expect(await snapshot()).toEqual(before);
  });

  it("keeps stock consistent with movements and bill totals with items", async () => {
    const [r] = await sql`
      select bool_and(p.stock = s.total) stock_ok
      from products p join (select product_id, sum(delta) total from stock_movements group by 1) s on s.product_id = p.id`;
    const [b] = await sql`
      select bool_and(b.total_paise = i.t) totals_ok
      from bills b join (select bill_id, sum(line_total_paise) t from bill_items group by 1) i on i.bill_id = b.id`;
    expect(r.stock_ok).toBe(true);
    expect(b.totals_ok).toBe(true);
  });

  it("rejects updates and deletes on the event log", async () => {
    await expect(sql`update events set summary = 'tampered'`).rejects.toThrow(/append-only/);
    await expect(sql`delete from events`).rejects.toThrow(/append-only/);
  });

  it("enforces money and stock constraints", async () => {
    await expect(sql`update products set stock = -1 where sku = 'DAI-001'`).rejects.toThrow();
    await expect(sql`update products set price_paise = 0 where sku = 'DAI-001'`).rejects.toThrow();
  });

  it("has row level security enabled on every app table", async () => {
    const rows = await sql`select relname, relrowsecurity from pg_class where relname in
      ('merchants','products','customers','bills','bill_items','payments','stock_movements','khata_entries','actions','events')`;
    expect(rows).toHaveLength(10);
    for (const r of rows) expect(r.relrowsecurity).toBe(true);
  });
});

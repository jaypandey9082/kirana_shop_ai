/** Section 7 checkpoint: known results from the deterministic seed; every insight has a source. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { resetDemo } from "@/lib/demo/reset";
import { getMerchantId } from "@/lib/bills";
import { forecastRunout, khataDues, lowStock, overdueDues, salesSummary, slowMovers } from "@/lib/insights";
import { istAt, istParts } from "@/lib/time";

const url = process.env.TEST_DATABASE_URL;
const NOW = new Date("2026-10-03T09:30:00Z"); // 3 Oct 2026, 15:00 IST

describe.skipIf(!url)("insight engine", () => {
  let sql: Sql;
  let m: string;
  beforeAll(async () => {
    sql = createSql(url!);
    await migrate(sql);
    await resetDemo(sql, NOW);
    m = await getMerchantId(sql);
  });
  afterAll(async () => { await sql?.end(); });

  it("sums today's sales exactly as the bill register does", async () => {
    const s = await salesSummary(sql, m, "today", NOW);
    const [ref] = await sql`select coalesce(sum(total_paise),0)::int t, count(*)::int n from bills
      where status in ('PAID','ON_CREDIT') and settled_at >= ${istAt(NOW, 0)} and settled_at < ${NOW}`;
    expect(s.totalPaise).toBe(ref.t);
    expect(s.bills).toBe(ref.n);
    expect(s.bills).toBeGreaterThan(10);
    expect(s.paidPaise + s.creditPaise).toBe(s.totalPaise);
    expect(s.topItems.length).toBe(3);
    expect(s.source).toContain(`${s.bills} bills`);
  });

  it("compares with the same weekday last week, up to the same time", async () => {
    const s = await salesSummary(sql, m, "today", NOW);
    const [ref] = await sql`select coalesce(sum(total_paise),0)::int t from bills
      where status in ('PAID','ON_CREDIT') and settled_at >= ${istAt(NOW, -7)} and settled_at < ${new Date(NOW.getTime() - 7 * 86_400_000)}`;
    expect(s.compareTotalPaise).toBe(ref.t);
    expect(s.changePct).toBe(Math.round(((s.totalPaise - ref.t) / ref.t) * 100));
  });

  it("lists low stock, including the staged toned milk", async () => {
    const r = await lowStock(sql, m);
    const milk = r.items.find((i) => i.sku === "DAI-001");
    expect(milk).toMatchObject({ stock: 8, reorderLevel: 20 });
    for (const i of r.items) expect(i.stock).toBeLessThan(i.reorderLevel);
    expect(r.source).toBeTruthy();
  });

  it("predicts toned milk runs out before tonight's close", async () => {
    const { items } = await forecastRunout(sql, m, NOW, "DAI-001");
    const milk = items[0];
    expect(milk.atRisk).toBe(true);
    expect(milk.expectedUntilRestock).toBeGreaterThan(8);
    expect(milk.typicalEvening).toBeGreaterThan(8);
    const out = new Date(milk.runsOutAt!);
    expect(out.getTime()).toBeGreaterThan(NOW.getTime());
    expect(istParts(out).hour).toBeLessThan(22);
    expect(new Date(milk.nextRestockAt).getTime()).toBe(istAt(NOW, 1, 7).getTime());
    expect(milk.source).toContain("7 din");
  });

  it("only returns at-risk items when no SKU is given", async () => {
    const { items } = await forecastRunout(sql, m, NOW);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.atRisk)).toBe(true);
    expect(items.some((i) => i.sku === "DAI-001")).toBe(true);
  });

  it("finds slow movers with long stock cover", async () => {
    const r = await slowMovers(sql, m, NOW);
    expect(r.items.length).toBeGreaterThan(0);
    for (const i of r.items) expect(i.daysOfCover === null || i.daysOfCover > 21).toBe(true);
    expect(r.source).toContain("14 din");
  });

  it("ages udhaar FIFO: 3 customers over 30 days owe ₹2,150; ₹11,640 outstanding in total", async () => {
    const r = await overdueDues(sql, m, NOW, 30);
    expect(r.items.map((i) => [i.name, i.balancePaise, i.daysOverdue])).toEqual([
      ["Ramesh K.", 98_000, 42], ["Sunita P.", 72_000, 35], ["Anil M.", 45_000, 31],
    ]);
    expect(r.totalPaise).toBe(215_000);
    expect(r.allOutstandingPaise).toBe(1_164_000);
    expect(r.summary).toContain("₹2,150");
  });

  it("treats payments as settling the oldest udhaar first", async () => {
    const [ramesh] = await sql`select id from customers where name = 'Ramesh K.'`;
    await sql`insert into khata_entries (customer_id, type, amount_paise, note, created_at) values (${ramesh.id}, 'credit', 38000, 'test', ${NOW})`;
    const dues = await khataDues(sql, m, NOW);
    const r = dues.find((d) => d.name === "Ramesh K.")!;
    expect(r.balancePaise).toBe(60_000);
    expect(r.daysOverdue).toBe(20); // the 42-day udhaar is now settled
    expect(r.bucket).toBe("16–30");
  });
});

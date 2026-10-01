/** Section 10 checkpoint: customer order and udhaar settlement flows work correctly. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { resetDemo } from "@/lib/demo/reset";
import { getMerchantId } from "@/lib/bills";
import { MockProvider } from "@/lib/payments/mock";
import { confirmPayment, startOnlinePayment } from "@/lib/payments/service";
import { advanceOrder, createOnlineOrder, getOrder, listOrders, storeCatalogue } from "@/lib/orders";
import { customerLedger, khataOverview, settleKhata } from "@/lib/khata";

const url = process.env.TEST_DATABASE_URL;
const NOW = new Date("2026-10-03T09:30:00Z");

describe.skipIf(!url)("storefront orders", () => {
  let sql: Sql;
  let m: string;
  let catalogue: Awaited<ReturnType<typeof storeCatalogue>>;
  beforeAll(async () => { sql = createSql(url!); await migrate(sql); });
  beforeEach(async () => { await resetDemo(sql, NOW); m = await getMerchantId(sql); catalogue = await storeCatalogue(sql, m); });
  afterAll(async () => { await sql?.end(); });
  const item = (name: string) => catalogue.find((p) => p.name === name)!;

  it("prices from the catalogue, joins the queue only after verified payment, then moves step by step", async () => {
    const bread = item("Bread 400g");
    const order = await createOnlineOrder(sql, m, { items: [{ productId: bread.id, qty: 2 }], name: "Asha", phone: "9876543210", mode: "pickup" });
    expect(order.totalPaise).toBe(2 * bread.pricePaise);
    let view = await getOrder(sql, order.billId);
    expect(view).toMatchObject({ status: "CONFIRMED", fulfilment: null, name: "Asha" });
    await expect(advanceOrder(sql, order.billId, "PREPARING")).rejects.toThrow(/not paid/);

    const pay = await startOnlinePayment(sql, order.billId, "http://localhost:3000");
    const mock = new MockProvider(sql);
    await mock.customerOutcome(pay.orderId, "success");
    expect((await confirmPayment(sql, pay.orderId, "callback", mock)).outcome).toBe("PAID");
    view = await getOrder(sql, order.billId);
    expect(view).toMatchObject({ status: "PAID", fulfilment: "RECEIVED" });
    const [{ stock }] = await sql`select stock from products where id = ${bread.id}`;
    expect(stock).toBe(bread.stock - 2);

    await expect(advanceOrder(sql, order.billId, "READY")).rejects.toThrow(/next step is preparing/);
    await advanceOrder(sql, order.billId, "PREPARING");
    await advanceOrder(sql, order.billId, "READY");
    expect((await advanceOrder(sql, order.billId, "COMPLETED")).fulfilment).toBe("COMPLETED");
    expect((await listOrders(sql, m)).some((o) => o.id === order.billId)).toBe(true);
  });

  it("refuses more than the shelf has, unknown products and delivery without address", async () => {
    const milk = item("Toned milk 500ml"); // 8 in stock
    await expect(createOnlineOrder(sql, m, { items: [{ productId: milk.id, qty: 9 }], name: "Asha", mode: "pickup" })).rejects.toThrow(/sirf 8 bache/);
    await expect(createOnlineOrder(sql, m, { items: [{ productId: "00000000-0000-4000-8000-000000000000", qty: 1 }], name: "Asha", mode: "pickup" })).rejects.toThrow(/no longer available/);
    await expect(createOnlineOrder(sql, m, { items: [{ productId: milk.id, qty: 1 }], name: "Asha", mode: "delivery" })).rejects.toThrow(/address/);
  });
});

describe.skipIf(!url)("Khata settlement", () => {
  let sql: Sql;
  let m: string;
  beforeAll(async () => { sql = createSql(url!); await migrate(sql); });
  beforeEach(async () => { await resetDemo(sql, NOW); m = await getMerchantId(sql); });
  afterAll(async () => { await sql?.end(); });

  it("shows ₹11,640 outstanding with ₹2,150 over 30 days", async () => {
    const k = await khataOverview(sql, m, NOW);
    expect(k.totalPaise).toBe(1_164_000);
    expect(k.buckets["30+"]).toBe(215_000);
    expect(k.customers).toHaveLength(14);
  });

  it("records a part payment, settles the oldest udhaar first and refuses overpayment", async () => {
    const [ramesh] = await sql`select id from customers where name = 'Ramesh K.'`;
    let l = await customerLedger(sql, m, ramesh.id, NOW);
    expect(l.balancePaise).toBe(98_000);
    await expect(settleKhata(sql, m, ramesh.id, 99_000, "cash")).rejects.toThrow(/Sirf ₹980 baaki/);
    await settleKhata(sql, m, ramesh.id, 38_000, "cash");
    const k = await khataOverview(sql, m, NOW);
    const r = k.customers.find((c) => c.customerId === ramesh.id)!;
    expect(r.balancePaise).toBe(60_000);
    expect(r.bucket).toBe("16–30"); // the 42-day udhaar is paid off
    expect(k.totalPaise).toBe(1_164_000 - 38_000);
    await settleKhata(sql, m, ramesh.id, 60_000, "upi");
    l = await customerLedger(sql, m, ramesh.id, NOW);
    expect(l.balancePaise).toBe(0);
    const [e] = await sql`select summary from events where type = 'khata.settled' order by id desc limit 1`;
    expect(e.summary).toContain("recorded by merchant");
  });
});

/** Distributor loop: approved reorder → purchase order → accept → "Maal aa gaya" (once) → supplier dues. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { resetDemo } from "@/lib/demo/reset";
import { getMerchantId } from "@/lib/bills";
import { askSalaahkaar } from "@/lib/salaahkaar/agent";
import { approveAction, markExecuted } from "@/lib/actions";
import { acceptOrder, listForMerchant, listForSupplier, markSupplierPaid, receiveOrder, rejectOrder, supplierDues } from "@/lib/purchases";

const url = process.env.TEST_DATABASE_URL;
const NOW = new Date("2026-10-03T09:30:00Z");

describe.skipIf(!url)("purchase orders", () => {
  let sql: Sql;
  let m: string;
  beforeAll(async () => { sql = createSql(url!); await migrate(sql); });
  beforeEach(async () => { await resetDemo(sql, NOW); m = await getMerchantId(sql); });
  afterAll(async () => { await sql?.end(); });

  const approvedReorder = async () => {
    const a = (await askSalaahkaar(sql, m, "kya khatam hone wala hai?", { now: NOW, env: {} })).actions[0];
    await approveAction(sql, a.id, "voice", {});
    return a;
  };
  const stockOf = async (productId: string) => (await sql`select stock from products where id = ${productId}`)[0].stock as number;

  it("creates nothing before approval and exactly one order per executed reorder", async () => {
    const a = (await askSalaahkaar(sql, m, "kya khatam hone wala hai?", { now: NOW, env: {} })).actions[0];
    expect(await listForMerchant(sql, m)).toHaveLength(0);
    await approveAction(sql, a.id, "tap", {});
    await Promise.all([markExecuted(sql, a.id, "n8n"), markExecuted(sql, a.id, "n8n")]);
    const orders = await listForMerchant(sql, m);
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("SENT");
    expect(orders[0].items[0].qtyOrdered).toBeGreaterThan(0);
    // The distributor sees it on their page.
    expect((await listForSupplier(sql, orders[0].supplierSlug)).map((o) => o.id)).toContain(orders[0].id);
  });

  it("accepts short quantities, then receives stock exactly once and records dues", async () => {
    await approvedReorder();
    const [po] = await listForMerchant(sql, m);
    const item = po.items[0];
    const before = await stockOf(item.productId);

    await expect(acceptOrder(sql, po.id, { eta: "Kal subah", items: [{ id: item.id, qty: item.qtyOrdered + 1 }] })).rejects.toThrow(/must be 0/);
    const accepted = await acceptOrder(sql, po.id, { eta: "Kal subah", items: [{ id: item.id, qty: item.qtyOrdered - 1 }] });
    expect(accepted.status).toBe("ACCEPTED");
    expect(accepted.totalPaise).toBe((item.qtyOrdered - 1) * item.unitCostPaise);

    const results = await Promise.all([receiveOrder(sql, po.id), receiveOrder(sql, po.id)]);
    expect(await stockOf(item.productId)).toBe(before + item.qtyOrdered - 1);
    expect(results.flatMap((r) => r.stock)).toHaveLength(1);
    const moves = await sql`select delta, reason from stock_movements where po_id = ${po.id}`;
    expect(moves).toEqual([{ delta: item.qtyOrdered - 1, reason: "restock" }]);

    expect((await supplierDues(sql, m)).totalPaise).toBe(accepted.totalPaise);
    await markSupplierPaid(sql, po.id);
    await markSupplierPaid(sql, po.id);
    expect((await supplierDues(sql, m)).totalPaise).toBe(0);

    const types = (await sql`select type from events where data->>'poId' = ${po.id} order by id`).map((e) => e.type);
    expect(types).toEqual(["po.sent", "po.accepted", "stock.received", "supplier.paid"]);
  });

  it("can receive without the distributor accepting (delivered offline)", async () => {
    await approvedReorder();
    const [po] = await listForMerchant(sql, m);
    const before = await stockOf(po.items[0].productId);
    await receiveOrder(sql, po.id);
    expect(await stockOf(po.items[0].productId)).toBe(before + po.items[0].qtyOrdered);
  });

  it("rejected orders can't be received, and paying needs received goods", async () => {
    await approvedReorder();
    const [po] = await listForMerchant(sql, m);
    await expect(markSupplierPaid(sql, po.id)).rejects.toThrow(/after the goods/);
    await rejectOrder(sql, po.id, "Stock nahi hai");
    await expect(receiveOrder(sql, po.id)).rejects.toThrow(/rejected/);
    await expect(acceptOrder(sql, po.id, { eta: "Aaj" })).rejects.toThrow(/already rejected/);
  });
});

/** Section 5 checkpoint: invalid payments rejected; duplicates can't double-update stock. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { resetDemo } from "@/lib/demo/reset";
import { addFromText, confirmBill, createDraftBill, getBill, getMerchantId } from "@/lib/bills";
import { MockProvider } from "@/lib/payments/mock";
import { confirmPayment, getPaymentStatus, listKhataCustomers, putOnCredit, recordCash, startOnlinePayment } from "@/lib/payments/service";
import type { PaymentProvider } from "@/lib/payments/types";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("payments and bill.paid", () => {
  let sql: Sql;
  let merchantId: string;
  let mock: MockProvider;

  beforeAll(async () => {
    sql = createSql(url!);
    await migrate(sql);
    mock = new MockProvider(sql);
  });
  // Every test starts from the same known shelf (reset is deterministic and ~0.5 s).
  beforeEach(async () => {
    delete process.env.PAYMENT_PROVIDER;
    await resetDemo(sql, new Date("2026-10-03T09:30:00Z"));
    merchantId = await getMerchantId(sql);
  });
  afterAll(async () => { await sql?.end(); });

  /** A confirmed bill: 2 toned milk + 1 bread. */
  async function confirmedBill() {
    const draft = await createDraftBill(sql, merchantId);
    await addFromText(sql, draft.id, "2 doodh, 1 bread", "manual");
    return confirmBill(sql, draft.id);
  }
  const stockOf = async (sku: string) => (await sql<{ stock: number }[]>`select stock from products where sku = ${sku}`)[0].stock;
  const movementsFor = async (billId: string) => (await sql`select count(*)::int n from stock_movements where bill_id = ${billId} and reason = 'sale'`)[0].n;
  const paidEvents = async (billId: string) => (await sql`select count(*)::int n from events where type = 'bill.paid' and data->>'billId' = ${billId}`)[0].n;

  it("marks paid only after the gateway confirms, and applies stock once", async () => {
    const bill = await confirmedBill();
    const milkBefore = await stockOf("DAI-001");
    const pay = await startOnlinePayment(sql, bill.id, "http://localhost:3000");
    expect(pay.provider).toBe("mock");

    // Customer hasn't paid: polling must not mark anything.
    expect((await confirmPayment(sql, pay.orderId, "poll", mock)).outcome).toBe("PENDING");
    expect((await getBill(sql, bill.id)).status).toBe("CONFIRMED");
    expect(await stockOf("DAI-001")).toBe(milkBefore);

    await mock.customerOutcome(pay.orderId, "success");
    expect((await confirmPayment(sql, pay.orderId, "callback", mock)).outcome).toBe("PAID");
    expect((await getBill(sql, bill.id)).status).toBe("PAID");
    expect(await stockOf("DAI-001")).toBe(milkBefore - 2);

    // Duplicate callback, webhook and poll: no further effect.
    for (const source of ["callback", "webhook", "poll"]) {
      expect((await confirmPayment(sql, pay.orderId, source, mock)).outcome).toBe("ALREADY_PAID");
    }
    expect(await stockOf("DAI-001")).toBe(milkBefore - 2);
    expect(await movementsFor(bill.id)).toBe(2);
    expect(await paidEvents(bill.id)).toBe(1);

    const status = await getPaymentStatus(sql, pay.orderId);
    expect(status.status).toBe("SUCCESS");
    expect(status.stock.find((s) => s.name === "Toned milk 500ml")).toMatchObject({ before: milkBefore, after: milkBefore - 2 });
  });

  it("handles concurrent notifications for the same payment exactly once", async () => {
    const bill = await confirmedBill();
    const milkBefore = await stockOf("DAI-001");
    const pay = await startOnlinePayment(sql, bill.id, "http://localhost:3000");
    await mock.customerOutcome(pay.orderId, "success");
    const outcomes = await Promise.all(Array.from({ length: 6 }, (_, i) => confirmPayment(sql, pay.orderId, `race-${i}`, mock)));
    expect(outcomes.filter((o) => o.outcome === "PAID")).toHaveLength(1);
    expect(outcomes.filter((o) => o.outcome === "ALREADY_PAID")).toHaveLength(5);
    expect(await stockOf("DAI-001")).toBe(milkBefore - 2);
    expect(await paidEvents(bill.id)).toBe(1);
  });

  it("rejects an amount mismatch and leaves the bill unpaid", async () => {
    const bill = await confirmedBill();
    const milkBefore = await stockOf("DAI-001");
    const pay = await startOnlinePayment(sql, bill.id, "http://localhost:3000");
    await sql`update mock_gateway_orders set amount_paise = 100 where order_id = ${pay.orderId}`; // gateway reports ₹1
    await mock.customerOutcome(pay.orderId, "success");
    expect((await confirmPayment(sql, pay.orderId, "webhook", mock)).outcome).toBe("REJECTED");
    expect((await getBill(sql, bill.id)).status).toBe("CONFIRMED");
    expect(await stockOf("DAI-001")).toBe(milkBefore);
    expect((await getPaymentStatus(sql, pay.orderId)).rejectedReason).toMatch(/amount mismatch/);
    const [e] = await sql`select summary from events where type = 'payment.rejected' order by id desc limit 1`;
    expect(e.summary).toContain("Nothing was marked paid");
  });

  it("rejects a gateway success for a different order ID", async () => {
    const bill = await confirmedBill();
    const pay = await startOnlinePayment(sql, bill.id, "http://localhost:3000");
    const liar: PaymentProvider = {
      name: "mock", label: "Mock payment", createOrder: mock.createOrder.bind(mock),
      verify: async () => ({ status: "SUCCESS", orderId: "SOMEONE-ELSE", amountPaise: bill.totalPaise, txnId: "X", raw: {} }),
    };
    expect((await confirmPayment(sql, pay.orderId, "webhook", liar)).outcome).toBe("REJECTED");
    expect((await getBill(sql, bill.id)).status).toBe("CONFIRMED");
  });

  it("records a failed payment and allows a fresh attempt", async () => {
    const bill = await confirmedBill();
    const first = await startOnlinePayment(sql, bill.id, "http://localhost:3000");
    await mock.customerOutcome(first.orderId, "failure");
    expect((await confirmPayment(sql, first.orderId, "callback", mock)).outcome).toBe("FAILED");
    expect((await getBill(sql, bill.id)).status).toBe("CONFIRMED");
    const second = await startOnlinePayment(sql, bill.id, "http://localhost:3000");
    expect(second.orderId).not.toBe(first.orderId);
  });

  it("reuses the open order instead of creating a second charge", async () => {
    const bill = await confirmedBill();
    const a = await startOnlinePayment(sql, bill.id, "http://localhost:3000");
    const b = await startOnlinePayment(sql, bill.id, "http://localhost:3000");
    expect(b.orderId).toBe(a.orderId);
  });

  it("refuses payment for drafts and already-paid bills", async () => {
    const draft = await createDraftBill(sql, merchantId);
    await expect(startOnlinePayment(sql, draft.id, "http://x")).rejects.toThrow(/Confirm the bill/);
    const bill = await confirmedBill();
    await recordCash(sql, bill.id);
    await expect(startOnlinePayment(sql, bill.id, "http://x")).rejects.toThrow(/already paid/);
    await expect(recordCash(sql, bill.id)).rejects.toThrow(/already paid/);
  });

  it("records cash as paid but not gateway-verified", async () => {
    const bill = await confirmedBill();
    const breadBefore = await stockOf("DAI-006");
    const r = await recordCash(sql, bill.id);
    expect(r.bill.status).toBe("PAID");
    expect(await stockOf("DAI-006")).toBe(breadBefore - 1);
    const [e] = await sql`select verified, summary from events where type = 'bill.paid' and data->>'billId' = ${bill.id}`;
    expect(e.verified).toBe(false);
    expect(e.summary).toContain("recorded by merchant");
  });

  it("puts a bill on udhaar: stock down, Khata debit, not paid", async () => {
    const bill = await confirmedBill();
    const customers = await listKhataCustomers(sql, merchantId);
    const ramesh = customers.find((c) => c.name === "Ramesh K.")!;
    const milkBefore = await stockOf("DAI-001");
    const r = await putOnCredit(sql, bill.id, ramesh.id);
    expect(r.bill.status).toBe("ON_CREDIT");
    expect(r.balancePaise).toBe(ramesh.balancePaise + bill.totalPaise);
    expect(await stockOf("DAI-001")).toBe(milkBefore - 2);
    expect(await paidEvents(bill.id)).toBe(0);
    await expect(putOnCredit(sql, bill.id, ramesh.id)).rejects.toThrow();
  });

  it("corrects and logs stock when the shelf count was short", async () => {
    await sql`update products set stock = 1 where sku = 'DAI-001'`;
    await sql`insert into stock_movements (product_id, delta, reason) select id, -(select sum(delta) from stock_movements where product_id = p.id) + 1, 'adjustment' from products p where sku = 'DAI-001'`;
    const bill = await confirmedBill(); // needs 2 milk
    await recordCash(sql, bill.id);
    expect(await stockOf("DAI-001")).toBe(0);
    const [e] = await sql`select summary from events where type = 'stock.corrected' order by id desc limit 1`;
    expect(e.summary).toContain("shelf count was 1");
    const [ledger] = await sql`select sum(delta)::int s from stock_movements m join products p on p.id = m.product_id where p.sku = 'DAI-001'`;
    expect(ledger.s).toBe(0);
  });
});

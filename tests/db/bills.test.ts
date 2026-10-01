/** Section 4 checkpoint: catalogue prices, review flags, confirmation, and no stock change. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { resetDemo } from "@/lib/demo/reset";
import { addFromText, addLines, confirmBill, createDraftBill, DomainError, getMerchantId, listCatalogue, removeLine, updateLine } from "@/lib/bills";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("counter bills", () => {
  let sql: Sql;
  let merchantId: string;
  let catalogue: Awaited<ReturnType<typeof listCatalogue>>;
  const price = (name: string) => catalogue.find((p) => p.name === name)!.pricePaise;
  const stockSnapshot = async () => (await sql`select sum(stock)::int s, (select count(*)::int from stock_movements) m from products`)[0];

  beforeAll(async () => {
    sql = createSql(url!);
    await migrate(sql);
    await resetDemo(sql, new Date("2026-10-03T09:30:00Z"));
    merchantId = await getMerchantId(sql);
    catalogue = await listCatalogue(sql, merchantId);
  });
  afterAll(async () => { await sql?.end(); });

  it("turns typed text into lines priced from the catalogue, flagging the ambiguous one", async () => {
    const bill = await createDraftBill(sql, merchantId);
    expect(bill.status).toBe("DRAFT");
    const { bill: b, unmatched } = await addFromText(sql, bill.id, "2 doodh, 1 bread, 3 biskut, laptop", "manual");
    expect(unmatched).toEqual(["laptop"]);
    const milk = b.lines.find((l) => l.name === "Toned milk 500ml")!;
    expect(milk.qty).toBe(2);
    expect(milk.unitPricePaise).toBe(price("Toned milk 500ml"));
    expect(milk.needsReview).toBe(false);
    const biscuit = b.lines.find((l) => l.needsReview)!;
    expect(biscuit.qty).toBe(3);
    expect(biscuit.candidates.map((c) => c.name).sort()).toEqual(["Glucose biscuit 250g", "Marie biscuit 150g"]);
    expect(b.needsReviewCount).toBe(1);
  });

  it("blocks confirmation until flagged lines are resolved, then confirms without touching stock", async () => {
    const before = await stockSnapshot();
    const draft = await createDraftBill(sql, merchantId);
    let b = (await addFromText(sql, draft.id, "2 doodh, 3 biskut", "parchi")).bill;
    await expect(confirmBill(sql, b.id)).rejects.toThrow(/need your check/);

    const flagged = b.lines.find((l) => l.needsReview)!;
    const glucose = flagged.candidates.find((c) => c.name.startsWith("Glucose"))!;
    b = await updateLine(sql, b.id, flagged.id, { productId: glucose.id });
    expect(b.needsReviewCount).toBe(0);
    expect(b.totalPaise).toBe(2 * price("Toned milk 500ml") + 3 * price("Glucose biscuit 250g"));

    const confirmed = await confirmBill(sql, b.id);
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.totalPaise).toBe(b.totalPaise);
    expect(await stockSnapshot()).toEqual(before);
    const [e] = await sql`select type, summary from events where type = 'bill.confirmed' order by id desc limit 1`;
    expect(e.summary).toContain(`Bill #${confirmed.number}`);
  });

  it("refuses edits once confirmed", async () => {
    const draft = await createDraftBill(sql, merchantId);
    const milk = catalogue.find((p) => p.sku === "DAI-001")!;
    const b = await addLines(sql, draft.id, [{ productId: milk.id, qty: 1, source: "manual" }]);
    await confirmBill(sql, b.id);
    await expect(addLines(sql, b.id, [{ productId: milk.id, qty: 1, source: "manual" }])).rejects.toBeInstanceOf(DomainError);
    await expect(updateLine(sql, b.id, b.lines[0].id, { qty: 5 })).rejects.toThrow(/already confirmed/);
    await expect(confirmBill(sql, b.id)).rejects.toThrow(/already confirmed/);
  });

  it("merges repeat taps on the same product and supports quantity edits and removal", async () => {
    const draft = await createDraftBill(sql, merchantId);
    const bread = catalogue.find((p) => p.name === "Bread 400g")!;
    let b = await addLines(sql, draft.id, [{ productId: bread.id, qty: 1, source: "manual" }]);
    b = await addLines(sql, b.id, [{ productId: bread.id, qty: 1, source: "manual" }]);
    expect(b.lines).toHaveLength(1);
    expect(b.lines[0].qty).toBe(2);
    b = await updateLine(sql, b.id, b.lines[0].id, { qty: 4 });
    expect(b.totalPaise).toBe(4 * bread.pricePaise);
    await expect(updateLine(sql, b.id, b.lines[0].id, { qty: 0 })).rejects.toThrow(/1 to 99/);
    b = await removeLine(sql, b.id, b.lines[0].id);
    expect(b.lines).toHaveLength(0);
    await expect(confirmBill(sql, b.id)).rejects.toThrow(/at least one item/);
  });

  it("rejects products that are not in the catalogue", async () => {
    const draft = await createDraftBill(sql, merchantId);
    await expect(addLines(sql, draft.id, [{ productId: "00000000-0000-4000-8000-000000000000", qty: 1, source: "manual" }])).rejects.toThrow(/catalogue/);
  });

  it("numbers bills sequentially after the seeded history", async () => {
    const a = await createDraftBill(sql, merchantId);
    const b = await createDraftBill(sql, merchantId);
    expect(b.number).toBe(a.number + 1);
  });
});

/** Section 6 checkpoint: a parchi becomes an editable bill; uncertain lines need correction. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { resetDemo } from "@/lib/demo/reset";
import { addExtracted, confirmBill, createDraftBill, getMerchantId, updateLine } from "@/lib/bills";
import { DEMO_PARCHI_CACHED } from "@/lib/demo/parchi";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("parchi and voice lines", () => {
  let sql: Sql;
  let merchantId: string;
  beforeAll(async () => { sql = createSql(url!); await migrate(sql); });
  beforeEach(async () => { await resetDemo(sql, new Date("2026-10-03T09:30:00Z")); merchantId = await getMerchantId(sql); });
  afterAll(async () => { await sql?.end(); });

  it("turns the cached demo parchi into the expected bill, with biskut flagged", async () => {
    const draft = await createDraftBill(sql, merchantId);
    const { bill, unmatched } = await addExtracted(sql, draft.id, DEMO_PARCHI_CACHED, "parchi");
    expect(unmatched).toEqual([]);
    expect(bill.lines).toHaveLength(4);
    expect(bill.lines.every((l) => l.source === "parchi")).toBe(true);
    const flagged = bill.lines.filter((l) => l.needsReview);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].rawText).toBe("biskut 3");
    await expect(confirmBill(sql, bill.id)).rejects.toThrow(/need your check/);

    const glucose = flagged[0].candidates.find((c) => c.name.startsWith("Glucose"))!;
    const fixed = await updateLine(sql, bill.id, flagged[0].id, { productId: glucose.id });
    // 2×27 + 45 + 3×25 + 28 = ₹202, all from catalogue prices
    expect(fixed.totalPaise).toBe(20_200);
    expect((await confirmBill(sql, bill.id)).status).toBe("CONFIRMED");
  });

  it("forces a check on lines the reader marked unclear, even if the word matched", async () => {
    const draft = await createDraftBill(sql, merchantId);
    const { bill } = await addExtracted(sql, draft.id, [{ raw: "doodh?", name: "doodh", qty: 1, legible: false }], "parchi");
    expect(bill.lines[0].needsReview).toBe(true);
    expect(bill.lines[0].candidates.length).toBeGreaterThan(0);
  });

  it("returns unknown items instead of guessing", async () => {
    const draft = await createDraftBill(sql, merchantId);
    const { bill, unmatched } = await addExtracted(sql, draft.id, [{ raw: "मोबाइल रिचार्ज", name: "mobile recharge", qty: 1, legible: true }], "voice");
    expect(bill.lines).toHaveLength(0);
    expect(unmatched).toEqual(["मोबाइल रिचार्ज"]);
  });
});

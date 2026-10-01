import { describe, expect, it } from "vitest";
import { generateDemoData, KHATA_CUSTOMERS } from "@/lib/demo/generate";
import { CATALOGUE } from "@/lib/demo/catalogue";

// 3 Oct 2026, 15:00 IST — a realistic finale demo time.
const ANCHOR = new Date("2026-10-03T09:30:00Z");
const data = generateDemoData(ANCHOR);

const balances = () => {
  const m = new Map<string, number>();
  for (const k of data.khataEntries) m.set(k.customer_id, (m.get(k.customer_id) ?? 0) + (k.type === "debit" ? k.amount_paise : -k.amount_paise));
  return m;
};

describe("demo data generator", () => {
  it("is deterministic for the same anchor", () => {
    expect(JSON.stringify(generateDemoData(ANCHOR))).toBe(JSON.stringify(data));
  });

  it("has 60 products with unique SKUs, valid barcodes and integer paise prices", () => {
    expect(data.products).toHaveLength(60);
    expect(new Set(data.products.map((p) => p.sku)).size).toBe(60);
    for (const p of data.products) {
      expect(Number.isSafeInteger(p.price_paise) && p.price_paise > 0).toBe(true);
      expect(p.barcode).toMatch(/^200\d{10}$/);
    }
  });

  it("stages toned milk at 8 units for the golden path", () => {
    expect(data.products.find((p) => p.sku === "DAI-001")!.stock).toBe(8);
  });

  it("keeps stock equal to the movement ledger and never negative over time", () => {
    for (const p of data.products) {
      let running = 0;
      for (const m of data.stockMovements.filter((x) => x.product_id === p.id)) {
        running += m.delta;
        expect(running).toBeGreaterThanOrEqual(0);
      }
      expect(running).toBe(p.stock);
    }
  });

  it("prices bill items from the catalogue and totals bills correctly", () => {
    const priceById = new Map(data.products.map((p) => [p.id, p.price_paise]));
    const totals = new Map<string, number>();
    for (const it of data.billItems) {
      expect(it.unit_price_paise).toBe(priceById.get(it.product_id));
      totals.set(it.bill_id, (totals.get(it.bill_id) ?? 0) + it.qty * it.unit_price_paise);
    }
    for (const b of data.bills) expect(b.total_paise).toBe(totals.get(b.id));
  });

  it("produces the specified Khata balances: ₹11,640 outstanding, ₹2,150 over 30 days", () => {
    const bal = balances();
    const total = [...bal.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(1_164_000);
    const overdue = KHATA_CUSTOMERS.filter((c) => Math.max(...c.open.map((o) => o.daysAgo)) > 30)
      .map((c) => bal.get(data.customers.find((x) => x.name === c.name)!.id)!);
    expect(overdue.reduce((a, b) => a + b, 0)).toBe(215_000);
  });

  it("only uses ON_CREDIT for bills with a customer, and has no bills after the anchor", () => {
    for (const b of data.bills) {
      if (b.status === "ON_CREDIT") expect(b.customer_id).not.toBeNull();
      expect(b.created_at.getTime()).toBeLessThan(ANCHOR.getTime());
    }
  });

  it("matches catalogue order and keeps aliases for Hinglish matching", () => {
    expect(data.products.map((p) => p.sku)).toEqual(CATALOGUE.map((c) => c.sku));
    expect(data.products[0].aliases).toContain("doodh");
  });
});

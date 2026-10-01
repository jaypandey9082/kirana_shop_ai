import { describe, expect, it } from "vitest";
import { matchProduct, normalize, parseItemList } from "@/lib/matcher";
import { CATALOGUE } from "@/lib/demo/catalogue";

const products = CATALOGUE.map((c, i) => ({ id: c.sku, name: c.name, aliases: c.aliases, barcode: `20000000000${String(i).padStart(2, "0")}` }));
const match = (q: string) => matchProduct(q, products);

describe("matcher", () => {
  it("matches Hinglish aliases with full confidence", () => {
    const r = match("doodh");
    expect(r.product?.name).toBe("Toned milk 500ml");
    expect(r.confidence).toBe(1);
    expect(r.needsReview).toBe(false);
  });

  it("matches Devanagari aliases", () => {
    expect(match("दूध").product?.name).toBe("Toned milk 500ml");
    expect(match("नमक").product?.name).toBe("Iodised salt 1kg");
  });

  it("flags an ambiguous word and offers both options", () => {
    const r = match("biskut");
    expect(r.needsReview).toBe(true);
    expect(r.candidates.map((c) => c.name).sort()).toEqual(["Glucose biscuit 250g", "Marie biscuit 150g"]);
  });

  it("flags a generic word shared by several products", () => {
    expect(match("oil").needsReview).toBe(true);
    // "milk" alone is a deliberate alias for the everyday toned milk.
    expect(match("milk").product?.name).toBe("Toned milk 500ml");
  });

  it("accepts the exact product name", () => {
    const r = match("Bread 400g");
    expect(r.product?.name).toBe("Bread 400g");
    expect(r.needsReview).toBe(false);
  });

  it("matches typos but asks for a check", () => {
    const r = match("tamatr");
    expect(r.product?.name).toBe("Tomato 1kg");
    expect(r.needsReview).toBe(true);
  });

  it("returns no product for unrelated text", () => {
    const r = match("laptop charger");
    expect(r.product).toBeNull();
    expect(r.needsReview).toBe(true);
  });

  it("matches barcodes exactly", () => {
    expect(match(products[5].barcode).product?.id).toBe(products[5].id);
    expect(match("2000000000099").product).toBeNull();
  });
});

describe("parseItemList", () => {
  it("reads quantities in front, behind and as Hindi words", () => {
    expect(parseItemList("2 doodh, bread 1 aur teen biskut")).toEqual([
      { text: "doodh", qty: 2 }, { text: "bread", qty: 1 }, { text: "biskut", qty: 3 },
    ]);
  });

  it("defaults to one and drops filler words", () => {
    expect(parseItemList("2 packet chips\nnamak")).toEqual([{ text: "chips", qty: 2 }, { text: "namak", qty: 1 }]);
  });

  it("normalises punctuation and case", () => {
    expect(normalize("  Toned-Milk, 500ML! ")).toBe("toned milk 500ml");
  });
});

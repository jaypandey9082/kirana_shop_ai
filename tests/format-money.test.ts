import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/format-money";
describe("INR formatting (test inputs, not demo data)", () => {
  it("distinguishes unavailable from zero", () => { expect(formatMoney(null)).toBe("—"); expect(formatMoney(0)).toBe("₹0"); });
  it("uses Indian grouping and omits zero paise", () => { expect(formatMoney(14000000)).toBe("₹1,40,000"); });
  it("preserves nonzero paise", () => { expect(formatMoney(20250)).toBe("₹202.50"); });
  it("rejects fractional paise and non-finite values", () => { for (const input of [0.5, NaN, Infinity]) expect(() => formatMoney(input)).toThrow(TypeError); });
});

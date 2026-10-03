import { describe, expect, it } from "vitest";
import { allowedNumbers, classifyApproval, numbersAreGrounded, numbersIn } from "@/lib/salaahkaar/agent";
import { TOOLS, dayTime } from "@/lib/salaahkaar/tools";

describe("number guard", () => {
  it("reads Latin and Devanagari digits, with Indian commas", () => {
    expect(numbersIn("Aaj ₹2,940 ka sale, 28 bills, ७ बजे")).toEqual(["2940", "28", "7"]);
  });
  it("accepts numbers from tool data (including paise→rupees and magnitudes) and rejects others", () => {
    const allowed = allowedNumbers([{ totalPaise: 294000, bills: 28, changePct: -22, label: "7:04 pm" }]);
    expect(numbersAreGrounded("₹2,940 · 28 bills · 22% kam · 7:04", allowed)).toBe(true);
    expect(numbersAreGrounded("₹3,000 ka sale", allowed)).toBe(false);
  });
});

describe("voice approval intent", () => {
  it.each([["Haan, bhej do", "approve"], ["haan", "approve"], ["हाँ भेज दो", "approve"], ["theek hai kar do", "approve"],
    ["nahi, baad mein", "reject"], ["mat bhejo", "reject"], ["नहीं", "reject"],
    ["aaj kitna sale hua", null], ["haan aur batao ki kal ka sale kitna tha aur udhaar kitna hai", null]])("%s → %s", (text, want) => {
    expect(classifyApproval(text)).toBe(want);
  });
});

describe("tool contracts", () => {
  it("has exactly seven strict tools and none that move money or send", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["get_sales_summary", "get_low_stock", "forecast_runout", "get_slow_movers", "get_overdue_dues", "propose_reorder", "propose_reminder"]);
    for (const t of TOOLS) {
      expect(t.parameters.additionalProperties).toBe(false);
      expect(Object.keys(t.parameters.properties).sort()).toEqual([...t.parameters.required].sort());
      expect(t.name).not.toMatch(/pay|send|transfer|refund|execute/);
    }
  });
});

describe("dayTime", () => {
  // 3 Oct 2026, 12:10 IST
  const now = new Date("2026-10-03T06:40:00Z");
  it("says aaj for later today and kal for tomorrow, in IST", () => {
    expect(dayTime("2026-10-03T11:28:00Z", now)).toMatch(/^aaj 4:58\s?pm$/i);
    expect(dayTime("2026-10-04T01:30:00Z", now)).toMatch(/^kal 7:00\s?am$/i);
    // late evening IST is still the same IST day
    expect(dayTime("2026-10-03T18:15:00Z", now)).toMatch(/^aaj 11:45\s?pm$/i);
  });
});

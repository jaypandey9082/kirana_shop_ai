import { getSql } from "@/lib/db/client";
import { getMerchantId } from "@/lib/bills";
import { forecastRunout, lowStock, overdueDues, salesSummary, slowMovers } from "@/lib/insights";
import { handle, ok } from "@/lib/api";

/** GET /api/insights — every deterministic insight, each with its source. */
export async function GET() {
  return handle(async () => {
    const sql = getSql();
    const m = await getMerchantId(sql);
    const now = new Date();
    const [today, low, runout, slow, overdue] = await Promise.all([
      salesSummary(sql, m, "today", now), lowStock(sql, m), forecastRunout(sql, m, now), slowMovers(sql, m, now), overdueDues(sql, m, now),
    ]);
    return ok({ generatedAt: now.toISOString(), today, low, runout, slow, overdue });
  });
}

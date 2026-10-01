import { getSql } from "@/lib/db/client";
import { getMerchantId } from "@/lib/bills";
import { salaahkaarNudges } from "@/lib/salaahkaar/agent";
import { handle, ok } from "@/lib/api";

/** GET /api/salaahkaar/nudges — proactive, source-backed cards (run-out risk, old udhaar). */
export async function GET() {
  return handle(async () => {
    const sql = getSql();
    return ok({ cards: await salaahkaarNudges(sql, await getMerchantId(sql)) });
  });
}

import { getSql } from "@/lib/db/client";
import { getMerchantId } from "@/lib/bills";
import { khataOverview } from "@/lib/khata";
import { handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const sql = getSql();
    return ok({ khata: await khataOverview(sql, await getMerchantId(sql)) });
  });
}

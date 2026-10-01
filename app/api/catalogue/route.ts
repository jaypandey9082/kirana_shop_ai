import { getSql } from "@/lib/db/client";
import { getMerchantId, listCatalogue } from "@/lib/bills";
import { handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const sql = getSql();
    return ok({ products: await listCatalogue(sql, await getMerchantId(sql)) });
  });
}

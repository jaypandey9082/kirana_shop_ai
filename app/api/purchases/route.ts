import { getSql } from "@/lib/db/client";
import { getMerchantId } from "@/lib/bills";
import { listForMerchant, supplierDues } from "@/lib/purchases";
import { handle, ok } from "@/lib/api";

/** GET /api/purchases — the shop's orders to distributors and what it owes them. */
export async function GET() {
  return handle(async () => {
    const sql = getSql();
    const m = await getMerchantId(sql);
    const [orders, dues] = await Promise.all([listForMerchant(sql, m), supplierDues(sql, m)]);
    return ok({ orders, dues });
  });
}

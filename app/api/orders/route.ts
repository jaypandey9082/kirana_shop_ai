import { getSql } from "@/lib/db/client";
import { getMerchantId } from "@/lib/bills";
import { listOrders } from "@/lib/orders";
import { handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const sql = getSql();
    return ok({ orders: await listOrders(sql, await getMerchantId(sql)) });
  });
}

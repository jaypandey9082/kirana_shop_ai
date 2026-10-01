import { getSql } from "@/lib/db/client";
import { getMerchantId } from "@/lib/bills";
import { listKhataCustomers } from "@/lib/payments/service";
import { handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const sql = getSql();
    return ok({ customers: await listKhataCustomers(sql, await getMerchantId(sql)) });
  });
}

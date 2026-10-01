import { getSql } from "@/lib/db/client";
import { createDraftBill, getMerchantId } from "@/lib/bills";
import { handle, ok } from "@/lib/api";

/** POST /api/bills — start a new draft counter bill. */
export async function POST() {
  return handle(async () => {
    const sql = getSql();
    return ok({ bill: await createDraftBill(sql, await getMerchantId(sql)) }, 201);
  });
}

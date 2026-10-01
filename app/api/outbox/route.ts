import { getSql } from "@/lib/db/client";
import { getMerchantId } from "@/lib/bills";
import { listOutbox } from "@/lib/actions";
import { handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const sql = getSql();
    return ok({ outbox: await listOutbox(sql, await getMerchantId(sql)) });
  });
}

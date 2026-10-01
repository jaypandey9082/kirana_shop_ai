import { getSql } from "@/lib/db/client";
import { getMerchantId } from "@/lib/bills";
import { customerLedger } from "@/lib/khata";
import { handle, ok, parseId } from "@/lib/api";

export async function GET(_req: Request, ctx: RouteContext<"/api/khata/[id]">) {
  return handle(async () => {
    const sql = getSql();
    return ok({ ledger: await customerLedger(sql, await getMerchantId(sql), parseId((await ctx.params).id)) });
  });
}

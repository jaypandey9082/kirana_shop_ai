import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { getMerchantId } from "@/lib/bills";
import { settleKhata } from "@/lib/khata";
import { handle, ok, parseId, readJson } from "@/lib/api";

const body = z.object({ amountPaise: z.number().int().positive(), method: z.enum(["cash", "upi"]).default("cash") });

/** POST — record udhaar money received (merchant-recorded, not gateway-verified). */
export async function POST(request: Request, ctx: RouteContext<"/api/khata/[id]/settle">) {
  return handle(async () => {
    const id = parseId((await ctx.params).id);
    const { amountPaise, method } = await readJson(request, body);
    const sql = getSql();
    return ok({ ledger: await settleKhata(sql, await getMerchantId(sql), id, amountPaise, method) });
  });
}

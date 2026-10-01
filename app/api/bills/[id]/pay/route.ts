import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { putOnCredit, recordCash, startOnlinePayment } from "@/lib/payments/service";
import { handle, ok, parseId, readJson, uuid } from "@/lib/api";

const body = z.discriminatedUnion("method", [
  z.object({ method: z.literal("online") }),
  z.object({ method: z.literal("cash") }),
  z.object({ method: z.literal("udhaar"), customerId: uuid }),
]);

/** POST /api/bills/:id/pay — online (Paytm staging or mock), cash, or udhaar. */
export async function POST(request: Request, ctx: RouteContext<"/api/bills/[id]/pay">) {
  return handle(async () => {
    const id = parseId((await ctx.params).id);
    const input = await readJson(request, body);
    const sql = getSql();
    if (input.method === "online") {
      const appUrl = process.env.APP_URL || new URL(request.url).origin;
      return ok({ payment: await startOnlinePayment(sql, id, appUrl) }, 201);
    }
    if (input.method === "cash") return ok(await recordCash(sql, id));
    return ok(await putOnCredit(sql, id, input.customerId));
  });
}

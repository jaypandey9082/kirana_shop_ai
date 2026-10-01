import { getSql } from "@/lib/db/client";
import { confirmBill } from "@/lib/bills";
import { handle, ok, parseId } from "@/lib/api";

/** POST /api/bills/:id/confirm — lock the bill for payment. Stock is not changed here. */
export async function POST(_req: Request, ctx: RouteContext<"/api/bills/[id]/confirm">) {
  return handle(async () => ok({ bill: await confirmBill(getSql(), parseId((await ctx.params).id)) }));
}

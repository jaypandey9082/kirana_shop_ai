import { getSql } from "@/lib/db/client";
import { markSupplierPaid } from "@/lib/purchases";
import { handle, ok, parseId } from "@/lib/api";

/** POST — shopkeeper records paying the supplier outside the app. No money moves here. */
export async function POST(_req: Request, ctx: RouteContext<"/api/purchases/[id]/paid">) {
  return handle(async () => ok({ order: await markSupplierPaid(getSql(), parseId((await ctx.params).id)) }));
}

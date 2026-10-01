import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { advanceOrder, getOrder } from "@/lib/orders";
import { handle, ok, parseId, readJson } from "@/lib/api";

/** GET — order status (also used by the customer's tracking page; the id is an unguessable UUID). */
export async function GET(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  return handle(async () => ok({ order: await getOrder(getSql(), parseId((await ctx.params).id)) }));
}

const body = z.object({ fulfilment: z.enum(["PREPARING", "READY", "COMPLETED"]) });
/** PATCH — merchant moves a paid order to the next step. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/orders/[id]">) {
  return handle(async () => {
    const id = parseId((await ctx.params).id);
    const { fulfilment } = await readJson(request, body);
    return ok({ order: await advanceOrder(getSql(), id, fulfilment) });
  });
}

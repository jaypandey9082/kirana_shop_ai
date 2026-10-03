import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { acceptOrder } from "@/lib/purchases";
import { handle, ok, parseId, readJson } from "@/lib/api";

const body = z.object({
  eta: z.string().trim().min(2).max(60),
  items: z.array(z.object({ id: z.uuid(), qty: z.number().int().min(0).max(1000) })).max(50).optional(),
});
/** POST — distributor (demo page, no login): accept with a delivery time, quantities may be short. */
export async function POST(request: Request, ctx: RouteContext<"/api/purchases/[id]/accept">) {
  return handle(async () => {
    const id = parseId((await ctx.params).id);
    return ok({ order: await acceptOrder(getSql(), id, await readJson(request, body)) });
  });
}

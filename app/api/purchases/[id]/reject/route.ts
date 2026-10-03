import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { rejectOrder } from "@/lib/purchases";
import { handle, ok, parseId, readJson } from "@/lib/api";

const body = z.object({ note: z.string().trim().min(2).max(120) });
/** POST — distributor (demo page, no login): can't supply this order. */
export async function POST(request: Request, ctx: RouteContext<"/api/purchases/[id]/reject">) {
  return handle(async () => {
    const id = parseId((await ctx.params).id);
    return ok({ order: await rejectOrder(getSql(), id, (await readJson(request, body)).note) });
  });
}

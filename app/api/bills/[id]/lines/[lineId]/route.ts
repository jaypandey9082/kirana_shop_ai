import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { removeLine, updateLine } from "@/lib/bills";
import { handle, ok, parseId, readJson, uuid } from "@/lib/api";

const body = z.object({ qty: z.number().int().min(1).max(99).optional(), productId: uuid.optional() })
  .refine((b) => b.qty !== undefined || b.productId !== undefined, "Send qty or productId.");

/** PATCH — change quantity, or resolve a flagged line by picking the product. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/bills/[id]/lines/[lineId]">) {
  return handle(async () => {
    const { id, lineId } = await ctx.params;
    const change = await readJson(request, body);
    return ok({ bill: await updateLine(getSql(), parseId(id), parseId(lineId), change) });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/bills/[id]/lines/[lineId]">) {
  return handle(async () => {
    const { id, lineId } = await ctx.params;
    return ok({ bill: await removeLine(getSql(), parseId(id), parseId(lineId)) });
  });
}

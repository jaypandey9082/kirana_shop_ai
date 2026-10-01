import { getSql } from "@/lib/db/client";
import { getBill } from "@/lib/bills";
import { handle, ok, parseId } from "@/lib/api";

export async function GET(_req: Request, ctx: RouteContext<"/api/bills/[id]">) {
  return handle(async () => ok({ bill: await getBill(getSql(), parseId((await ctx.params).id)) }));
}

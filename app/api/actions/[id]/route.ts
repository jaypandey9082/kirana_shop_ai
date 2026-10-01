import { getSql } from "@/lib/db/client";
import { getAction } from "@/lib/actions";
import { handle, ok, parseId } from "@/lib/api";

export async function GET(_req: Request, ctx: RouteContext<"/api/actions/[id]">) {
  return handle(async () => ok({ action: await getAction(getSql(), parseId((await ctx.params).id)) }));
}

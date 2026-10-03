import { getSql } from "@/lib/db/client";
import { receiveOrder } from "@/lib/purchases";
import { handle, ok, parseId } from "@/lib/api";

/** POST — shopkeeper: "Maal aa gaya". Adds the received quantities to stock once. */
export async function POST(_req: Request, ctx: RouteContext<"/api/purchases/[id]/receive">) {
  return handle(async () => ok(await receiveOrder(getSql(), parseId((await ctx.params).id))));
}

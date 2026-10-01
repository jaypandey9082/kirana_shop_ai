import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { approveAction } from "@/lib/actions";
import { handle, ok, parseId } from "@/lib/api";

const body = z.object({ via: z.enum(["tap", "voice"]).default("tap") });

/** POST /api/actions/:id/approve — explicit shopkeeper approval (tap or voice). Executes the action once. */
export async function POST(request: Request, ctx: RouteContext<"/api/actions/[id]/approve">) {
  return handle(async () => {
    const id = parseId((await ctx.params).id);
    const parsed = body.safeParse(await request.json().catch(() => ({})));
    const via = parsed.success ? parsed.data.via : "tap";
    return ok({ action: await approveAction(getSql(), id, via) });
  });
}

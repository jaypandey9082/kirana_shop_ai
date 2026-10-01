import { timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db/client";
import { markExecuted } from "@/lib/actions";
import { handle, ok, parseId } from "@/lib/api";

function secretOk(given: string | null, expected: string | undefined) {
  if (!given || !expected || expected.length < 16) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** POST /api/actions/:id/executed — n8n's callback after it ran an APPROVED action. */
export async function POST(request: Request, ctx: RouteContext<"/api/actions/[id]/executed">) {
  if (!secretOk(request.headers.get("x-n8n-callback-secret"), process.env.N8N_CALLBACK_SECRET)) {
    return Response.json({ error: "Not authorised." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return handle(async () => ok({ action: await markExecuted(getSql(), parseId((await ctx.params).id), "n8n") }));
}

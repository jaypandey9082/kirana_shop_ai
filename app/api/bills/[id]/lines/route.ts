import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { addFromText, addLines } from "@/lib/bills";
import { handle, ok, parseId, readJson, uuid } from "@/lib/api";

const body = z.union([
  z.object({ productId: uuid, qty: z.number().int().min(1).max(99).default(1), source: z.enum(["manual", "scan"]).default("manual") }),
  z.object({ text: z.string().trim().min(1).max(500), source: z.enum(["manual", "voice", "parchi"]).default("manual") }),
]);

/** POST /api/bills/:id/lines — add a catalogue product, or free text to be matched. */
export async function POST(request: Request, ctx: RouteContext<"/api/bills/[id]/lines">) {
  return handle(async () => {
    const id = parseId((await ctx.params).id);
    const input = await readJson(request, body);
    const sql = getSql();
    if ("text" in input) return ok(await addFromText(sql, id, input.text, input.source));
    const bill = await addLines(sql, id, [{ productId: input.productId, qty: input.qty, source: input.source, confidence: 1 }]);
    return ok({ bill, unmatched: [] });
  });
}

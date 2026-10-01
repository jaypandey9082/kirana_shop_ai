import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { addExtracted, addFromText, addLines } from "@/lib/bills";
import { getExtractor } from "@/lib/ai/extract";
import { logEvent } from "@/lib/events";
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
    if ("text" in input) {
      // Spoken orders ("do doodh aur ek bread") go through the AI reader when it's set up;
      // typed lists use the deterministic parser. Either way the matcher decides products.
      const extractor = input.source === "voice" ? getExtractor() : null;
      if (extractor) {
        try {
          const items = await extractor.fromText(input.text);
          const result = await addExtracted(sql, id, items, "voice");
          await logEvent(sql, id, "voice.read", `Voice order read by ${extractor.label}: ${items.length} items`, { items: items.length });
          return ok(result);
        } catch (error) {
          console.error("voice extraction failed, using parser", error);
        }
      }
      return ok(await addFromText(sql, id, input.text, input.source));
    }
    const bill = await addLines(sql, id, [{ productId: input.productId, qty: input.qty, source: input.source, confidence: 1 }]);
    return ok({ bill, unmatched: [] });
  });
}

import { getSql } from "@/lib/db/client";
import { addExtracted, DomainError } from "@/lib/bills";
import { getExtractor } from "@/lib/ai/extract";
import { DEMO_PARCHI_CACHED } from "@/lib/demo/parchi";
import { logEvent } from "@/lib/events";
import { handle, ok, parseId } from "@/lib/api";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * POST /api/bills/:id/parchi
 *  - multipart with `image`: read the photo with the configured model, then match.
 *  - JSON {"demo": true}: use the CACHED reading of the demo parchi (labelled as such).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/bills/[id]/parchi">) {
  return handle(async () => {
    const billId = parseId((await ctx.params).id);
    const sql = getSql();

    if ((request.headers.get("content-type") ?? "").includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      if (body?.demo !== true) throw new DomainError("INVALID", "Send an image, or {\"demo\": true}.");
      const result = await addExtracted(sql, billId, DEMO_PARCHI_CACHED, "parchi");
      await logEvent(sql, billId, "parchi.cached", `Demo parchi added from a cached reading (not read live): ${DEMO_PARCHI_CACHED.length} items`, { cached: true });
      return ok({ ...result, read: { mode: "cached", items: DEMO_PARCHI_CACHED } });
    }

    const extractor = getExtractor();
    if (!extractor) throw new DomainError("CONFLICT", "Parchi reading is not set up (OPENAI_API_KEY / OPENAI_MODEL). Use the demo parchi or type the list.");
    const form = await request.formData().catch(() => null);
    const file = form?.get("image");
    if (!(file instanceof File)) throw new DomainError("INVALID", "Attach the parchi photo as `image`.");
    if (!TYPES.has(file.type)) throw new DomainError("INVALID", "Use a JPEG, PNG or WebP photo.");
    if (file.size > MAX_BYTES) throw new DomainError("INVALID", "Photo is too large (max 8 MB).");

    const started = Date.now();
    let items;
    try {
      items = await extractor.fromImage({ base64: Buffer.from(await file.arrayBuffer()).toString("base64"), mime: file.type });
    } catch (error) {
      console.error("parchi extraction failed", error);
      throw new DomainError("CONFLICT", "Parchi padh nahi paaye. Try a clearer photo, use the demo parchi, or type the list.");
    }
    if (!items.length) throw new DomainError("INVALID", "Is photo mein koi list nahi mili. Try again or type the list.");
    const result = await addExtracted(sql, billId, items, "parchi");
    const flagged = result.bill.lines.filter((l) => l.needsReview && l.source === "parchi").length;
    await logEvent(sql, billId, "parchi.read",
      `Parchi read by ${extractor.label}: ${items.length} items, ${flagged} need a check${result.unmatched.length ? `, ${result.unmatched.length} not in catalogue` : ""}`,
      { ms: Date.now() - started, items: items.length });
    return ok({ ...result, read: { mode: "live", items } });
  });
}

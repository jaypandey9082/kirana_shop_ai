import { getSql } from "@/lib/db/client";
import { DomainError } from "@/lib/bills";
import { supplierBySlug } from "@/lib/demo/suppliers";
import { listForSupplier } from "@/lib/purchases";
import { handle, ok } from "@/lib/api";

/** GET — a demo distributor's incoming orders from shops (demo page, no login). */
export async function GET(_req: Request, ctx: RouteContext<"/api/distributor/[slug]/orders">) {
  return handle(async () => {
    const slug = (await ctx.params).slug;
    if (slug !== "all" && !supplierBySlug(slug)) throw new DomainError("NOT_FOUND", "Distributor not found.");
    return ok({ orders: await listForSupplier(getSql(), slug) });
  });
}

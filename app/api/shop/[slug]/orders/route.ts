import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { DomainError } from "@/lib/bills";
import { createOnlineOrder, getStore } from "@/lib/orders";
import { getPaymentMode, startOnlinePayment } from "@/lib/payments/service";
import { handle, ok, readJson, uuid } from "@/lib/api";

const body = z.object({
  items: z.array(z.object({ productId: uuid, qty: z.number().int().min(1).max(20) })).min(1).max(40),
  name: z.string().trim().min(2, "Naam likhiye.").max(60),
  phone: z.string().trim().regex(/^[6-9][0-9]{9}$/, "10-digit mobile number likhiye.").optional().or(z.literal("")),
  mode: z.enum(["pickup", "delivery"]),
  note: z.string().trim().max(200).optional(),
});

/** POST /api/shop/:slug/orders — place an order from the QR storefront and start payment. */
export async function POST(request: Request, ctx: RouteContext<"/api/shop/[slug]/orders">) {
  return handle(async () => {
    const sql = getSql();
    const store = await getStore(sql, (await ctx.params).slug);
    if (!store) throw new DomainError("NOT_FOUND", "Store not found.");
    if (getPaymentMode() === "misconfigured") throw new DomainError("CONFLICT", "Online payment is not available right now. Please order at the shop.");
    const input = await readJson(request, body);
    const order = await createOnlineOrder(sql, store.id, { ...input, phone: input.phone || null });
    const payment = await startOnlinePayment(sql, order.billId, process.env.APP_URL || new URL(request.url).origin);
    return ok({ order, payPath: payment.payPath }, 201);
  });
}

import { getSql } from "@/lib/db/client";
import { confirmPayment, getPaymentStatus } from "@/lib/payments/service";
import { handle, ok } from "@/lib/api";
import { DomainError } from "@/lib/bills";

const ORDER_ID = /^[A-Za-z0-9-]{6,50}$/;
const lastCheck = new Map<string, number>();

/**
 * GET /api/payments/:orderId — payment status for the merchant and customer screens.
 * While a payment is open it also asks the gateway (at most every 2.5 s per order),
 * so a delayed or missing webhook can't leave the demo stuck.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/payments/[orderId]">) {
  return handle(async () => {
    const { orderId } = await ctx.params;
    if (!ORDER_ID.test(orderId)) throw new DomainError("NOT_FOUND", "Payment not found.");
    const sql = getSql();
    let status = await getPaymentStatus(sql, orderId);
    const open = status.status === "CREATED" || status.status === "PENDING";
    if (open && status.provider !== "cash" && Date.now() - (lastCheck.get(orderId) ?? 0) > 2500) {
      lastCheck.set(orderId, Date.now());
      await confirmPayment(sql, orderId, "status poll");
      status = await getPaymentStatus(sql, orderId);
    }
    return ok({ payment: status });
  });
}

import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { MockProvider } from "@/lib/payments/mock";
import { confirmPayment, getPaymentMode } from "@/lib/payments/service";
import { handle, ok, readJson } from "@/lib/api";
import { DomainError } from "@/lib/bills";

const body = z.object({ outcome: z.enum(["success", "failure"]) });

/**
 * POST /api/payments/mock/:orderId — the customer's choice on the mock pay page.
 * Updates the mock "gateway", then runs the same server-side verification as Paytm.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/payments/mock/[orderId]">) {
  return handle(async () => {
    if (getPaymentMode() !== "mock") throw new DomainError("NOT_FOUND", "Mock payments are turned off.");
    const { orderId } = await ctx.params;
    const { outcome } = await readJson(request, body);
    const sql = getSql();
    const provider = new MockProvider(sql);
    if (!(await provider.customerOutcome(orderId, outcome))) throw new DomainError("CONFLICT", "This mock payment is already finished.");
    return ok(await confirmPayment(sql, orderId, "mock gateway callback", provider));
  });
}

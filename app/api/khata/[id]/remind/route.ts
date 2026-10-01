import { getSql } from "@/lib/db/client";
import { DomainError, getMerchantId } from "@/lib/bills";
import { toolByName } from "@/lib/salaahkaar/tools";
import { handle, ok, parseId } from "@/lib/api";

/** POST — draft a reminder for this customer (PENDING; sends nothing until approved). */
export async function POST(_req: Request, ctx: RouteContext<"/api/khata/[id]/remind">) {
  return handle(async () => {
    const id = parseId((await ctx.params).id);
    const sql = getSql();
    const merchantId = await getMerchantId(sql);
    const [c] = await sql<{ name: string }[]>`select name from customers where id = ${id} and merchant_id = ${merchantId}`;
    if (!c) throw new DomainError("NOT_FOUND", "Customer not found.");
    const [m] = await sql<{ name: string }[]>`select name from merchants where id = ${merchantId}`;
    const r = await toolByName("propose_reminder")!.run({ sql, merchantId, now: new Date(), shopName: m.name }, { customer_name: c.name });
    if (!r.action) throw new DomainError("CONFLICT", "No udhaar to remind about.");
    return ok({ action: r.action });
  });
}

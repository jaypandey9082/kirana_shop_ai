import { getSql } from "@/lib/db/client";
import { getMerchantId } from "@/lib/bills";
import { handle, ok } from "@/lib/api";

/** GET /api/events?after=<id> — newest events first, for the live log. */
export async function GET(request: Request) {
  return handle(async () => {
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0) || 0;
    const sql = getSql();
    const merchantId = await getMerchantId(sql);
    const events = await sql`
      select id::int, type, summary, verified, created_at as "createdAt"
      from events where merchant_id = ${merchantId} and id > ${after}
      order by id desc limit 100`;
    return ok({ events });
  });
}

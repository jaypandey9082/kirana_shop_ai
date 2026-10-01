import type { Tx } from "@/lib/db/client";

/** Append an event for the bill's merchant (or the demo merchant). */
export async function logEvent(sql: Tx, billId: string | null, type: string, summary: string, data: Record<string, unknown> = {}, verified = false) {
  await sql`insert into events (merchant_id, type, summary, data, verified)
            select coalesce((select merchant_id from bills where id = ${billId}), (select id from merchants limit 1)),
                   ${type}, ${summary}, ${sql.json(data as never)}, ${verified}`;
}

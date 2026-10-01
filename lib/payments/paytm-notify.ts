/** Shared handling for Paytm callback (browser redirect) and webhook (server-to-server) posts. */
import { getSql } from "@/lib/db/client";
import { paytmConfigFromEnv, verifyPaytmChecksum } from "./paytm";
import { confirmPayment, getPaymentMode } from "./service";

export async function readPaytmFields(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const json = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, String(v ?? "")]));
  }
  const form = await request.formData().catch(() => null);
  return form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) : {};
}

/**
 * Checksum first, then the Transaction Status API decides. The posted STATUS field is
 * never trusted on its own.
 */
export async function handlePaytmNotification(fields: Record<string, string>, source: "callback" | "webhook") {
  const config = paytmConfigFromEnv();
  if (getPaymentMode() !== "staging" || !config) return { ok: false as const, status: 404, error: "Paytm is not configured." };
  const orderId = fields.ORDERID;
  if (!orderId || !verifyPaytmChecksum(fields, config.key)) {
    const sql = getSql();
    await sql`insert into events (merchant_id, type, summary, data)
              select id, 'payment.rejected', ${`Paytm ${source} rejected: invalid or missing checksum${orderId ? ` (order ${orderId})` : ""}`}, ${sql.json({ source })}
              from merchants limit 1`;
    return { ok: false as const, status: 400, error: "Invalid checksum." };
  }
  const result = await confirmPayment(getSql(), orderId, `Paytm ${source}`);
  return { ok: true as const, status: 200, orderId, ...result };
}

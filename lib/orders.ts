/**
 * QR storefront orders (Section 10). An online order is a bill with channel = 'online'.
 * Prices and stock come from the catalogue on the server; the order joins the merchant's
 * queue (fulfilment RECEIVED) only after the payment is verified.
 */
import type { Sql, Tx } from "@/lib/db/client";
import { DomainError } from "@/lib/bills";
import { formatMoney } from "@/lib/format-money";

export interface StoreInfo { id: string; slug: string; name: string; locality: string; openTill: string; deliveryRadiusKm: number }
export interface StoreProduct { id: string; name: string; category: string; unit: string; pricePaise: number; stock: number }

export async function getStore(sql: Tx, slug: string): Promise<StoreInfo | null> {
  const [m] = await sql`select id, slug, name, locality, open_till, delivery_radius_km from merchants where slug = ${slug}`;
  return m ? { id: m.id, slug: m.slug, name: m.name, locality: m.locality, openTill: m.open_till, deliveryRadiusKm: Number(m.delivery_radius_km) } : null;
}

export async function storeCatalogue(sql: Tx, merchantId: string): Promise<StoreProduct[]> {
  return sql<StoreProduct[]>`select id, name, category, unit, price_paise "pricePaise", stock from products
                             where merchant_id = ${merchantId} and active order by category, name`;
}

export interface NewOrder {
  items: Array<{ productId: string; qty: number }>;
  name: string; phone?: string | null; mode: "pickup" | "delivery"; note?: string | null;
}

export async function createOnlineOrder(sql: Sql, merchantId: string, order: NewOrder): Promise<{ billId: string; number: number; totalPaise: number }> {
  if (!order.items.length || order.items.length > 40) throw new DomainError("INVALID", "Cart is empty.");
  if (order.mode === "delivery" && !order.note?.trim()) throw new DomainError("INVALID", "Delivery ke liye address likhiye.");
  return sql.begin(async (tx) => {
    await tx`select id from merchants where id = ${merchantId} for update`; // serialise bill numbers
    const merged = new Map<string, number>();
    for (const i of order.items) merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.qty);
    const ids = [...merged.keys()];
    const products = await tx<{ id: string; name: string; price_paise: number; stock: number }[]>`
      select id, name, price_paise, stock from products where merchant_id = ${merchantId} and active and id = any(${ids}::uuid[])`;
    if (products.length !== ids.length) throw new DomainError("INVALID", "Some items are no longer available.");
    for (const p of products) {
      const qty = merged.get(p.id)!;
      if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new DomainError("INVALID", "Quantity must be 1 to 20.");
      if (qty > p.stock) throw new DomainError("INVALID", p.stock === 0 ? `${p.name} khatam ho gaya hai.` : `${p.name}: sirf ${p.stock} bache hain.`);
    }
    const [b] = await tx<{ id: string; number: number }[]>`
      insert into bills (merchant_id, number, channel, status, confirmed_at, order_name, order_phone, order_mode, order_note)
      values (${merchantId}, (select coalesce(max(number), 1000) + 1 from bills where merchant_id = ${merchantId}), 'online', 'CONFIRMED', now(),
              ${order.name.trim()}, ${order.phone?.trim() || null}, ${order.mode}, ${order.note?.trim() || null})
      returning id, number`;
    for (const p of products) {
      await tx`insert into bill_items (bill_id, product_id, qty, unit_price_paise, source, confidence)
               values (${b.id}, ${p.id}, ${merged.get(p.id)!}, ${p.price_paise}, 'storefront', 1)`;
    }
    const [{ total }] = await tx<{ total: number }[]>`select sum(line_total_paise)::int total from bill_items where bill_id = ${b.id}`;
    await tx`update bills set total_paise = ${total} where id = ${b.id}`;
    await tx`insert into events (merchant_id, type, summary, data) values (${merchantId}, 'order.created',
      ${`Online order #${b.number} from ${order.name.trim()} · ${formatMoney(total)} · ${order.mode} · waiting for payment`}, ${tx.json({ billId: b.id })})`;
    return { billId: b.id, number: b.number, totalPaise: total };
  });
}

export type Fulfilment = "RECEIVED" | "PREPARING" | "READY" | "COMPLETED";
const NEXT: Record<Fulfilment, Fulfilment | null> = { RECEIVED: "PREPARING", PREPARING: "READY", READY: "COMPLETED", COMPLETED: null };

export interface OrderView {
  id: string; number: number; status: string; fulfilment: Fulfilment | null; totalPaise: number;
  name: string; phone: string | null; mode: string; note: string | null; createdAt: string;
  items: Array<{ name: string; qty: number }>;
}

async function orderViews(sql: Tx, where: { merchantId?: string; billId?: string }): Promise<OrderView[]> {
  const rows = await sql`
    select b.id, b.number, b.status, b.fulfilment, b.total_paise, b.order_name, b.order_phone, b.order_mode, b.order_note, b.created_at,
           coalesce(json_agg(json_build_object('name', p.name, 'qty', i.qty) order by p.name) filter (where i.id is not null), '[]') items
    from bills b left join bill_items i on i.bill_id = b.id left join products p on p.id = i.product_id
    where b.channel = 'online'
      ${where.merchantId ? sql`and b.merchant_id = ${where.merchantId} and b.created_at > now() - interval '2 days'` : sql``}
      ${where.billId ? sql`and b.id = ${where.billId}` : sql``}
    group by b.id order by b.created_at desc limit 50`;
  return rows.map((r) => ({
    id: r.id, number: r.number, status: r.status, fulfilment: r.fulfilment, totalPaise: r.total_paise,
    name: r.order_name ?? "Customer", phone: r.order_phone, mode: r.order_mode ?? "pickup", note: r.order_note,
    createdAt: r.created_at.toISOString(), items: r.items,
  }));
}

export const listOrders = (sql: Tx, merchantId: string) => orderViews(sql, { merchantId });
export async function getOrder(sql: Tx, billId: string) {
  const [o] = await orderViews(sql, { billId });
  if (!o) throw new DomainError("NOT_FOUND", "Order not found.");
  return o;
}

/** Move a paid order one step forward. Steps can't be skipped or reversed. */
export async function advanceOrder(sql: Sql, billId: string, to: Fulfilment): Promise<OrderView> {
  await sql.begin(async (tx) => {
    const [b] = await tx<{ merchant_id: string; number: number; status: string; fulfilment: Fulfilment | null; channel: string }[]>`
      select merchant_id, number, status, fulfilment, channel from bills where id = ${billId} for update`;
    if (!b || b.channel !== "online") throw new DomainError("NOT_FOUND", "Order not found.");
    if (b.status !== "PAID" || !b.fulfilment) throw new DomainError("CONFLICT", "Order is not paid yet.");
    if (NEXT[b.fulfilment] !== to) throw new DomainError("CONFLICT", `Order is ${b.fulfilment.toLowerCase()}; next step is ${NEXT[b.fulfilment]?.toLowerCase() ?? "none"}.`);
    await tx`update bills set fulfilment = ${to} where id = ${billId}`;
    await tx`insert into events (merchant_id, type, summary, data) values (${b.merchant_id}, 'order.status',
      ${`Online order #${b.number}: ${to.toLowerCase()}`}, ${tx.json({ billId, fulfilment: to })})`;
  });
  return getOrder(sql, billId);
}

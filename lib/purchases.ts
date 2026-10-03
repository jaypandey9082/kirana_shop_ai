/**
 * Distributor loop: approved reorder → purchase order → distributor accepts → "Maal aa gaya".
 *
 * - A purchase order is created only when an approved reorder executes (one per action).
 * - The distributor can accept (with a delivery time and short quantities) or reject.
 * - Receiving adds stock once, under row locks, and records the amount owed to the supplier.
 * - "Supplier ko diya" only records a payment made outside the app; no money moves here.
 * Distributor rates are demo assumptions (catalogue price less 15%), labelled in the UI.
 */
import type { Sql, Tx } from "@/lib/db/client";
import { DomainError } from "@/lib/bills";
import { demoCostPaise, supplierByName } from "@/lib/demo/suppliers";
import { formatMoney } from "@/lib/format-money";

export type PoStatus = "SENT" | "ACCEPTED" | "REJECTED" | "RECEIVED";
export interface PoItem { id: string; productId: string; name: string; category: string; qtyOrdered: number; qtyConfirmed: number | null; unitCostPaise: number }
export interface PurchaseOrder {
  id: string; number: number; shop: string; supplierSlug: string; supplierName: string; status: PoStatus;
  eta: string | null; note: string | null; totalPaise: number; createdAt: string; acceptedAt: string | null;
  receivedAt: string | null; paidAt: string | null; items: PoItem[];
}

const qtyOf = (i: { qtyOrdered: number; qtyConfirmed: number | null }) => i.qtyConfirmed ?? i.qtyOrdered;

async function event(tx: Tx, merchantId: string, type: string, summary: string, data: Record<string, unknown>) {
  await tx`insert into events (merchant_id, type, summary, data) values (${merchantId}, ${type}, ${summary}, ${tx.json(data as never)})`;
}

/** Called inside markExecuted for an approved reorder. Idempotent (unique action_id). */
export async function createFromReorder(tx: Tx, action: { id: string; merchant_id: string; payload: Record<string, unknown> }) {
  const productId = String(action.payload.productId ?? "");
  const qty = Number(action.payload.qty);
  if (!productId || !Number.isInteger(qty) || qty <= 0) return null;
  const [p] = await tx<{ name: string; price_paise: number }[]>`select name, price_paise from products where id = ${productId} and merchant_id = ${action.merchant_id}`;
  if (!p) return null;
  const supplier = supplierByName(String(action.payload.supplier ?? action.payload.to ?? ""));
  const cost = demoCostPaise(p.price_paise);
  const [po] = await tx<{ id: string; number: number }[]>`
    insert into purchase_orders (merchant_id, action_id, supplier_slug, supplier_name, total_paise)
    values (${action.merchant_id}, ${action.id}, ${supplier.slug}, ${supplier.name}, ${cost * qty})
    on conflict (action_id) do nothing returning id, number`;
  if (!po) return null;
  await tx`insert into purchase_order_items (po_id, product_id, qty_ordered, unit_cost_paise) values (${po.id}, ${productId}, ${qty}, ${cost})`;
  await event(tx, action.merchant_id, "po.sent", `Order #${po.number} sent to ${supplier.name}: ${p.name} × ${qty} (≈${formatMoney(cost * qty)} at demo rate)`, { poId: po.id });
  return po.id;
}

async function views(sql: Tx, where: { merchantId?: string; supplierSlug?: string; id?: string }): Promise<PurchaseOrder[]> {
  const rows = await sql<Array<Omit<PurchaseOrder, "items">>>`
    select po.id, po.number, m.name shop, po.supplier_slug "supplierSlug", po.supplier_name "supplierName", po.status, po.eta, po.note,
           po.total_paise "totalPaise", po.created_at "createdAt", po.accepted_at "acceptedAt", po.received_at "receivedAt", po.paid_at "paidAt"
    from purchase_orders po join merchants m on m.id = po.merchant_id
    where (${where.merchantId ?? null}::uuid is null or po.merchant_id = ${where.merchantId ?? null})
      and (${where.supplierSlug ?? null}::text is null or po.supplier_slug = ${where.supplierSlug ?? null})
      and (${where.id ?? null}::uuid is null or po.id = ${where.id ?? null})
    order by po.created_at desc limit 50`;
  if (!rows.length) return [];
  const items = await sql<Array<PoItem & { poId: string }>>`
    select i.id, i.po_id "poId", i.product_id "productId", p.name, p.category, i.qty_ordered "qtyOrdered", i.qty_confirmed "qtyConfirmed", i.unit_cost_paise "unitCostPaise"
    from purchase_order_items i join products p on p.id = i.product_id where i.po_id in ${sql(rows.map((r) => r.id))} order by p.name`;
  return rows.map((r) => ({ ...r, items: items.filter((i) => i.poId === r.id).map((i) => ({ id: i.id, productId: i.productId, name: i.name, category: i.category, qtyOrdered: i.qtyOrdered, qtyConfirmed: i.qtyConfirmed, unitCostPaise: i.unitCostPaise })) }));
}

export const listForMerchant = (sql: Sql, merchantId: string) => views(sql, { merchantId });
/** A distributor's incoming orders; "all" lists every demo distributor (projector view). */
export const listForSupplier = (sql: Sql, slug: string) => views(sql, slug === "all" ? {} : { supplierSlug: slug });
export async function getPurchaseOrder(sql: Tx, id: string): Promise<PurchaseOrder> {
  const [po] = await views(sql, { id });
  if (!po) throw new DomainError("NOT_FOUND", "Order not found.");
  return po;
}

async function lock(tx: Tx, id: string) {
  const [po] = await tx<{ merchant_id: string; number: number; status: PoStatus; supplier_name: string; paid_at: Date | null; total_paise: number }[]>`
    select merchant_id, number, status, supplier_name, paid_at, total_paise from purchase_orders where id = ${id} for update`;
  if (!po) throw new DomainError("NOT_FOUND", "Order not found.");
  return po;
}

/** Distributor confirms what they can send and when. Quantities may be short, never more than ordered. */
export async function acceptOrder(sql: Sql, id: string, input: { eta: string; items?: Array<{ id: string; qty: number }> }) {
  await sql.begin(async (tx) => {
    const po = await lock(tx, id);
    if (po.status === "ACCEPTED") return;
    if (po.status !== "SENT") throw new DomainError("CONFLICT", `Order is already ${po.status.toLowerCase()}.`);
    const items = await tx<{ id: string; qty_ordered: number; unit_cost_paise: number; name: string }[]>`
      select i.id, i.qty_ordered, i.unit_cost_paise, p.name from purchase_order_items i join products p on p.id = i.product_id where i.po_id = ${id}`;
    let total = 0;
    for (const it of items) {
      const want = input.items?.find((x) => x.id === it.id)?.qty ?? it.qty_ordered;
      if (!Number.isInteger(want) || want < 0 || want > it.qty_ordered) throw new DomainError("INVALID", `Quantity for ${it.name} must be 0–${it.qty_ordered}.`);
      await tx`update purchase_order_items set qty_confirmed = ${want} where id = ${it.id}`;
      total += want * it.unit_cost_paise;
    }
    if (total === 0) throw new DomainError("INVALID", "Nothing to send. Reject the order instead.");
    await tx`update purchase_orders set status = 'ACCEPTED', eta = ${input.eta}, accepted_at = now(), total_paise = ${total} where id = ${id}`;
    const short = items.filter((it) => (input.items?.find((x) => x.id === it.id)?.qty ?? it.qty_ordered) < it.qty_ordered);
    await event(tx, po.merchant_id, "po.accepted",
      `${po.supplier_name} accepted order #${po.number} · delivery ${input.eta} · ${formatMoney(total)}${short.length ? ` · short: ${short.map((s) => s.name).join(", ")}` : ""}`, { poId: id });
  });
  return getPurchaseOrder(sql, id);
}

export async function rejectOrder(sql: Sql, id: string, note: string) {
  await sql.begin(async (tx) => {
    const po = await lock(tx, id);
    if (po.status === "REJECTED") return;
    if (po.status !== "SENT") throw new DomainError("CONFLICT", `Order is already ${po.status.toLowerCase()}.`);
    await tx`update purchase_orders set status = 'REJECTED', note = ${note} where id = ${id}`;
    await event(tx, po.merchant_id, "po.rejected", `${po.supplier_name} can't supply order #${po.number}: ${note}`, { poId: id });
  });
  return getPurchaseOrder(sql, id);
}

/** "Maal aa gaya": add the received quantities to stock exactly once. */
export async function receiveOrder(sql: Sql, id: string) {
  const deltas: Array<{ productId: string; name: string; before: number; after: number }> = [];
  await sql.begin(async (tx) => {
    const po = await lock(tx, id);
    if (po.status === "RECEIVED") return;
    if (po.status === "REJECTED") throw new DomainError("CONFLICT", "This order was rejected by the distributor.");
    const items = await tx<{ product_id: string; qty_ordered: number; qty_confirmed: number | null; unit_cost_paise: number }[]>`
      select product_id, qty_ordered, qty_confirmed, unit_cost_paise from purchase_order_items where po_id = ${id} order by product_id`;
    let total = 0;
    for (const it of items) {
      const qty = qtyOf({ qtyOrdered: it.qty_ordered, qtyConfirmed: it.qty_confirmed });
      total += qty * it.unit_cost_paise;
      if (qty === 0) continue;
      const [p] = await tx<{ name: string; stock: number }[]>`select name, stock from products where id = ${it.product_id} for update`;
      await tx`update products set stock = stock + ${qty} where id = ${it.product_id}`;
      await tx`insert into stock_movements (product_id, delta, reason, po_id) values (${it.product_id}, ${qty}, 'restock', ${id})`;
      deltas.push({ productId: it.product_id, name: p.name, before: p.stock, after: p.stock + qty });
    }
    await tx`update purchase_orders set status = 'RECEIVED', received_at = now(), total_paise = ${total} where id = ${id}`;
    await event(tx, po.merchant_id, "stock.received",
      `Maal aa gaya (order #${po.number}, ${po.supplier_name}): ${deltas.map((d) => `${d.name} ${d.before} → ${d.after}`).join(", ")} · ${formatMoney(total)} dena hai`, { poId: id });
  });
  return { order: await getPurchaseOrder(sql, id), stock: deltas };
}

/** Records that the shopkeeper paid the supplier outside the app (cash/UPI). No money moves here. */
export async function markSupplierPaid(sql: Sql, id: string) {
  await sql.begin(async (tx) => {
    const po = await lock(tx, id);
    if (po.paid_at) return;
    if (po.status !== "RECEIVED") throw new DomainError("CONFLICT", "Pay after the goods are received.");
    await tx`update purchase_orders set paid_at = now() where id = ${id}`;
    await event(tx, po.merchant_id, "supplier.paid", `Paid ${po.supplier_name} ${formatMoney(po.total_paise)} for order #${po.number} (recorded by shopkeeper)`, { poId: id });
  });
  return getPurchaseOrder(sql, id);
}

/** What the shop owes suppliers: received, not yet paid. */
export async function supplierDues(sql: Tx, merchantId: string) {
  const rows = await sql<{ supplier: string; total: number; orders: number }[]>`
    select supplier_name supplier, sum(total_paise)::int total, count(*)::int orders from purchase_orders
    where merchant_id = ${merchantId} and status = 'RECEIVED' and paid_at is null group by supplier_name order by total desc`;
  return { totalPaise: rows.reduce((s, r) => s + r.total, 0), suppliers: rows, source: "purchase orders received, not yet paid" };
}

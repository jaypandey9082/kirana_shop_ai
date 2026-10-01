/**
 * Deterministic insight engine (Section 7). Plain SQL + TypeScript, no LLM.
 * Salaahkaar may only state numbers that come from these functions, and every
 * result carries a human-readable `source` the UI shows under the number.
 * All functions take `now` so results are reproducible in tests.
 */
import type { Tx } from "@/lib/db/client";
import { formatMoney } from "@/lib/format-money";
import { istAt, istParts } from "@/lib/time";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CLOSE_HOUR = 22;
const IST_HOUR = (d: Date) => istParts(d).hour + istParts(d).minute / 60;

// ------------------------------------------------------------------ sales

export type SalesPeriod = "today" | "yesterday" | "last7";
export interface SalesSummary {
  period: SalesPeriod; label: string;
  totalPaise: number; bills: number; paidPaise: number; creditPaise: number;
  compareLabel: string; compareTotalPaise: number; changePct: number | null;
  topItems: Array<{ name: string; qty: number; totalPaise: number }>;
  source: string;
}

function windows(period: SalesPeriod, now: Date) {
  if (period === "today") {
    const start = istAt(now, 0);
    return { start, end: now, prevStart: new Date(start.getTime() - 7 * DAY), prevEnd: new Date(now.getTime() - 7 * DAY), label: "aaj", compareLabel: "pichhle hafte isi din, isi samay tak" };
  }
  if (period === "yesterday") {
    const start = istAt(now, -1);
    const end = istAt(now, 0);
    return { start, end, prevStart: new Date(start.getTime() - 7 * DAY), prevEnd: new Date(end.getTime() - 7 * DAY), label: "kal", compareLabel: "pichhle hafte isi din" };
  }
  const start = new Date(now.getTime() - 7 * DAY);
  return { start, end: now, prevStart: new Date(start.getTime() - 7 * DAY), prevEnd: start, label: "pichhle 7 din", compareLabel: "usse pehle ke 7 din" };
}

export async function salesSummary(sql: Tx, merchantId: string, period: SalesPeriod = "today", now = new Date()): Promise<SalesSummary> {
  const w = windows(period, now);
  const [cur] = await sql<{ total: number; bills: number; paid: number; credit: number }[]>`
    select coalesce(sum(total_paise), 0)::int total, count(*)::int bills,
           coalesce(sum(total_paise) filter (where status = 'PAID'), 0)::int paid,
           coalesce(sum(total_paise) filter (where status = 'ON_CREDIT'), 0)::int credit
    from bills where merchant_id = ${merchantId} and status in ('PAID', 'ON_CREDIT')
      and settled_at >= ${w.start} and settled_at < ${w.end}`;
  const [prev] = await sql<{ total: number }[]>`
    select coalesce(sum(total_paise), 0)::int total from bills
    where merchant_id = ${merchantId} and status in ('PAID', 'ON_CREDIT')
      and settled_at >= ${w.prevStart} and settled_at < ${w.prevEnd}`;
  const top = await sql<{ name: string; qty: number; total: number }[]>`
    select p.name, sum(i.qty)::int qty, sum(i.line_total_paise)::int total
    from bills b join bill_items i on i.bill_id = b.id join products p on p.id = i.product_id
    where b.merchant_id = ${merchantId} and b.status in ('PAID', 'ON_CREDIT')
      and b.settled_at >= ${w.start} and b.settled_at < ${w.end}
    group by p.name order by total desc, p.name limit 3`;
  return {
    period, label: w.label,
    totalPaise: cur.total, bills: cur.bills, paidPaise: cur.paid, creditPaise: cur.credit,
    compareLabel: w.compareLabel, compareTotalPaise: prev.total,
    changePct: prev.total > 0 ? Math.round(((cur.total - prev.total) / prev.total) * 100) : null,
    topItems: top.map((t) => ({ name: t.name, qty: t.qty, totalPaise: t.total })),
    source: `${w.label} ke ${cur.bills} bills (paid + udhaar) · bill register`,
  };
}

// ------------------------------------------------------------------ stock

export interface LowStockItem { productId: string; sku: string; name: string; stock: number; reorderLevel: number; unit: string }
export async function lowStock(sql: Tx, merchantId: string): Promise<{ items: LowStockItem[]; source: string }> {
  const items = await sql<LowStockItem[]>`
    select id "productId", sku, name, stock, reorder_level "reorderLevel", unit
    from products where merchant_id = ${merchantId} and active and stock < reorder_level
    order by stock::float / nullif(reorder_level, 0), name`;
  return { items, source: "stock register · reorder levels" };
}

export interface RunoutForecast {
  productId: string; sku: string; name: string; stock: number;
  /** Units normally sold between now and the next restock (7-day average). */
  expectedUntilRestock: number;
  /** Typical units sold in the evening rush (17:00–22:00), 7-day average. */
  typicalEvening: number;
  runsOutAt: string | null; nextRestockAt: string; atRisk: boolean;
  source: string;
}

/**
 * For each product: average units sold per hour of day over the last 7 days, walked
 * forward from `now` to the next morning restock. If expected demand exceeds stock,
 * the item is at risk and we estimate when it runs out.
 */
export async function forecastRunout(sql: Tx, merchantId: string, now = new Date(), sku?: string): Promise<{ items: RunoutForecast[]; source: string }> {
  const [m] = await sql<{ restock_hour: number }[]>`select restock_hour from merchants where id = ${merchantId}`;
  const since = istAt(now, -7);
  const until = istAt(now, 0);
  const rows = await sql<{ product_id: string; sku: string; name: string; stock: number; hr: number | null; units: number }[]>`
    select p.id product_id, p.sku, p.name, p.stock,
           extract(hour from (m.created_at at time zone 'Asia/Kolkata'))::int as hr, coalesce(sum(-m.delta), 0)::int units
    from products p
    left join stock_movements m on m.product_id = p.id and m.reason = 'sale' and m.created_at >= ${since} and m.created_at < ${until}
    where p.merchant_id = ${merchantId} and p.active ${sku ? sql`and p.sku = ${sku}` : sql``}
    group by p.id, p.sku, p.name, p.stock, hr`;

  const products = new Map<string, { sku: string; name: string; stock: number; perHour: number[] }>();
  for (const r of rows) {
    const p = products.get(r.product_id) ?? { sku: r.sku, name: r.name, stock: r.stock, perHour: Array(24).fill(0) };
    if (r.hr !== null && r.hr !== undefined) p.perHour[r.hr] += r.units / 7;
    products.set(r.product_id, p);
  }

  const restockToday = istAt(now, 0, m.restock_hour);
  const nextRestock = now < restockToday ? restockToday : istAt(now, 1, m.restock_hour);
  const items: RunoutForecast[] = [];
  for (const [productId, p] of products) {
    let expected = 0;
    let runsOutAt: Date | null = p.stock === 0 ? now : null;
    let remaining = p.stock;
    // Walk hour by hour (first and last steps may be partial) until the next restock.
    let t = now.getTime();
    while (t < nextRestock.getTime()) {
      const at = new Date(t);
      const nextHour = t + (1 - (IST_HOUR(at) % 1)) * HOUR;
      const stepEnd = Math.min(nextHour, nextRestock.getTime());
      const fraction = (stepEnd - t) / HOUR;
      const demand = p.perHour[istParts(at).hour] * fraction;
      if (!runsOutAt && demand > 0 && remaining - demand <= 0) runsOutAt = new Date(t + (remaining / demand) * (stepEnd - t));
      remaining -= demand;
      expected += demand;
      t = Math.max(stepEnd, t + 1000); // guard against float stalls
    }
    const evening = p.perHour.slice(17, CLOSE_HOUR).reduce((s, x) => s + x, 0);
    items.push({
      productId, sku: p.sku, name: p.name, stock: p.stock,
      expectedUntilRestock: Math.round(expected * 10) / 10,
      typicalEvening: Math.round(evening * 10) / 10,
      runsOutAt: runsOutAt?.toISOString() ?? null, nextRestockAt: nextRestock.toISOString(),
      atRisk: p.stock < expected,
      source: "pichhle 7 din ki bikri (ghante ke hisaab se) · stock register",
    });
  }
  items.sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || (a.runsOutAt ?? "9").localeCompare(b.runsOutAt ?? "9") || a.name.localeCompare(b.name));
  return { items: sku ? items : items.filter((i) => i.atRisk), source: "pichhle 7 din ki bikri (ghante ke hisaab se) · stock register" };
}

export interface SlowMover { productId: string; name: string; stock: number; soldInPeriod: number; daysOfCover: number | null; stockValuePaise: number }
export async function slowMovers(sql: Tx, merchantId: string, now = new Date(), days = 14): Promise<{ items: SlowMover[]; source: string }> {
  const since = new Date(now.getTime() - days * DAY);
  const rows = await sql<{ id: string; name: string; stock: number; price: number; sold: number }[]>`
    select p.id, p.name, p.stock, p.price_paise price, coalesce(sum(-m.delta), 0)::int sold
    from products p left join stock_movements m on m.product_id = p.id and m.reason = 'sale' and m.created_at >= ${since} and m.created_at < ${now}
    where p.merchant_id = ${merchantId} and p.active and p.stock > 0
    group by p.id`;
  const items = rows
    .map((r) => ({ productId: r.id, name: r.name, stock: r.stock, soldInPeriod: r.sold, daysOfCover: r.sold > 0 ? Math.round((r.stock / (r.sold / days)) * 10) / 10 : null, stockValuePaise: r.stock * r.price }))
    .filter((r) => r.daysOfCover === null || r.daysOfCover > 21)
    .sort((a, b) => b.stockValuePaise - a.stockValuePaise)
    .slice(0, 5);
  return { items, source: `pichhle ${days} din ki bikri · stock register` };
}

// ------------------------------------------------------------------ khata

export interface CustomerDues { customerId: string; name: string; balancePaise: number; oldestUnpaidAt: string | null; daysOverdue: number; bucket: "0–15" | "16–30" | "30+" }

/** Balances with FIFO ageing: payments settle the oldest udhaar first. */
export async function khataDues(sql: Tx, merchantId: string, now = new Date()): Promise<CustomerDues[]> {
  const rows = await sql<{ customer_id: string; name: string; type: "debit" | "credit"; amount_paise: number; created_at: Date }[]>`
    select c.id customer_id, c.name, k.type, k.amount_paise, k.created_at
    from customers c join khata_entries k on k.customer_id = c.id
    where c.merchant_id = ${merchantId} order by c.id, k.created_at, k.id`;
  const by = new Map<string, { name: string; debits: Array<{ amount: number; at: Date }>; credit: number }>();
  for (const r of rows) {
    const c = by.get(r.customer_id) ?? { name: r.name, debits: [], credit: 0 };
    if (r.type === "debit") c.debits.push({ amount: r.amount_paise, at: r.created_at }); else c.credit += r.amount_paise;
    by.set(r.customer_id, c);
  }
  const out: CustomerDues[] = [];
  for (const [customerId, c] of by) {
    let credit = c.credit;
    let oldest: Date | null = null;
    let balance = 0;
    for (const d of c.debits) {
      const settled = Math.min(credit, d.amount);
      credit -= settled;
      const open = d.amount - settled;
      if (open > 0) { balance += open; oldest ??= d.at; }
    }
    balance -= credit; // advance payments beyond all debits
    if (balance <= 0) continue;
    // Calendar days in IST, as a shopkeeper counts them ("20 din purana").
    const daysOverdue = oldest ? Math.round((istAt(now, 0).getTime() - istAt(oldest, 0).getTime()) / DAY) : 0;
    out.push({ customerId, name: c.name, balancePaise: balance, oldestUnpaidAt: oldest?.toISOString() ?? null, daysOverdue, bucket: daysOverdue > 30 ? "30+" : daysOverdue > 15 ? "16–30" : "0–15" });
  }
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue || b.balancePaise - a.balancePaise);
}

export async function overdueDues(sql: Tx, merchantId: string, now = new Date(), minDays = 30) {
  const all = await khataDues(sql, merchantId, now);
  const items = all.filter((d) => d.daysOverdue > minDays);
  const totalPaise = items.reduce((s, d) => s + d.balancePaise, 0);
  return {
    items, totalPaise, minDays,
    allOutstandingPaise: all.reduce((s, d) => s + d.balancePaise, 0),
    source: `Khata ledger · ${minDays}+ din purana udhaar (pehle ka udhaar pehle chukta maana gaya)`,
    summary: items.length ? `${items.length} customers ka ${formatMoney(totalPaise)} ${minDays} din se zyada purana hai` : `${minDays} din se purana koi udhaar nahi`,
  };
}

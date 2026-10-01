/**
 * Deterministic synthetic history for the demo store.
 * Same seed + same anchor time => identical rows. Pure function: no I/O.
 * All data here is synthetic demo data and is labelled as such in the UI.
 */
import { CATALOGUE, type CatalogueItem } from "./catalogue";
import { intBetween, mulberry32, pickWeighted, uuidFrom, type Rng } from "./rng";
import { istAt, istParts } from "@/lib/time";

export const DEMO_SEED = 20261003;
export const DEMO_MERCHANT_SLUG = "sharma-general-store";
export const HISTORY_DAYS = 45;
export const RESTOCK_HOUR = 7;

/** Khata customers with their open (unpaid) udhaar. Oldest open entry sets the ageing. */
export const KHATA_CUSTOMERS: ReadonlyArray<{ name: string; open: ReadonlyArray<{ daysAgo: number; rupees: number }> }> = [
  { name: "Ramesh K.", open: [{ daysAgo: 42, rupees: 380 }, { daysAgo: 20, rupees: 600 }] },
  { name: "Sunita P.", open: [{ daysAgo: 35, rupees: 420 }, { daysAgo: 12, rupees: 300 }] },
  { name: "Anil M.", open: [{ daysAgo: 31, rupees: 450 }] },
  { name: "Vikram J.", open: [{ daysAgo: 18, rupees: 1120 }] },
  { name: "Imran K.", open: [{ daysAgo: 15, rupees: 810 }, { daysAgo: 7, rupees: 500 }] },
  { name: "Priya S.", open: [{ daysAgo: 14, rupees: 750 }, { daysAgo: 5, rupees: 500 }] },
  { name: "Farida S.", open: [{ daysAgo: 11, rupees: 460 }, { daysAgo: 3, rupees: 300 }] },
  { name: "Joseph D.", open: [{ daysAgo: 10, rupees: 590 }, { daysAgo: 2, rupees: 300 }] },
  { name: "Mohan D.", open: [{ daysAgo: 9, rupees: 980 }] },
  { name: "Lata P.", open: [{ daysAgo: 8, rupees: 620 }] },
  { name: "Kavita R.", open: [{ daysAgo: 6, rupees: 540 }] },
  { name: "Neha G.", open: [{ daysAgo: 4, rupees: 430 }] },
  { name: "Suresh N.", open: [{ daysAgo: 3, rupees: 870 }] },
  { name: "Deepa M.", open: [{ daysAgo: 1, rupees: 720 }] },
];

// First names for synthetic online orders.
const ONLINE_NAMES = ["Asha", "Rohit", "Meena", "Arjun", "Zainab", "Kiran", "Pooja", "Sameer", "Nisha", "Vivek"];

// Relative footfall by hour (shop open 07:00-22:00).
const HOURS: ReadonlyArray<[number, number]> = [
  [7, 4], [8, 7], [9, 7], [10, 5], [11, 4], [12, 4], [13, 3], [14, 3],
  [15, 3], [16, 4], [17, 6], [18, 8], [19, 9], [20, 8], [21, 5],
];

export interface MerchantRow { id: string; slug: string; name: string; locality: string; open_till: string; delivery_radius_km: number; restock_hour: number; created_at: Date }
export interface ProductRow { id: string; merchant_id: string; sku: string; name: string; category: string; unit: string; aliases: string[]; price_paise: number; stock: number; reorder_level: number; barcode: string; active: boolean }
export interface CustomerRow { id: string; merchant_id: string; name: string; phone: string | null; created_at: Date }
export interface BillRow { id: string; merchant_id: string; number: number; channel: "counter" | "online"; status: "PAID" | "ON_CREDIT"; payment_method: "paytm" | "cash" | "udhaar"; fulfilment: "COMPLETED" | null; customer_id: string | null; total_paise: number; created_at: Date; confirmed_at: Date; settled_at: Date; order_name: string | null; order_mode: "pickup" | "delivery" | null }
export interface BillItemRow { id: string; bill_id: string; product_id: string; qty: number; unit_price_paise: number; source: "manual" | "storefront"; confidence: null; raw_text: null }
export interface StockMovementRow { product_id: string; delta: number; reason: "opening" | "restock" | "sale" | "adjustment"; bill_id: string | null; created_at: Date }
export interface KhataEntryRow { customer_id: string; type: "debit" | "credit"; amount_paise: number; bill_id: string | null; payment_id: null; note: string | null; created_at: Date }
export interface EventRow { merchant_id: string; type: string; summary: string; data: Record<string, unknown>; verified: boolean; created_at: Date }

export interface DemoDataset {
  anchor: Date;
  merchant: MerchantRow;
  products: ProductRow[];
  customers: CustomerRow[];
  bills: BillRow[];
  billItems: BillItemRow[];
  stockMovements: StockMovementRow[];
  khataEntries: KhataEntryRow[];
  events: EventRow[];
}

interface DraftLine { product: number; qty: number }
interface DraftBill { at: Date; channel: "counter" | "online"; method: "paytm" | "cash" | "udhaar"; customer: number | null; lines: DraftLine[] }

/** EAN-13 in the GS1 "200" restricted-circulation range (in-store codes), so it can't clash with real products. */
function demoBarcode(index: number): string {
  const body = `200${String(index + 1).padStart(9, "0")}`;
  const sum = body.split("").reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return body + ((10 - (sum % 10)) % 10);
}

function quantityFor(rng: Rng, p: CatalogueItem): number {
  if (p.sku === "DAI-001") return pickWeighted(rng, [1, 2, 3], (q) => ({ 1: 45, 2: 40, 3: 15 })[q]!);
  if (p.priceRupees <= 2) return intBetween(rng, 1, 4);
  return pickWeighted(rng, [1, 2, 3], (q) => ({ 1: 85, 2: 12, 3: 3 })[q]!);
}

function randomLines(rng: Rng): DraftLine[] {
  const count = pickWeighted(rng, [1, 2, 3, 4, 5], (n) => ({ 1: 35, 2: 30, 3: 20, 4: 10, 5: 5 })[n]!);
  const chosen = new Set<number>();
  while (chosen.size < count) chosen.add(CATALOGUE.indexOf(pickWeighted(rng, CATALOGUE, (p) => p.demand)));
  return [...chosen].map((product) => ({ product, qty: quantityFor(rng, CATALOGUE[product]) }));
}

/** Pick products whose total is exactly `rupees` (used for udhaar bills with a known amount). */
function exactBasket(rng: Rng, rupees: number): DraftLine[] {
  const picks: number[] = [];
  let left = rupees;
  while (left > 150) {
    const options = CATALOGUE.map((_, i) => i).filter((i) => CATALOGUE[i].priceRupees <= left - 20 && CATALOGUE[i].sku !== "DAI-001");
    const i = pickWeighted(rng, options, (j) => CATALOGUE[j].demand + 1);
    picks.push(i);
    left -= CATALOGUE[i].priceRupees;
  }
  // Fewest-items exact fill for the remainder (unbounded coin change on prices).
  const best: Array<number[] | null> = Array.from({ length: left + 1 }, () => null);
  best[0] = [];
  for (let v = 1; v <= left; v++) {
    for (let i = 0; i < CATALOGUE.length; i++) {
      const price = CATALOGUE[i].priceRupees;
      if (CATALOGUE[i].sku === "DAI-001" || price > v) continue;
      const prev = best[v - price];
      if (prev && (!best[v] || prev.length + 1 < best[v]!.length)) best[v] = [...prev, i];
    }
  }
  if (!best[left]) throw new Error(`Cannot fill udhaar basket of ₹${rupees}`);
  const qty = new Map<number, number>();
  for (const i of [...picks, ...best[left]!]) qty.set(i, (qty.get(i) ?? 0) + 1);
  return [...qty].map(([product, q]) => ({ product, qty: q }));
}

export function generateDemoData(anchor: Date, seed = DEMO_SEED): DemoDataset {
  const rng = mulberry32(seed);
  const id = () => uuidFrom(rng);
  const start = istAt(anchor, -HISTORY_DAYS, 6);

  const merchant: MerchantRow = {
    id: id(), slug: DEMO_MERCHANT_SLUG, name: "Sharma General Store", locality: "Mumbai",
    open_till: "10 pm", delivery_radius_km: 1, restock_hour: RESTOCK_HOUR, created_at: start,
  };
  const productIds = CATALOGUE.map(() => id());
  const customers: CustomerRow[] = KHATA_CUSTOMERS.map((c) => ({ id: id(), merchant_id: merchant.id, name: c.name, phone: null, created_at: start }));

  // ---- 1. Draft every sale (walk-in, online and udhaar) ----
  const drafts: DraftBill[] = [];
  const cutoff = anchor.getTime() - 2 * 60_000;
  const timeOn = (dayOffset: number) => {
    const hour = pickWeighted(rng, HOURS, (h) => h[1])[0];
    return istAt(anchor, dayOffset, hour, intBetween(rng, 0, 59), intBetween(rng, 0, 59));
  };
  for (let d = -(HISTORY_DAYS - 1); d <= 0; d++) {
    const weekday = istParts(istAt(anchor, d, 12)).weekday;
    const weekend = weekday === 0 || weekday === 6;
    const walkIns = Math.round((weekend ? 66 : 56) * (0.9 + 0.2 * rng()));
    const online = intBetween(rng, 2, 4);
    for (let i = 0; i < walkIns + online; i++) {
      const at = timeOn(d);
      const isOnline = i >= walkIns;
      const lines = randomLines(rng);
      if (at.getTime() > cutoff) continue;
      drafts.push({ at, channel: isOnline ? "online" : "counter", method: isOnline || rng() < 0.58 ? "paytm" : "cash", customer: null, lines });
    }
  }

  const khataEntries: KhataEntryRow[] = [];
  const udhaarDrafts: Array<DraftBill & { note: string }> = [];
  KHATA_CUSTOMERS.forEach((spec, ci) => {
    const oldest = Math.max(...spec.open.map((o) => o.daysAgo));
    // One older udhaar that was later paid back in cash (keeps the ledger realistic, FIFO-consistent).
    if (oldest + 2 <= HISTORY_DAYS - 1) {
      const daysAgo = intBetween(rng, oldest + 2, HISTORY_DAYS - 1);
      const rupees = intBetween(rng, 15, 60) * 10;
      udhaarDrafts.push({ at: timeOn(-daysAgo), channel: "counter", method: "udhaar", customer: ci, lines: exactBasket(rng, rupees), note: "Udhaar" });
      khataEntries.push({ customer_id: customers[ci].id, type: "credit", amount_paise: rupees * 100, bill_id: null, payment_id: null, note: "Paid in cash (demo history)", created_at: istAt(anchor, -daysAgo + 1, 19, intBetween(rng, 0, 59)) });
    }
    for (const open of spec.open) {
      udhaarDrafts.push({ at: timeOn(-open.daysAgo), channel: "counter", method: "udhaar", customer: ci, lines: exactBasket(rng, open.rupees), note: "Udhaar" });
    }
  });
  for (const u of udhaarDrafts) if (u.at.getTime() > cutoff) u.at = new Date(cutoff - 60 * 60_000);

  const allDrafts = [...drafts, ...udhaarDrafts].sort((a, b) => a.at.getTime() - b.at.getTime());

  // ---- 2. Bills, items and khata debits ----
  const bills: BillRow[] = [];
  const billItems: BillItemRow[] = [];
  allDrafts.forEach((draft, n) => {
    const billId = id();
    const total = draft.lines.reduce((s, l) => s + l.qty * CATALOGUE[l.product].priceRupees * 100, 0);
    const credit = draft.method === "udhaar";
    bills.push({
      id: billId, merchant_id: merchant.id, number: 1001 + n, channel: draft.channel,
      status: credit ? "ON_CREDIT" : "PAID", payment_method: draft.method,
      fulfilment: draft.channel === "online" ? "COMPLETED" : null,
      customer_id: draft.customer === null ? null : customers[draft.customer].id,
      total_paise: total, created_at: draft.at, confirmed_at: draft.at, settled_at: draft.at,
      order_name: draft.channel === "online" ? ONLINE_NAMES[n % ONLINE_NAMES.length] : null,
      order_mode: draft.channel === "online" ? (n % 3 === 0 ? "delivery" : "pickup") : null,
    });
    for (const l of draft.lines) {
      billItems.push({ id: id(), bill_id: billId, product_id: productIds[l.product], qty: l.qty, unit_price_paise: CATALOGUE[l.product].priceRupees * 100, source: draft.channel === "online" ? "storefront" : "manual", confidence: null, raw_text: null });
    }
    if (credit) khataEntries.push({ customer_id: customers[draft.customer!].id, type: "debit", amount_paise: total, bill_id: billId, payment_id: null, note: "Udhaar bill", created_at: draft.at });
  });

  // ---- 3. Stock simulation (restocks + sales in time order) ----
  const stock = CATALOGUE.map(() => 0);
  const movements: StockMovementRow[] = [];
  const restockAt = new Map<number, Date[]>(); // product -> times of scheduled restocks
  CATALOGUE.forEach((p, i) => {
    movements.push({ product_id: productIds[i], delta: p.par, reason: "opening", bill_id: null, created_at: start });
    stock[i] = p.par;
    const times: Date[] = [];
    for (let d = -(HISTORY_DAYS - 1); d <= 0; d++) {
      const t = istAt(anchor, d, RESTOCK_HOUR);
      if (t.getTime() > cutoff) continue;
      times.push(t);
    }
    restockAt.set(i, times);
  });
  type Step = { at: Date; kind: "restock"; product: number } | { at: Date; kind: "sale"; bill: number };
  const steps: Step[] = [];
  restockAt.forEach((times, product) => times.forEach((at) => steps.push({ at, kind: "restock", product })));
  bills.forEach((b, bill) => steps.push({ at: b.created_at, kind: "sale", bill }));
  steps.sort((a, b) => a.at.getTime() - b.at.getTime() || (a.kind === "restock" ? -1 : 1));

  const itemsByBill = new Map<string, BillItemRow[]>();
  for (const it of billItems) itemsByBill.set(it.bill_id, [...(itemsByBill.get(it.bill_id) ?? []), it]);
  const indexById = new Map(productIds.map((pid, i) => [pid, i]));
  const lastRestock = new Map<number, number>(); // product -> movement index

  for (const step of steps) {
    if (step.kind === "restock") {
      // Perishables are topped up every morning; other items on Mondays or when below reorder level.
      const p = CATALOGUE[step.product];
      const due = p.restock === "daily" || istParts(step.at).weekday === 1 || stock[step.product] < p.reorderLevel;
      const delta = p.par - stock[step.product];
      if (due && delta > 0) {
        lastRestock.set(step.product, movements.length);
        movements.push({ product_id: productIds[step.product], delta, reason: "restock", bill_id: null, created_at: step.at });
        stock[step.product] += delta;
      }
      continue;
    }
    const bill = bills[step.bill];
    for (const it of itemsByBill.get(bill.id)!) {
      const i = indexById.get(it.product_id)!;
      if (stock[i] < it.qty) {
        const delta = Math.max(CATALOGUE[i].par, it.qty) - stock[i];
        lastRestock.set(i, movements.length);
        movements.push({ product_id: it.product_id, delta, reason: "restock", bill_id: null, created_at: new Date(bill.created_at.getTime() - 1000) });
        stock[i] += delta;
      }
      stock[i] -= it.qty;
      movements.push({ product_id: it.product_id, delta: -it.qty, reason: "sale", bill_id: bill.id, created_at: bill.created_at });
    }
  }

  // ---- 4. Pin staged stock levels (e.g. milk = 8 for the golden path) ----
  CATALOGUE.forEach((p, i) => {
    if (p.targetStock === undefined || stock[i] === p.targetStock) return;
    const diff = p.targetStock - stock[i];
    const ri = lastRestock.get(i);
    if (ri !== undefined && movements[ri].delta + diff > 0) {
      // Smaller/larger morning restock; check the shelf never goes negative afterwards.
      let running = 0;
      let ok = true;
      movements.forEach((m, mi) => {
        if (m.product_id !== productIds[i]) return;
        running += m.delta + (mi === ri ? diff : 0);
        if (running < 0) ok = false;
      });
      if (ok) {
        movements[ri] = { ...movements[ri], delta: movements[ri].delta + diff };
        stock[i] += diff;
        return;
      }
    }
    movements.push({ product_id: productIds[i], delta: diff, reason: "adjustment", bill_id: null, created_at: new Date(cutoff) });
    stock[i] += diff;
  });

  const products: ProductRow[] = CATALOGUE.map((p, i) => ({
    id: productIds[i], merchant_id: merchant.id, sku: p.sku, name: p.name, category: p.category, unit: p.unit,
    aliases: p.aliases, price_paise: p.priceRupees * 100, stock: stock[i], reorder_level: p.reorderLevel,
    barcode: demoBarcode(i), active: true,
  }));

  const events: EventRow[] = [{
    merchant_id: merchant.id, type: "demo.reset",
    summary: `Demo data loaded: ${products.length} products, ${bills.length} past bills, ${customers.length} Khata customers`,
    data: { seed, anchor: anchor.toISOString(), synthetic: true }, verified: false, created_at: anchor,
  }];

  return { anchor, merchant, products, customers, bills, billItems, stockMovements: movements, khataEntries, events };
}

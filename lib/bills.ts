/**
 * Counter bills (Section 4): draft → lines → merchant review → CONFIRMED.
 * Prices always come from the catalogue on the server. Confirming a bill never
 * touches stock or Khata; that happens only on a verified payment or udhaar (Section 5).
 */
import type { Sql, Tx } from "@/lib/db/client";
import { DEMO_MERCHANT_SLUG } from "@/lib/demo/generate";
import { matchProduct, parseItemList } from "@/lib/matcher";
import { formatMoney } from "@/lib/format-money";

export class DomainError extends Error {
  constructor(public code: "NOT_FOUND" | "INVALID" | "CONFLICT", message: string) { super(message); }
}

export type LineSource = "manual" | "scan" | "parchi" | "voice" | "photo" | "storefront";

export interface CatalogueProduct {
  id: string; sku: string; name: string; category: string; unit: string;
  aliases: string[]; pricePaise: number; stock: number; reorderLevel: number; barcode: string | null;
}
export interface BillLineView {
  id: string; productId: string; name: string; unit: string; qty: number;
  unitPricePaise: number; lineTotalPaise: number; source: LineSource;
  confidence: number | null; rawText: string | null; needsReview: boolean;
  candidates: Array<{ id: string; name: string; pricePaise: number }>;
}
export interface BillView {
  id: string; number: number; status: "DRAFT" | "CONFIRMED" | "PAID" | "ON_CREDIT" | "CANCELLED";
  channel: "counter" | "online"; totalPaise: number; itemCount: number; needsReviewCount: number;
  createdAt: string; confirmedAt: string | null; lines: BillLineView[];
}

export async function getMerchantId(sql: Tx): Promise<string> {
  const slug = process.env.DEMO_MERCHANT_SLUG || DEMO_MERCHANT_SLUG;
  const [m] = await sql<{ id: string }[]>`select id from merchants where slug = ${slug}`;
  if (!m) throw new DomainError("NOT_FOUND", "Demo store not loaded. Run npm run db:reset.");
  return m.id;
}

export async function listCatalogue(sql: Tx, merchantId: string): Promise<CatalogueProduct[]> {
  return sql<CatalogueProduct[]>`
    select id, sku, name, category, unit, aliases, price_paise as "pricePaise", stock,
           reorder_level as "reorderLevel", barcode
    from products where merchant_id = ${merchantId} and active order by category, name`;
}

export async function getBill(sql: Tx, billId: string): Promise<BillView> {
  const [b] = await sql`
    select id, number, status, channel, total_paise, created_at, confirmed_at
    from bills where id = ${billId}`;
  if (!b) throw new DomainError("NOT_FOUND", "Bill not found.");
  const rows = await sql`
    select i.id, i.product_id, p.name, p.unit, i.qty, i.unit_price_paise, i.line_total_paise,
           i.source, i.confidence, i.raw_text, i.needs_review, i.candidate_ids
    from bill_items i join products p on p.id = i.product_id
    where i.bill_id = ${billId} order by i.needs_review desc, i.id`;
  const candidateIds = [...new Set(rows.flatMap((r) => r.candidate_ids as string[]))];
  const candidates = candidateIds.length
    ? await sql<{ id: string; name: string; price_paise: number }[]>`select id, name, price_paise from products where id = any(${candidateIds}::uuid[])`
    : [];
  const byId = new Map(candidates.map((c) => [c.id, { id: c.id, name: c.name, pricePaise: c.price_paise }]));
  const lines: BillLineView[] = rows.map((r) => ({
    id: r.id, productId: r.product_id, name: r.name, unit: r.unit, qty: r.qty,
    unitPricePaise: r.unit_price_paise, lineTotalPaise: r.line_total_paise, source: r.source,
    confidence: r.confidence === null ? null : Number(r.confidence), rawText: r.raw_text,
    needsReview: r.needs_review, candidates: (r.candidate_ids as string[]).map((id) => byId.get(id)!).filter(Boolean),
  }));
  return {
    id: b.id, number: b.number, status: b.status, channel: b.channel,
    totalPaise: lines.reduce((s, l) => s + l.lineTotalPaise, 0),
    itemCount: lines.reduce((s, l) => s + l.qty, 0),
    needsReviewCount: lines.filter((l) => l.needsReview).length,
    createdAt: b.created_at.toISOString(), confirmedAt: b.confirmed_at?.toISOString() ?? null, lines,
  };
}

/** Lock a bill for change and make sure it is still a draft. */
async function lockDraft(tx: Tx, billId: string): Promise<{ merchant_id: string }> {
  const [b] = await tx<{ merchant_id: string; status: string }[]>`select merchant_id, status from bills where id = ${billId} for update`;
  if (!b) throw new DomainError("NOT_FOUND", "Bill not found.");
  if (b.status !== "DRAFT") throw new DomainError("CONFLICT", "This bill is already confirmed and can't be edited.");
  return b;
}

async function syncTotal(tx: Tx, billId: string) {
  await tx`update bills set total_paise = coalesce((select sum(line_total_paise) from bill_items where bill_id = ${billId}), 0) where id = ${billId}`;
}

export async function createDraftBill(sql: Sql, merchantId: string): Promise<BillView> {
  const id = await sql.begin(async (tx) => {
    await tx`select id from merchants where id = ${merchantId} for update`; // serialise bill numbers
    const [b] = await tx<{ id: string }[]>`
      insert into bills (merchant_id, number, channel, status)
      values (${merchantId}, (select coalesce(max(number), 1000) + 1 from bills where merchant_id = ${merchantId}), 'counter', 'DRAFT')
      returning id`;
    return b.id;
  });
  return getBill(sql, id);
}

export interface NewLine {
  productId: string; qty: number; source: LineSource;
  confidence?: number | null; rawText?: string | null; needsReview?: boolean; candidateIds?: string[];
}

export async function addLines(sql: Sql, billId: string, lines: NewLine[]): Promise<BillView> {
  await sql.begin(async (tx) => {
    const bill = await lockDraft(tx, billId);
    for (const l of lines) {
      if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > 99) throw new DomainError("INVALID", "Quantity must be 1 to 99.");
      const [p] = await tx<{ price_paise: number }[]>`select price_paise from products where id = ${l.productId} and merchant_id = ${bill.merchant_id} and active`;
      if (!p) throw new DomainError("INVALID", "Product not in this store's catalogue.");
      const review = l.needsReview ?? false;
      if (!review) {
        // Same confirmed product already on the bill: add to its quantity.
        const [existing] = await tx<{ id: string; qty: number }[]>`
          select id, qty from bill_items where bill_id = ${billId} and product_id = ${l.productId} and not needs_review limit 1`;
        if (existing) {
          await tx`update bill_items set qty = ${Math.min(existing.qty + l.qty, 99)} where id = ${existing.id}`;
          continue;
        }
      }
      await tx`
        insert into bill_items (bill_id, product_id, qty, unit_price_paise, source, confidence, raw_text, needs_review, candidate_ids)
        values (${billId}, ${l.productId}, ${l.qty}, ${p.price_paise}, ${l.source}, ${l.confidence ?? null}, ${l.rawText ?? null},
                ${review}, ${l.candidateIds ?? []}::uuid[])`;
    }
    await syncTotal(tx, billId);
  });
  return getBill(sql, billId);
}

/** Items read by AI (parchi/voice) or parsed from typed text → matched catalogue lines. */
export async function addExtracted(
  sql: Sql, billId: string, items: Array<{ raw: string; name: string; qty: number; legible?: boolean }>, source: LineSource,
): Promise<{ bill: BillView; unmatched: string[] }> {
  const [b] = await sql<{ merchant_id: string }[]>`select merchant_id from bills where id = ${billId}`;
  if (!b) throw new DomainError("NOT_FOUND", "Bill not found.");
  const catalogue = await listCatalogue(sql, b.merchant_id);
  const lines: NewLine[] = [];
  const unmatched: string[] = [];
  for (const item of items) {
    const m = matchProduct(item.name, catalogue);
    if (!m.product) { unmatched.push(item.raw || item.name); continue; }
    // An unclear handwriting/voice read always needs the shopkeeper, even if the word matched.
    const review = m.needsReview || item.legible === false;
    const candidates = m.candidates.length ? m.candidates : [m.product];
    lines.push({
      productId: m.product.id, qty: Math.min(Math.max(item.qty, 1), 99), source, confidence: m.confidence,
      rawText: item.raw || item.name, needsReview: review, candidateIds: review ? candidates.map((c) => c.id) : [],
    });
  }
  const bill = lines.length ? await addLines(sql, billId, lines) : await getBill(sql, billId);
  return { bill, unmatched };
}

/** Typed text ("2 doodh, 3 biskut") → deterministic parse → matched lines. Unmatched text is returned, not guessed. */
export async function addFromText(sql: Sql, billId: string, text: string, source: LineSource): Promise<{ bill: BillView; unmatched: string[] }> {
  const parsed = parseItemList(text);
  if (!parsed.length) throw new DomainError("INVALID", "No items found in the text.");
  return addExtracted(sql, billId, parsed.map((p) => ({ raw: p.text, name: p.text, qty: p.qty })), source);
}

export async function updateLine(sql: Sql, billId: string, lineId: string, change: { qty?: number; productId?: string }): Promise<BillView> {
  await sql.begin(async (tx) => {
    const bill = await lockDraft(tx, billId);
    const [line] = await tx`select id from bill_items where id = ${lineId} and bill_id = ${billId}`;
    if (!line) throw new DomainError("NOT_FOUND", "Line not found.");
    if (change.qty !== undefined) {
      if (!Number.isInteger(change.qty) || change.qty < 1 || change.qty > 99) throw new DomainError("INVALID", "Quantity must be 1 to 99.");
      await tx`update bill_items set qty = ${change.qty} where id = ${lineId}`;
    }
    if (change.productId !== undefined) {
      const [p] = await tx<{ price_paise: number }[]>`select price_paise from products where id = ${change.productId} and merchant_id = ${bill.merchant_id} and active`;
      if (!p) throw new DomainError("INVALID", "Product not in this store's catalogue.");
      // The merchant picked the product: the line is now confirmed by a person.
      await tx`update bill_items set product_id = ${change.productId}, unit_price_paise = ${p.price_paise},
               needs_review = false, candidate_ids = '{}' where id = ${lineId}`;
    }
    await syncTotal(tx, billId);
  });
  return getBill(sql, billId);
}

export async function removeLine(sql: Sql, billId: string, lineId: string): Promise<BillView> {
  await sql.begin(async (tx) => {
    await lockDraft(tx, billId);
    await tx`delete from bill_items where id = ${lineId} and bill_id = ${billId}`;
    await syncTotal(tx, billId);
  });
  return getBill(sql, billId);
}

export async function confirmBill(sql: Sql, billId: string): Promise<BillView> {
  await sql.begin(async (tx) => {
    const bill = await lockDraft(tx, billId);
    const [s] = await tx<{ lines: number; review: number; total: number; qty: number; number: number }[]>`
      select count(*)::int lines, count(*) filter (where needs_review)::int review,
             coalesce(sum(line_total_paise), 0)::int total, coalesce(sum(qty), 0)::int qty,
             (select number from bills where id = ${billId}) number
      from bill_items where bill_id = ${billId}`;
    if (s.lines === 0) throw new DomainError("INVALID", "Add at least one item.");
    if (s.review > 0) throw new DomainError("INVALID", `${s.review} item${s.review > 1 ? "s" : ""} need your check before confirming.`);
    await tx`update bills set status = 'CONFIRMED', total_paise = ${s.total}, confirmed_at = now() where id = ${billId}`;
    await tx`insert into events (merchant_id, type, summary, data)
             values (${bill.merchant_id}, 'bill.confirmed', ${`Bill #${s.number} confirmed · ${s.qty} items · ${formatMoney(s.total)}`},
                     ${tx.json({ billId, totalPaise: s.total })})`;
  });
  return getBill(sql, billId);
}

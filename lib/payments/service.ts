/**
 * Payments and the central `bill.paid` event (Section 5).
 *
 * Rules (AGENTS.md):
 * - A bill becomes PAID only after (a) the gateway's server-side status check says
 *   SUCCESS for this exact order and amount, or (b) the merchant records cash.
 * - Downstream effects (stock, events) happen once, inside one transaction, guarded by
 *   row locks + the payment status, so duplicate callbacks/webhooks/polls are no-ops.
 * - Udhaar (ON_CREDIT) decrements stock and adds a Khata debit, but is not "paid".
 */
import { randomBytes } from "node:crypto";
import type { Sql, Tx } from "@/lib/db/client";
import { DomainError, getBill, type BillView } from "@/lib/bills";
import { formatMoney } from "@/lib/format-money";
import { MockProvider } from "./mock";
import { PaytmProvider, paytmConfigFromEnv } from "./paytm";
import type { CheckoutInfo, PaymentProvider } from "./types";

export type PaymentMode = "mock" | "staging" | "misconfigured";

/** Which online payment the app offers. Never falls back to mock silently. */
export function getPaymentMode(env: Record<string, string | undefined> = process.env): PaymentMode {
  if ((env.PAYMENT_PROVIDER ?? "mock") === "paytm") return paytmConfigFromEnv(env) ? "staging" : "misconfigured";
  return "mock";
}

export function getProvider(sql: Tx, env: Record<string, string | undefined> = process.env): PaymentProvider {
  const mode = getPaymentMode(env);
  if (mode === "staging") return new PaytmProvider(paytmConfigFromEnv(env)!);
  if (mode === "mock") return new MockProvider(sql);
  throw new DomainError("CONFLICT", "Paytm is selected but PAYTM_MID / PAYTM_MERCHANT_KEY are missing.");
}

export interface StockDelta { productId: string; name: string; before: number; after: number; reorderLevel: number }
export interface SettleResult { bill: BillView; stock: StockDelta[] }

const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** e.g. KSA-3776-7QK2M9XD: unguessable (40 random bits) because it also opens the customer pay page. */
const orderIdFor = (billNumber: number) =>
  `KSA-${billNumber}-${Array.from(randomBytes(8), (b) => B32[b % 32]).join("")}`;

async function lockBill(tx: Tx, billId: string) {
  const [b] = await tx<{ id: string; merchant_id: string; number: number; status: string; total_paise: number }[]>`
    select id, merchant_id, number, status, total_paise from bills where id = ${billId} for update`;
  if (!b) throw new DomainError("NOT_FOUND", "Bill not found.");
  return b;
}

/** Take the bill's items off the shelf. Corrects (and logs) stock that was already short. */
async function takeStock(tx: Tx, bill: { id: string; merchant_id: string; number: number }): Promise<StockDelta[]> {
  const items = await tx<{ product_id: string; qty: number }[]>`select product_id, qty from bill_items where bill_id = ${bill.id} order by product_id`;
  const deltas: StockDelta[] = [];
  for (const it of items) {
    const [p] = await tx<{ name: string; stock: number; reorder_level: number }[]>`
      select name, stock, reorder_level from products where id = ${it.product_id} for update`;
    let before = p.stock;
    if (before < it.qty) {
      const fix = it.qty - before;
      await tx`insert into stock_movements (product_id, delta, reason, bill_id) values (${it.product_id}, ${fix}, 'adjustment', ${bill.id})`;
      await tx`insert into events (merchant_id, type, summary, data) values (${bill.merchant_id}, 'stock.corrected',
        ${`${p.name}: sold ${it.qty} but shelf count was ${before}. Stock corrected.`}, ${tx.json({ productId: it.product_id, fix })})`;
      before += fix;
    }
    const after = before - it.qty;
    await tx`update products set stock = ${after} where id = ${it.product_id}`;
    await tx`insert into stock_movements (product_id, delta, reason, bill_id) values (${it.product_id}, ${-it.qty}, 'sale', ${bill.id})`;
    deltas.push({ productId: it.product_id, name: p.name, before: p.stock, after, reorderLevel: p.reorder_level });
  }
  for (const d of deltas.filter((d) => d.after < d.reorderLevel)) {
    await tx`insert into events (merchant_id, type, summary, data) values (${bill.merchant_id}, 'stock.low',
      ${`${d.name} low: ${d.after} left (reorder at ${d.reorderLevel})`}, ${tx.json({ productId: d.productId, stock: d.after })})`;
  }
  return deltas;
}

/** The one place a bill becomes PAID. Caller must hold the bill lock inside `tx`. */
async function markPaid(tx: Tx, bill: { id: string; merchant_id: string; number: number; total_paise: number }, method: "paytm" | "mock" | "cash", detail: string, verified: boolean, orderId: string) {
  const stock = await takeStock(tx, bill);
  // Online orders enter the merchant's queue only once paid.
  await tx`update bills set status = 'PAID', payment_method = ${method}, settled_at = now(),
           fulfilment = case when channel = 'online' then 'RECEIVED'::fulfilment else fulfilment end where id = ${bill.id}`;
  await tx`insert into events (merchant_id, type, summary, data, verified) values (${bill.merchant_id}, 'bill.paid',
    ${`Bill #${bill.number} paid · ${formatMoney(bill.total_paise)} · ${detail}`},
    ${tx.json({ billId: bill.id, orderId, method, amountPaise: bill.total_paise, stock: stock as never })}, ${verified})`;
  return stock;
}

// ---------------------------------------------------------------- online

export interface StartedPayment extends CheckoutInfo { label: string; payPath: string }

export async function startOnlinePayment(sql: Sql, billId: string, appUrl: string): Promise<StartedPayment> {
  const provider = getProvider(sql);
  const { bill, payment } = await sql.begin(async (tx) => {
    const bill = await lockBill(tx, billId);
    if (bill.status !== "CONFIRMED") throw new DomainError("CONFLICT", bill.status === "PAID" ? "This bill is already paid." : "Confirm the bill before taking payment.");
    // Reuse a recent open order so a customer can't be charged twice for one bill.
    const [open] = await tx<{ provider_order_id: string; amount_paise: number }[]>`
      select provider_order_id, amount_paise from payments
      where bill_id = ${billId} and provider = ${provider.name} and status in ('CREATED', 'PENDING')
        and amount_paise = ${bill.total_paise} and created_at > now() - interval '14 minutes'
      order by created_at desc limit 1`;
    if (open) return { bill, payment: { orderId: open.provider_order_id, reused: true } };
    const orderId = orderIdFor(bill.number);
    await tx`insert into payments (bill_id, provider, provider_order_id, amount_paise, status)
             values (${billId}, ${provider.name}, ${orderId}, ${bill.total_paise}, 'CREATED')`;
    await tx`insert into events (merchant_id, type, summary, data) values (${bill.merchant_id}, 'payment.created',
      ${`${provider.label} order ${orderId} for ${formatMoney(bill.total_paise)} (bill #${bill.number})`}, ${tx.json({ billId, orderId })})`;
    return { bill, payment: { orderId, reused: false } };
  });

  try {
    // Paytm txn tokens live 15 minutes; reuse the stored one instead of re-initiating the same order.
    if (payment.reused) {
      const [row] = await sql<{ raw: { checkout?: CheckoutInfo } | null }[]>`select raw from payments where provider_order_id = ${payment.orderId}`;
      if (row?.raw?.checkout) return { ...row.raw.checkout, label: provider.label, payPath: `/pay/${payment.orderId}` };
    }
    const checkout = await provider.createOrder({
      orderId: payment.orderId, amountPaise: bill.total_paise, customerRef: `BILL${bill.number}`,
      callbackUrl: `${appUrl.replace(/\/$/, "")}/api/payments/paytm/callback`,
    });
    await sql`update payments set raw = ${sql.json({ checkout: checkout as never })} where provider_order_id = ${payment.orderId} and status = 'CREATED'`;
    return { ...checkout, label: provider.label, payPath: `/pay/${payment.orderId}` };
  } catch (error) {
    await sql`update payments set status = 'FAILED', raw = ${sql.json({ reason: "create_failed", message: String(error) })}
              where provider_order_id = ${payment.orderId} and status = 'CREATED'`;
    throw new DomainError("CONFLICT", error instanceof Error ? error.message : "Could not start the payment.");
  }
}

/** What the customer's phone needs to pay an order (no secrets: the txn token is single-use and short-lived). */
export async function getCustomerCheckout(sql: Tx, orderId: string) {
  const [r] = await sql`
    select p.provider, p.status, p.amount_paise, p.raw, b.number, b.id bill_id, b.channel, m.name shop, m.slug
    from payments p join bills b on b.id = p.bill_id join merchants m on m.id = b.merchant_id
    where p.provider_order_id = ${orderId} and p.provider in ('paytm', 'mock')`;
  if (!r) return null;
  const items = await sql<{ name: string; qty: number; line_total_paise: number }[]>`
    select pr.name, i.qty, i.line_total_paise from bill_items i join products pr on pr.id = i.product_id where i.bill_id = ${r.bill_id} order by pr.name`;
  return {
    orderId, provider: r.provider as "paytm" | "mock", status: r.status as string, amountPaise: r.amount_paise as number,
    billNumber: r.number as number, shop: r.shop as string,
    trackPath: r.channel === "online" ? `/s/${r.slug}/order/${r.bill_id}` : null,
    items: items.map((i) => ({ name: i.name, qty: i.qty, totalPaise: i.line_total_paise })),
    paytm: (r.raw as { checkout?: CheckoutInfo } | null)?.checkout?.paytm ?? null,
  };
}

export type ConfirmOutcome = "PAID" | "ALREADY_PAID" | "PENDING" | "FAILED" | "REJECTED";

/**
 * Verify an online payment with the gateway and, if valid, mark the bill paid.
 * Safe to call any number of times, from callback, webhook or polling, concurrently.
 */
export async function confirmPayment(sql: Sql, orderId: string, source: string, provider = getProvider(sql)): Promise<{ outcome: ConfirmOutcome; billId: string }> {
  const [p] = await sql<{ id: string; bill_id: string; provider: string; status: string }[]>`
    select id, bill_id, provider, status from payments where provider_order_id = ${orderId}`;
  if (!p) throw new DomainError("NOT_FOUND", "Payment not found.");
  if (p.status === "SUCCESS") return { outcome: "ALREADY_PAID", billId: p.bill_id };
  if (p.provider !== provider.name) throw new DomainError("CONFLICT", `This order belongs to ${p.provider}, not ${provider.name}.`);

  const v = await provider.verify(orderId); // network call outside the transaction

  return sql.begin(async (tx) => {
    const [pay] = await tx<{ id: string; status: string; amount_paise: number }[]>`
      select id, status, amount_paise from payments where id = ${p.id} for update`;
    if (pay.status === "SUCCESS") return { outcome: "ALREADY_PAID" as const, billId: p.bill_id };
    const bill = await lockBill(tx, p.bill_id);
    const raw = tx.json({ source, gateway: v.raw as never });

    if (v.status === "PENDING" || v.status === "NOT_FOUND") {
      if (v.status === "PENDING") await tx`update payments set status = 'PENDING', raw = ${raw} where id = ${pay.id}`;
      return { outcome: "PENDING" as const, billId: bill.id };
    }
    if (v.status === "FAILED") {
      await tx`update payments set status = 'FAILED', raw = ${raw} where id = ${pay.id}`;
      await tx`insert into events (merchant_id, type, summary, data) values (${bill.merchant_id}, 'payment.failed',
        ${`${provider.label} payment failed for bill #${bill.number}. Bill is still unpaid.`}, ${tx.json({ orderId, source })})`;
      return { outcome: "FAILED" as const, billId: bill.id };
    }

    // SUCCESS from the gateway: check it is for this order, this amount and a payable bill.
    const problem =
      v.orderId !== orderId ? "order ID does not match" :
      v.amountPaise !== pay.amount_paise || pay.amount_paise !== bill.total_paise
        ? `amount mismatch (bill ${formatMoney(bill.total_paise)}, gateway ${v.amountPaise === null ? "unknown" : formatMoney(v.amountPaise)})` :
      bill.status !== "CONFIRMED" ? `bill is ${bill.status}` : null;
    if (problem) {
      await tx`update payments set status = 'FAILED', raw = ${tx.json({ source, rejected: problem, gateway: v.raw as never })} where id = ${pay.id}`;
      await tx`insert into events (merchant_id, type, summary, data) values (${bill.merchant_id}, 'payment.rejected',
        ${`Payment for bill #${bill.number} rejected: ${problem}. Nothing was marked paid.`}, ${tx.json({ orderId, source })})`;
      return { outcome: "REJECTED" as const, billId: bill.id };
    }

    await tx`update payments set status = 'SUCCESS', txn_id = ${v.txnId}, verified_at = now(), raw = ${raw} where id = ${pay.id}`;
    await markPaid(tx, bill, provider.name, `${provider.label} · verified by server (${source})`, provider.name === "paytm", orderId);
    return { outcome: "PAID" as const, billId: bill.id };
  });
}

export interface PaymentStatusView {
  orderId: string; provider: "paytm" | "mock" | "cash"; label: string;
  status: "CREATED" | "PENDING" | "SUCCESS" | "FAILED"; amountPaise: number;
  billId: string; billNumber: number; billStatus: string; stock: StockDelta[]; rejectedReason: string | null;
}

export async function getPaymentStatus(sql: Tx, orderId: string): Promise<PaymentStatusView> {
  const [r] = await sql`
    select p.provider_order_id, p.provider, p.status, p.amount_paise, p.raw, b.id bill_id, b.number, b.status bill_status
    from payments p join bills b on b.id = p.bill_id where p.provider_order_id = ${orderId}`;
  if (!r) throw new DomainError("NOT_FOUND", "Payment not found.");
  const [paid] = await sql<{ data: { stock?: StockDelta[]; orderId?: string } }[]>`
    select data from events where type = 'bill.paid' and data->>'orderId' = ${orderId} order by id desc limit 1`;
  return {
    orderId, provider: r.provider, label: r.provider === "paytm" ? "Paytm staging" : r.provider === "mock" ? "Mock payment" : "Cash",
    status: r.status, amountPaise: r.amount_paise, billId: r.bill_id, billNumber: r.number, billStatus: r.bill_status,
    stock: paid?.data.stock ?? [], rejectedReason: (r.raw as { rejected?: string } | null)?.rejected ?? null,
  };
}

// ---------------------------------------------------------------- cash & udhaar

export async function recordCash(sql: Sql, billId: string): Promise<SettleResult> {
  const stock = await sql.begin(async (tx) => {
    const bill = await lockBill(tx, billId);
    if (bill.status !== "CONFIRMED") throw new DomainError("CONFLICT", bill.status === "PAID" ? "This bill is already paid." : "Confirm the bill first.");
    const orderId = `CASH-${bill.number}`;
    await tx`insert into payments (bill_id, provider, provider_order_id, amount_paise, status, verified_at, raw)
             values (${billId}, 'cash', ${orderId}, ${bill.total_paise}, 'SUCCESS', now(), ${tx.json({ recordedBy: "merchant" })})`;
    // Cash is recorded by the merchant, not verified by a gateway, so the event is not "verified".
    return markPaid(tx, bill, "cash", "cash received (recorded by merchant)", false, orderId);
  });
  return { bill: await getBill(sql, billId), stock };
}

export async function putOnCredit(sql: Sql, billId: string, customerId: string): Promise<SettleResult & { balancePaise: number }> {
  const result = await sql.begin(async (tx) => {
    const bill = await lockBill(tx, billId);
    if (bill.status !== "CONFIRMED") throw new DomainError("CONFLICT", bill.status === "PAID" ? "This bill is already paid." : "Confirm the bill first.");
    const [c] = await tx<{ name: string }[]>`select name from customers where id = ${customerId} and merchant_id = ${bill.merchant_id}`;
    if (!c) throw new DomainError("INVALID", "Customer not found in this store's Khata.");
    const stock = await takeStock(tx, bill);
    await tx`update bills set status = 'ON_CREDIT', payment_method = 'udhaar', customer_id = ${customerId}, settled_at = now() where id = ${billId}`;
    await tx`insert into khata_entries (customer_id, type, amount_paise, bill_id, note) values (${customerId}, 'debit', ${bill.total_paise}, ${billId}, 'Udhaar bill')`;
    const [{ balance }] = await tx<{ balance: number }[]>`select balance_paise as balance from customer_balances where customer_id = ${customerId}`;
    await tx`insert into events (merchant_id, type, summary, data) values (${bill.merchant_id}, 'bill.on_credit',
      ${`Bill #${bill.number} on udhaar · ${formatMoney(bill.total_paise)} · ${c.name} now owes ${formatMoney(balance)}`},
      ${tx.json({ billId, customerId, amountPaise: bill.total_paise, stock: stock as never })})`;
    return { stock, balancePaise: balance };
  });
  return { bill: await getBill(sql, billId), ...result };
}

export async function listKhataCustomers(sql: Tx, merchantId: string) {
  return sql<{ id: string; name: string; balancePaise: number }[]>`
    select customer_id as id, name, balance_paise as "balancePaise" from customer_balances
    where merchant_id = ${merchantId} order by name`;
}

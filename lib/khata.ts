/** Khata screen data and udhaar settlement (Section 10). Ageing comes from the insight engine (FIFO). */
import type { Sql, Tx } from "@/lib/db/client";
import { DomainError } from "@/lib/bills";
import { formatMoney } from "@/lib/format-money";
import { khataDues, type CustomerDues } from "@/lib/insights";

export interface KhataOverview {
  totalPaise: number;
  buckets: Record<"0–15" | "16–30" | "30+", number>;
  customers: CustomerDues[];
  source: string;
}

export async function khataOverview(sql: Tx, merchantId: string, now = new Date()): Promise<KhataOverview> {
  const customers = await khataDues(sql, merchantId, now);
  const buckets = { "0–15": 0, "16–30": 0, "30+": 0 };
  for (const c of customers) buckets[c.bucket] += c.balancePaise;
  return {
    totalPaise: customers.reduce((s, c) => s + c.balancePaise, 0), buckets, customers,
    source: "Khata ledger · purana udhaar pehle chukta maana gaya",
  };
}

export interface LedgerEntry { id: number; type: "debit" | "credit"; amountPaise: number; note: string | null; billNumber: number | null; createdAt: string }

export async function customerLedger(sql: Tx, merchantId: string, customerId: string, now = new Date()) {
  const [c] = await sql<{ id: string; name: string }[]>`select id, name from customers where id = ${customerId} and merchant_id = ${merchantId}`;
  if (!c) throw new DomainError("NOT_FOUND", "Customer not found.");
  const entries = await sql<LedgerEntry[]>`
    select k.id::int, k.type, k.amount_paise "amountPaise", k.note, b.number "billNumber", k.created_at "createdAt"
    from khata_entries k left join bills b on b.id = k.bill_id where k.customer_id = ${customerId} order by k.created_at desc, k.id desc limit 100`;
  const dues = (await khataDues(sql, merchantId, now)).find((d) => d.customerId === customerId);
  return { customer: { id: c.id, name: c.name }, balancePaise: dues?.balancePaise ?? 0, daysOverdue: dues?.daysOverdue ?? 0, entries };
}

/** Record money received against udhaar (cash or UPI collected outside the app). */
export async function settleKhata(sql: Sql, merchantId: string, customerId: string, amountPaise: number, method: "cash" | "upi") {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new DomainError("INVALID", "Amount must be more than zero.");
  await sql.begin(async (tx) => {
    const [c] = await tx<{ name: string }[]>`select name from customers where id = ${customerId} and merchant_id = ${merchantId} for update`;
    if (!c) throw new DomainError("NOT_FOUND", "Customer not found.");
    const [{ balance }] = await tx<{ balance: number }[]>`select balance_paise balance from customer_balances where customer_id = ${customerId}`;
    if (amountPaise > balance) throw new DomainError("INVALID", `Sirf ${formatMoney(balance)} baaki hai.`);
    await tx`insert into khata_entries (customer_id, type, amount_paise, note)
             values (${customerId}, 'credit', ${amountPaise}, ${method === "cash" ? "Cash received (recorded by merchant)" : "UPI received (recorded by merchant)"})`;
    await tx`insert into events (merchant_id, type, summary, data) values (${merchantId}, 'khata.settled',
      ${`${c.name} paid ${formatMoney(amountPaise)} (${method}, recorded by merchant) · ${formatMoney(balance - amountPaise)} still due`},
      ${tx.json({ customerId, amountPaise, method })})`;
  });
  return customerLedger(sql, merchantId, customerId);
}

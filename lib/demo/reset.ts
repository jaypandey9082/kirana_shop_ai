/** Replaces all app data with the deterministic demo dataset, in one transaction. */
import type { Sql, Tx } from "@/lib/db/client";
import { generateDemoData, type DemoDataset } from "./generate";

export interface ResetSummary {
  anchor: string;
  merchantSlug: string;
  products: number;
  customers: number;
  bills: number;
  khataOutstandingPaise: number;
}

const TABLES = "outbox, mock_gateway_orders, events, actions, khata_entries, stock_movements, payments, bill_items, bills, customers, products, merchants";

async function insertChunked<T extends object>(tx: Tx, table: string, rows: T[], size = 1000) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    await tx`insert into ${tx(table)} ${tx(chunk as Record<string, unknown>[])}`;
  }
}

export async function resetDemo(sql: Sql, anchor = new Date()): Promise<ResetSummary> {
  const data: DemoDataset = generateDemoData(anchor);
  await sql.begin(async (tx) => {
    // Serialise concurrent resets; TRUNCATE bypasses the events append-only trigger by design.
    await tx`select pg_advisory_xact_lock(hashtext('kirana-demo-reset'))`;
    await tx.unsafe(`truncate ${TABLES} restart identity cascade`);
    await insertChunked(tx, "merchants", [data.merchant]);
    await insertChunked(tx, "products", data.products);
    await insertChunked(tx, "customers", data.customers);
    await insertChunked(tx, "bills", data.bills);
    await insertChunked(tx, "bill_items", data.billItems);
    await insertChunked(tx, "stock_movements", data.stockMovements);
    await insertChunked(tx, "khata_entries", data.khataEntries);
    await insertChunked(tx, "events", data.events.map((e) => ({ ...e, data: tx.json(e.data as never) })));
  });
  const outstanding = data.khataEntries.reduce((s, k) => s + (k.type === "debit" ? k.amount_paise : -k.amount_paise), 0);
  return {
    anchor: anchor.toISOString(), merchantSlug: data.merchant.slug, products: data.products.length,
    customers: data.customers.length, bills: data.bills.length, khataOutstandingPaise: outstanding,
  };
}

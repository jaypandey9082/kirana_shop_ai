/**
 * Salaahkaar's seven tools. Five read deterministic insights; two create PENDING
 * action drafts. No tool moves money or sends anything: execution needs approval (Section 9).
 * Each tool returns `data` for the model and `cards` the UI renders directly, so the
 * numbers on screen always come from code, never from model text.
 */
import type { Sql } from "@/lib/db/client";
import { formatMoney } from "@/lib/format-money";
import { forecastRunout, khataDues, lowStock, overdueDues, salesSummary, slowMovers, type SalesPeriod } from "@/lib/insights";
import { normalize } from "@/lib/matcher";
import { supplierFor } from "@/lib/demo/suppliers";
import { logEvent } from "@/lib/events";

export interface InsightCardData { kind: "insight"; headline: string; facts: string[]; source: string }
export interface ActionView {
  id: string; type: "reorder" | "reminder"; status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED";
  title: string; draft: string; createdAt: string; decidedAt: string | null; executedAt: string | null;
  /** How it was executed: "n8n" or "built-in outbox"; null until executed. */
  deliveredVia: string | null; error: string | null;
}
export interface ToolResult { data: unknown; cards: InsightCardData[]; action?: ActionView }
export interface ToolContext { sql: Sql; merchantId: string; now: Date; shopName: string }

const time = (iso: string) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const pct = (n: number | null) => (n === null ? "pichhle hafte ka data nahi" : n === 0 ? "pichhle hafte jitna" : `pichhle hafte se ${Math.abs(n)}% ${n > 0 ? "zyada" : "kam"}`);

export async function actionView(sql: Sql, id: string): Promise<ActionView> {
  const [a] = await sql`select a.id, a.type, a.status, a.payload, a.draft_text, a.created_at, a.decided_at, a.executed_at, a.error, o.delivered_via
                         from actions a left join outbox o on o.action_id = a.id where a.id = ${id}`;
  return {
    id: a.id, type: a.type, status: a.status, title: (a.payload as { title: string }).title, draft: a.draft_text,
    createdAt: a.created_at.toISOString(), decidedAt: a.decided_at?.toISOString() ?? null, executedAt: a.executed_at?.toISOString() ?? null,
    deliveredVia: a.delivered_via ?? null, error: a.error ?? null,
  };
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
  run(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult>;
}

export const TOOLS: ToolSpec[] = [
  {
    name: "get_sales_summary",
    description: "Sales total and bill count for today, yesterday or the last 7 days, compared with the same window a week earlier, plus top items.",
    parameters: { type: "object", properties: { period: { type: "string", enum: ["today", "yesterday", "last7"] } }, required: ["period"], additionalProperties: false },
    async run(ctx, args) {
      const period = (["today", "yesterday", "last7"].includes(String(args.period)) ? args.period : "today") as SalesPeriod;
      const s = await salesSummary(ctx.sql, ctx.merchantId, period, ctx.now);
      return {
        data: { ...s, total: formatMoney(s.totalPaise), compareTotal: formatMoney(s.compareTotalPaise) },
        cards: [{
          kind: "insight", headline: `${s.label[0].toUpperCase()}${s.label.slice(1)}: ${formatMoney(s.totalPaise)} · ${s.bills} bills`,
          facts: [
            `${pct(s.changePct)} (${s.compareLabel}: ${formatMoney(s.compareTotalPaise)})`,
            s.creditPaise ? `Isme ${formatMoney(s.creditPaise)} udhaar par` : "Sab paid, koi udhaar nahi",
            s.topItems.length ? `Sabse zyada: ${s.topItems.map((t) => t.name).join(", ")}` : "Abhi koi bikri nahi",
          ],
          source: s.source,
        }],
      };
    },
  },
  {
    name: "get_low_stock",
    description: "Products currently below their reorder level.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async run(ctx) {
      const r = await lowStock(ctx.sql, ctx.merchantId);
      return {
        data: { ...r, count: r.items.length },
        cards: [{ kind: "insight", headline: r.items.length ? `${r.items.length} items reorder level se neeche` : "Sab items reorder level se upar",
          facts: r.items.slice(0, 3).map((i) => `${i.name}: ${i.stock} bache (reorder ${i.reorderLevel})`), source: r.source }],
      };
    },
  },
  {
    name: "forecast_runout",
    description: "Which items will likely run out before the next morning restock, from the last 7 days of hourly sales. Optional sku for one product.",
    parameters: { type: "object", properties: { sku: { type: ["string", "null"], description: "Product SKU, or null for all at-risk items" } }, required: ["sku"], additionalProperties: false },
    async run(ctx, args) {
      const sku = typeof args.sku === "string" && args.sku ? args.sku : undefined;
      const r = await forecastRunout(ctx.sql, ctx.merchantId, ctx.now, sku);
      const top = r.items.filter((i) => i.atRisk);
      return {
        data: { items: r.items.map((i) => ({ ...i, runsOutAtLocal: i.runsOutAt ? time(i.runsOutAt) : null, nextRestockLocal: time(i.nextRestockAt) })), source: r.source },
        cards: top.length ? top.slice(0, 3).map((i) => ({
          kind: "insight" as const,
          headline: `${i.name}: ${i.stock} bache, ${i.runsOutAt ? `lagbhag ${time(i.runsOutAt)} tak khatam` : "kal subah se pehle khatam"}`,
          facts: [`Restock (${time(i.nextRestockAt)}) tak aam taur par ${Math.round(i.expectedUntilRestock)} bikte hain`, `Shaam 5–10 baje roz ~${Math.round(i.typicalEvening)} bikte hain`],
          source: i.source,
        })) : [{ kind: "insight", headline: "Kal subah tak koi item khatam hone ka khatra nahi", facts: [], source: r.source }],
      };
    },
  },
  {
    name: "get_slow_movers",
    description: "Items that are selling slowly compared with the stock held (over 21 days of cover).",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async run(ctx) {
      const r = await slowMovers(ctx.sql, ctx.merchantId, ctx.now);
      return {
        data: { ...r, count: r.items.length },
        cards: [{ kind: "insight", headline: r.items.length ? `${r.items.length} items dheere bik rahe hain` : "Koi item zyada der se pada nahi",
          facts: r.items.slice(0, 3).map((i) => `${i.name}: ${i.stock} stock, 14 din mein ${i.soldInPeriod} bike`), source: r.source }],
      };
    },
  },
  {
    name: "get_overdue_dues",
    description: "Customers whose udhaar is older than min_days, with amounts and age.",
    parameters: { type: "object", properties: { min_days: { type: "integer", description: "Default 30" } }, required: ["min_days"], additionalProperties: false },
    async run(ctx, args) {
      const minDays = Number.isInteger(args.min_days) ? Math.max(0, Number(args.min_days)) : 30;
      const r = await overdueDues(ctx.sql, ctx.merchantId, ctx.now, minDays);
      return {
        data: { ...r, count: r.items.length, items: r.items.map((i) => ({ ...i, balance: formatMoney(i.balancePaise) })), total: formatMoney(r.totalPaise) },
        cards: [{ kind: "insight", headline: r.items.length ? `${formatMoney(r.totalPaise)} udhaar ${minDays}+ din purana` : r.summary,
          facts: r.items.slice(0, 3).map((i) => `${i.name}: ${formatMoney(i.balancePaise)} · ${i.daysOverdue} din`), source: r.source }],
      };
    },
  },
  {
    name: "propose_reorder",
    description: "Draft a reorder message to the supplier for one product. Creates a PENDING action; nothing is sent until the shopkeeper approves.",
    parameters: { type: "object", properties: { sku: { type: "string" }, qty: { type: ["integer", "null"], description: "Units, or null to suggest" } }, required: ["sku", "qty"], additionalProperties: false },
    async run(ctx, args) {
      const [p] = await ctx.sql`select id, sku, name, unit, category, stock, reorder_level from products where merchant_id = ${ctx.merchantId} and sku = ${String(args.sku)}`;
      if (!p) return { data: { error: "Unknown SKU" }, cards: [] };
      const suggested = Math.max(p.reorder_level * 2 - p.stock, 1);
      const qty = Number.isInteger(args.qty) && Number(args.qty) > 0 && Number(args.qty) <= 500 ? Number(args.qty) : suggested;
      const supplier = supplierFor(p.category);
      const existing = await ctx.sql`select id from actions where merchant_id = ${ctx.merchantId} and type = 'reorder' and status = 'PENDING' and payload->>'sku' = ${p.sku} limit 1`;
      let id = existing[0]?.id as string | undefined;
      if (!id) {
        const draft = `Namaste, ${ctx.shopName} ko kal subah se pehle ${p.name} × ${qty} chahiye. Kripya confirm karein. Dhanyavaad.`;
        const [a] = await ctx.sql`insert into actions (merchant_id, type, payload, draft_text) values (${ctx.merchantId}, 'reorder',
          ${ctx.sql.json({ title: `Reorder: ${p.name} × ${qty}`, sku: p.sku, productId: p.id, qty, supplier, to: supplier })}, ${draft}) returning id`;
        id = a.id as string;
        await logEvent(ctx.sql, null, "action.pending", `Reorder drafted: ${p.name} × ${qty} to ${supplier}. Waiting for approval.`, { actionId: id });
      }
      const action = await actionView(ctx.sql, id!);
      return { data: { actionId: id, status: action.status, title: action.title, needsApproval: true }, cards: [], action };
    },
  },
  {
    name: "propose_reminder",
    description: "Draft a polite udhaar reminder for one customer by name. Creates a PENDING action; nothing is sent until the shopkeeper approves.",
    parameters: { type: "object", properties: { customer_name: { type: "string" } }, required: ["customer_name"], additionalProperties: false },
    async run(ctx, args) {
      const dues = await khataDues(ctx.sql, ctx.merchantId, ctx.now);
      const want = normalize(String(args.customer_name ?? ""));
      const c = dues.find((d) => normalize(d.name) === want) ?? dues.find((d) => want && normalize(d.name).startsWith(want.split(" ")[0]));
      if (!c) return { data: { error: "No customer with dues by that name" }, cards: [] };
      const existing = await ctx.sql`select id from actions where merchant_id = ${ctx.merchantId} and type = 'reminder' and status = 'PENDING' and payload->>'customerId' = ${c.customerId} limit 1`;
      let id = existing[0]?.id as string | undefined;
      if (!id) {
        const first = c.name.split(" ")[0];
        const draft = `Namaste ${first} ji, ${ctx.shopName} mein ${formatMoney(c.balancePaise)} ka udhaar baaki hai. Suvidha ho to chuka dijiye. Dhanyavaad!`;
        const [a] = await ctx.sql`insert into actions (merchant_id, type, payload, draft_text) values (${ctx.merchantId}, 'reminder',
          ${ctx.sql.json({ title: `Remind ${c.name} · ${formatMoney(c.balancePaise)}`, customerId: c.customerId, customer: c.name, amountPaise: c.balancePaise, to: c.name })}, ${draft}) returning id`;
        id = a.id as string;
        await logEvent(ctx.sql, null, "action.pending", `Reminder drafted for ${c.name} (${formatMoney(c.balancePaise)}). Waiting for approval.`, { actionId: id });
      }
      const action = await actionView(ctx.sql, id!);
      return { data: { actionId: id, status: action.status, title: action.title, needsApproval: true }, cards: [], action };
    },
  },
];

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);

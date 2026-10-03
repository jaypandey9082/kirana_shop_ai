/**
 * Golden-path rehearsal against a running app (local or deployed):
 *   reset → parchi → fix flagged line → confirm → online pay → verified → stock/log →
 *   Salaahkaar → approve by voice → executed + outbox → distributor accepts → maal aa gaya.
 *
 * Usage:  npm run smoke                      (http://localhost:3000)
 *         npm run smoke -- https://your-app.vercel.app
 * Needs DEMO_RESET_SECRET (read from .env.local for local runs). With Paytm staging,
 * the payment step waits up to 3 minutes for you to pay on the customer page.
 */
const base = (process.argv[2] ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.DEMO_RESET_SECRET ?? "";
let failures = 0;

async function call<T = Record<string, unknown>>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${(data as { error?: string }).error ?? "error"}`);
  return data as T;
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  const t = Date.now();
  try {
    const r = await fn();
    console.log(`  ✓ ${name} (${Date.now() - t} ms)`);
    return r;
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : e}`);
    return undefined;
  }
}
const assert = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log(`Golden-path smoke test → ${base}\n`);

const ready = await step("readiness", async () => {
  const r = await call<Record<string, { ok: boolean; detail: string }>>("GET", "/api/ready");
  for (const [k, v] of Object.entries(r)) if (v && typeof v === "object") console.log(`      ${v.ok ? "·" : "!"} ${k}: ${v.detail}`);
  assert(r.database.ok, "database not ready");
  return r;
});

await step("reset demo data", async () => {
  assert(secret, "DEMO_RESET_SECRET not set");
  await call("POST", "/api/demo/reset", undefined, { "x-demo-reset-secret": secret });
});

const milkBefore = await step("milk staged at 8", async () => {
  const { products } = await call<{ products: Array<{ sku: string; stock: number }> }>("GET", "/api/catalogue");
  const milk = products.find((p) => p.sku === "DAI-001")!;
  assert(milk.stock === 8, `milk is ${milk.stock}`);
  return milk.stock;
});

type Bill = { id: string; number: number; totalPaise: number; needsReviewCount: number; status: string; lines: Array<{ id: string; needsReview: boolean; candidates: Array<{ id: string; name: string }> }> };
const bill = await step("parchi → bill with one flagged line", async () => {
  const { bill } = await call<{ bill: Bill }>("POST", "/api/bills");
  const r = await call<{ bill: Bill }>("POST", `/api/bills/${bill.id}/parchi`, { demo: true });
  assert(r.bill.lines.length === 4, `${r.bill.lines.length} lines`);
  assert(r.bill.needsReviewCount === 1, `${r.bill.needsReviewCount} flagged`);
  return r.bill;
});

await step("confirm is blocked until the flag is fixed", async () => {
  const res = await fetch(`${base}/api/bills/${bill!.id}/confirm`, { method: "POST" });
  assert(res.status === 422, `expected 422, got ${res.status}`);
});

await step("merchant picks Glucose; bill confirmed at ₹202", async () => {
  const flagged = bill!.lines.find((l) => l.needsReview)!;
  const glucose = flagged.candidates.find((c) => c.name.startsWith("Glucose"))!;
  await call("PATCH", `/api/bills/${bill!.id}/lines/${flagged.id}`, { productId: glucose.id });
  const { bill: b } = await call<{ bill: Bill }>("POST", `/api/bills/${bill!.id}/confirm`);
  assert(b.status === "CONFIRMED" && b.totalPaise === 20_200, `status ${b.status}, total ${b.totalPaise}`);
});

const orderId = await step("start online payment", async () => {
  const { payment } = await call<{ payment: { orderId: string; provider: string; payPath: string } }>("POST", `/api/bills/${bill!.id}/pay`, { method: "online" });
  console.log(`      ${payment.provider} order ${payment.orderId} · customer page ${base}${payment.payPath}`);
  if (payment.provider === "mock") await call("POST", `/api/payments/mock/${payment.orderId}`, { outcome: "success" });
  else console.log("      Pay now on the customer page with the Paytm staging test wallet. Waiting up to 3 min…");
  return payment.orderId;
});

await step("server verifies payment; stock drops once", async () => {
  let status = "";
  for (let i = 0; i < 90 && status !== "SUCCESS"; i++) {
    const { payment } = await call<{ payment: { status: string } }>("GET", `/api/payments/${orderId}`);
    status = payment.status;
    if (status === "FAILED") throw new Error("payment failed");
    if (status !== "SUCCESS") await sleep(2000);
  }
  assert(status === "SUCCESS", `status ${status}`);
  const { products } = await call<{ products: Array<{ sku: string; stock: number }> }>("GET", "/api/catalogue");
  const milk = products.find((p) => p.sku === "DAI-001")!.stock;
  assert(milk === (milkBefore ?? 8) - 2, `milk ${milk}`);
});

const action = await step("Salaahkaar answers from data and drafts a reorder", async () => {
  const { reply } = await call<{ reply: { mode: string; display: string; cards: Array<{ source: string }>; actions: Array<{ id: string; status: string }> } }>(
    "POST", "/api/salaahkaar", { question: "Aaj kitna sale hua, aur kya khatam hone wala hai?" });
  console.log(`      [${reply.mode}] ${reply.display}`);
  assert(reply.cards.length > 0 && reply.cards.every((c) => c.source), "cards without sources");
  assert(reply.mode !== "ai-guarded", "AI answer failed the number guard");
  assert(reply.actions[0]?.status === "PENDING", "no pending reorder draft");
  return reply.actions[0];
});

await step("“Haan, bhej do” → approved → executed once", async () => {
  let { action: a } = await call<{ action: { status: string; deliveredVia: string | null } }>("POST", `/api/actions/${action!.id}/approve`, { via: "voice" });
  for (let i = 0; i < 20 && a.status === "APPROVED"; i++) { await sleep(1500); a = (await call<{ action: typeof a }>("GET", `/api/actions/${action!.id}`)).action; }
  assert(a.status === "EXECUTED", `status ${a.status}`);
  console.log(`      delivered via ${a.deliveredVia}`);
  const { outbox } = await call<{ outbox: unknown[] }>("GET", "/api/outbox");
  assert(outbox.length === 1, `${outbox.length} outbox rows`);
});

await step("distributor accepts; “Maal aa gaya” adds stock once", async () => {
  type Po = { id: string; status: string; supplierSlug: string; items: Array<{ id: string; productId: string; name: string; qtyOrdered: number }> };
  const { orders } = await call<{ orders: Po[] }>("GET", "/api/purchases");
  const po = orders[0];
  assert(po && po.status === "SENT", `purchase order ${po?.status ?? "missing"}`);
  const { orders: seen } = await call<{ orders: Po[] }>("GET", `/api/distributor/${po.supplierSlug}/orders`);
  assert(seen.some((o) => o.id === po.id), "distributor can't see the order");
  await call("POST", `/api/purchases/${po.id}/accept`, { eta: "Kal subah", items: po.items.map((i) => ({ id: i.id, qty: i.qtyOrdered })) });
  const stockOf = async () => (await call<{ products: Array<{ id: string; stock: number }> }>("GET", "/api/catalogue")).products.find((p) => p.id === po.items[0].productId)!.stock;
  const before = await stockOf();
  await call("POST", `/api/purchases/${po.id}/receive`);
  await call("POST", `/api/purchases/${po.id}/receive`); // a double tap must not add twice
  const after = await stockOf();
  assert(after === before + po.items[0].qtyOrdered, `stock ${before} → ${after}`);
  console.log(`      ${po.items[0].name}: ${before} → ${after} · ${po.supplierSlug}`);
});

await step("event log shows the whole chain", async () => {
  const { events } = await call<{ events: Array<{ type: string }> }>("GET", "/api/events");
  const types = new Set(events.map((e) => e.type));
  for (const t of ["parchi.cached", "bill.confirmed", "payment.created", "bill.paid", "salaahkaar.answer", "action.approved", "action.executed", "po.sent", "po.accepted", "stock.received"]) assert(types.has(t), `missing ${t}`);
});

console.log(failures ? `\n${failures} step(s) failed.` : `\nGolden path passed${ready && (ready as Record<string, { detail: string }>).payments?.detail ? ` (${(ready as Record<string, { detail: string }>).payments.detail})` : ""}.`);
process.exit(failures ? 1 : 0);

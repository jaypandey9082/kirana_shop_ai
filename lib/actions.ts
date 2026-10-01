/**
 * Approvals and execution (Section 9).
 *
 * PENDING --approve--> APPROVED --execute--> EXECUTED
 *         --reject---> REJECTED              (FAILED on dispatch error; can be retried)
 *
 * - Nothing executes without an explicit approval (tap or voice).
 * - Execution writes exactly one outbox row (unique per action) under a row lock, so
 *   duplicate n8n callbacks or double taps cannot run an action twice.
 * - With N8N_WEBHOOK_URL set, approval posts a signed webhook to n8n, and n8n calls back
 *   /api/actions/:id/executed with N8N_CALLBACK_SECRET. Without n8n, the built-in
 *   outbox executes it immediately (labelled as such). Neither sends real WhatsApp.
 */
import { createHmac } from "node:crypto";
import type { Sql } from "@/lib/db/client";
import { DomainError } from "@/lib/bills";
import { logEvent } from "@/lib/events";
import { actionView, type ActionView } from "@/lib/salaahkaar/tools";

type Via = "tap" | "voice";

async function merchantOf(sql: Sql, id: string) {
  const [a] = await sql<{ merchant_id: string }[]>`select merchant_id from actions where id = ${id}`;
  if (!a) throw new DomainError("NOT_FOUND", "Action not found.");
  return a.merchant_id;
}

export async function getAction(sql: Sql, id: string): Promise<ActionView> {
  await merchantOf(sql, id);
  return actionView(sql, id);
}

export async function rejectAction(sql: Sql, id: string, via: Via = "tap"): Promise<ActionView> {
  await sql.begin(async (tx) => {
    const [a] = await tx<{ status: string; payload: { title: string } }[]>`select status, payload from actions where id = ${id} for update`;
    if (!a) throw new DomainError("NOT_FOUND", "Action not found.");
    if (a.status === "REJECTED") return;
    if (a.status !== "PENDING") throw new DomainError("CONFLICT", "Already approved; it can't be rejected now.");
    await tx`update actions set status = 'REJECTED', decided_at = now() where id = ${id}`;
    await tx`insert into events (merchant_id, type, summary, data) select merchant_id, 'action.rejected',
      ${`Not now (${via}): ${a.payload.title}`}, ${tx.json({ actionId: id, via })} from actions where id = ${id}`;
  });
  return actionView(sql, id);
}

export async function approveAction(sql: Sql, id: string, via: Via = "tap", env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<ActionView> {
  const fresh = await sql.begin(async (tx) => {
    const [a] = await tx<{ status: string; payload: { title: string } }[]>`select status, payload from actions where id = ${id} for update`;
    if (!a) throw new DomainError("NOT_FOUND", "Action not found.");
    if (a.status === "REJECTED") throw new DomainError("CONFLICT", "This draft was rejected. Ask Salaahkaar for a new one.");
    if (a.status !== "PENDING") return false; // approve is idempotent
    await tx`update actions set status = 'APPROVED', decided_at = now(), error = null where id = ${id}`;
    await tx`insert into events (merchant_id, type, summary, data) select merchant_id, 'action.approved',
      ${`Approved by shopkeeper (${via}): ${a.payload.title}`}, ${tx.json({ actionId: id, via })} from actions where id = ${id}`;
    return true;
  });
  if (fresh) await dispatch(sql, id, env, fetchImpl);
  return actionView(sql, id);
}

/** Retry a FAILED dispatch (e.g. n8n was down). */
export async function retryAction(sql: Sql, id: string, env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch) {
  const [a] = await sql`update actions set status = 'APPROVED', error = null where id = ${id} and status = 'FAILED' returning id`;
  if (!a) throw new DomainError("CONFLICT", "Only failed actions can be retried.");
  await dispatch(sql, id, env, fetchImpl);
  return actionView(sql, id);
}

export function signPayload(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

async function dispatch(sql: Sql, id: string, env: Record<string, string | undefined>, fetchImpl: typeof fetch) {
  const webhook = env.N8N_WEBHOOK_URL?.trim();
  if (!webhook) return markExecuted(sql, id, "built-in outbox");
  const [a] = await sql<{ type: string; payload: Record<string, unknown>; draft_text: string }[]>`select type, payload, draft_text from actions where id = ${id}`;
  const appUrl = (env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const body = JSON.stringify({
    actionId: id, type: a.type, to: a.payload.to, title: a.payload.title, message: a.draft_text,
    callbackUrl: `${appUrl}/api/actions/${id}/executed`,
  });
  try {
    const res = await fetchImpl(webhook, {
      method: "POST", body, signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json", "x-kirana-signature": signPayload(body, env.N8N_WEBHOOK_SECRET ?? "") },
    });
    if (!res.ok) throw new Error(`n8n responded ${res.status}`);
    await logEvent(sql, null, "action.dispatched", `Sent to n8n for execution: ${a.payload.title}`, { actionId: id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sql`update actions set status = 'FAILED', error = ${message} where id = ${id} and status = 'APPROVED'`;
    await logEvent(sql, null, "action.failed", `n8n unreachable for “${a.payload.title}”: ${message}. Retry from the app.`, { actionId: id });
  }
}

/** The single execution point. Requires an approved action; safe to call repeatedly. */
export async function markExecuted(sql: Sql, id: string, deliveredVia: "n8n" | "built-in outbox"): Promise<ActionView> {
  await sql.begin(async (tx) => {
    const [a] = await tx<{ merchant_id: string; type: string; status: string; payload: Record<string, unknown>; draft_text: string }[]>`
      select merchant_id, type, status, payload, draft_text from actions where id = ${id} for update`;
    if (!a) throw new DomainError("NOT_FOUND", "Action not found.");
    if (a.status === "EXECUTED") return;
    if (a.status !== "APPROVED") throw new DomainError("CONFLICT", "Only approved actions can be executed.");
    const channel = a.type === "reorder" ? "supplier_message" : "customer_reminder";
    const link = `https://wa.me/?text=${encodeURIComponent(a.draft_text)}`;
    await tx`insert into outbox (action_id, channel, recipient, body, link, delivered_via)
             values (${id}, ${channel}, ${String(a.payload.to ?? "")}, ${a.draft_text}, ${link}, ${deliveredVia})`;
    await tx`update actions set status = 'EXECUTED', executed_at = now(), error = null where id = ${id}`;
    await tx`insert into events (merchant_id, type, summary, data) values (${a.merchant_id}, 'action.executed',
      ${`Done via ${deliveredVia}: ${String(a.payload.title)} → ${String(a.payload.to ?? "")} (message ready in Outbox; not auto-sent on WhatsApp)`},
      ${tx.json({ actionId: id, deliveredVia })})`;
  });
  return actionView(sql, id);
}

export async function listOutbox(sql: Sql, merchantId: string) {
  return sql<{ id: string; channel: string; recipient: string; body: string; link: string | null; deliveredVia: string; createdAt: Date }[]>`
    select o.id, o.channel, o.recipient, o.body, o.link, o.delivered_via "deliveredVia", o.created_at "createdAt"
    from outbox o join actions a on a.id = o.action_id where a.merchant_id = ${merchantId} order by o.created_at desc limit 50`;
}

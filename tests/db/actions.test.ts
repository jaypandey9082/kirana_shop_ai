/** Section 9 checkpoint: an approved action executes once and appears in the log. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { resetDemo } from "@/lib/demo/reset";
import { getMerchantId } from "@/lib/bills";
import { askSalaahkaar } from "@/lib/salaahkaar/agent";
import { approveAction, markExecuted, rejectAction, retryAction, signPayload } from "@/lib/actions";
import { POST as executedRoute } from "@/app/api/actions/[id]/executed/route";

const url = process.env.TEST_DATABASE_URL;
const NOW = new Date("2026-10-03T09:30:00Z");

describe.skipIf(!url)("approvals and execution", () => {
  let sql: Sql;
  let m: string;
  beforeAll(async () => { sql = createSql(url!); await migrate(sql); });
  beforeEach(async () => { await resetDemo(sql, NOW); m = await getMerchantId(sql); });
  afterAll(async () => { await sql?.end(); });

  const draftReorder = async () => (await askSalaahkaar(sql, m, "kya khatam hone wala hai?", { now: NOW, env: {} })).actions[0];
  const outboxCount = async (id: string) => (await sql`select count(*)::int n from outbox where action_id = ${id}`)[0].n;

  it("does nothing until approved, then executes once via the built-in outbox", async () => {
    const a = await draftReorder();
    expect(await outboxCount(a.id)).toBe(0);
    await expect(markExecuted(sql, a.id, "built-in outbox")).rejects.toThrow(/Only approved/);

    const done = await approveAction(sql, a.id, "voice", {});
    expect(done.status).toBe("EXECUTED");
    expect(await outboxCount(a.id)).toBe(1);

    // Double taps, repeated approvals and duplicate callbacks do nothing more.
    await approveAction(sql, a.id, "tap", {});
    await markExecuted(sql, a.id, "n8n");
    await Promise.all([markExecuted(sql, a.id, "n8n"), markExecuted(sql, a.id, "n8n")]);
    expect(await outboxCount(a.id)).toBe(1);

    const log = await sql`select type, summary from events where data->>'actionId' = ${a.id} order by id`;
    expect(log.map((e) => e.type)).toEqual(["action.pending", "action.approved", "action.executed"]);
    expect(log[1].summary).toContain("(voice)");
    expect(log[2].summary).toContain("not auto-sent");
  });

  it("rejected drafts can't be approved or executed", async () => {
    const a = await draftReorder();
    expect((await rejectAction(sql, a.id)).status).toBe("REJECTED");
    await expect(approveAction(sql, a.id, "tap", {})).rejects.toThrow(/rejected/);
    await expect(markExecuted(sql, a.id, "n8n")).rejects.toThrow(/Only approved/);
    expect(await outboxCount(a.id)).toBe(0);
  });

  it("with n8n: posts a signed webhook, waits for the authenticated callback", async () => {
    const a = await draftReorder();
    const sent: Array<{ url: string; body: string; sig: string }> = [];
    const fakeFetch = (async (u: string, init: RequestInit) => {
      sent.push({ url: u, body: String(init.body), sig: (init.headers as Record<string, string>)["x-kirana-signature"] });
      return new Response("ok");
    }) as unknown as typeof fetch;
    const env = { N8N_WEBHOOK_URL: "https://n8n.example/webhook/kirana", N8N_WEBHOOK_SECRET: "w".repeat(32), APP_URL: "https://app.example" };
    const approved = await approveAction(sql, a.id, "tap", env, fakeFetch);
    expect(approved.status).toBe("APPROVED");
    expect(sent).toHaveLength(1);
    expect(sent[0].sig).toBe(signPayload(sent[0].body, env.N8N_WEBHOOK_SECRET));
    expect(JSON.parse(sent[0].body)).toMatchObject({ actionId: a.id, type: "reorder", callbackUrl: `https://app.example/api/actions/${a.id}/executed` });

    process.env.N8N_CALLBACK_SECRET = "c".repeat(32);
    process.env.DATABASE_URL = url;
    const call = (secret?: string) => executedRoute(new Request("http://x", { method: "POST", headers: secret ? { "x-n8n-callback-secret": secret } : {} }), { params: Promise.resolve({ id: a.id }) } as never);
    expect((await call()).status).toBe(401);
    expect((await call("wrong".padEnd(32, "x"))).status).toBe(401);
    const ok = await call("c".repeat(32));
    expect(ok.status).toBe(200);
    expect((await ok.json()).action.status).toBe("EXECUTED");
    expect((await call("c".repeat(32))).status).toBe(200); // duplicate callback is a no-op
    expect(await outboxCount(a.id)).toBe(1);
  });

  it("marks the action FAILED when n8n is unreachable, and can retry", async () => {
    const a = await draftReorder();
    const down = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    const env = { N8N_WEBHOOK_URL: "https://n8n.example/hook", N8N_WEBHOOK_SECRET: "w".repeat(32) };
    expect((await approveAction(sql, a.id, "tap", env, down)).status).toBe("FAILED");
    const retried = await retryAction(sql, a.id, {}); // n8n removed → built-in outbox
    expect(retried.status).toBe("EXECUTED");
    expect(await outboxCount(a.id)).toBe(1);
  });
});

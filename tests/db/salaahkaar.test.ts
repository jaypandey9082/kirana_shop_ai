/** Section 8 checkpoint: answers use tool data; no action executes without approval. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type OpenAI from "openai";
import { createSql, type Sql } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { resetDemo } from "@/lib/demo/reset";
import { getMerchantId } from "@/lib/bills";
import { allowedNumbers, askSalaahkaar, numbersAreGrounded, salaahkaarNudges } from "@/lib/salaahkaar/agent";

const url = process.env.TEST_DATABASE_URL;
const NOW = new Date("2026-10-03T09:30:00Z");
const OFFLINE = { now: NOW, env: {} as Record<string, string | undefined> };

/** A scripted fake of the Responses API: returns the queued outputs in order. */
function fakeClient(script: Array<{ output: unknown[]; output_text?: string } | Error>) {
  const calls: unknown[] = [];
  const client = {
    responses: {
      create: async (req: unknown) => {
        calls.push(JSON.parse(JSON.stringify(req)));
        const next = script.shift();
        if (!next) throw new Error("script exhausted");
        if (next instanceof Error) throw next;
        return { output_text: "", ...next };
      },
    },
  } as unknown as OpenAI;
  return { client, calls };
}

describe.skipIf(!url)("Salaahkaar", () => {
  let sql: Sql;
  let m: string;
  beforeAll(async () => { sql = createSql(url!); await migrate(sql); });
  beforeEach(async () => { await resetDemo(sql, NOW); m = await getMerchantId(sql); });
  afterAll(async () => { await sql?.end(); });

  it("offline: answers sales + run-out from tools and drafts a PENDING reorder", async () => {
    const r = await askSalaahkaar(sql, m, "Aaj kitna sale hua, aur kya khatam hone wala hai?", OFFLINE);
    expect(r.mode).toBe("offline");
    expect(r.tools).toEqual(["get_sales_summary", "forecast_runout", "propose_reorder"]);
    expect(r.display).toMatch(/Aaj ₹[\d,]+ ka sale hua, \d+ bills/);
    expect(r.display).toContain("Toned milk 500ml sirf 8 bache");
    expect(r.cards.every((c) => c.source.length > 0)).toBe(true);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]).toMatchObject({ type: "reorder", status: "PENDING" });
    const [a] = await sql`select status, executed_at from actions where id = ${r.actions[0].id}`;
    expect(a.status).toBe("PENDING");
    expect(a.executed_at).toBeNull();
  });

  it("offline: every number it says is backed by tool data", async () => {
    for (const q of ["aaj ka sale aur udhaar batao", "kya khatam hone wala hai", "kal ka sale", "dheere bikne wale items", "is hafte ki bikri"]) {
      const r = await askSalaahkaar(sql, m, q, OFFLINE);
      const allowed = allowedNumbers([q, ...r.evidence]);
      expect(numbersAreGrounded(r.display, allowed)).toBe(true);
      expect(numbersAreGrounded(r.speak, allowed)).toBe(true);
      expect(r.display).not.toContain("Yeh rahe aapke numbers");
    }
  });

  it("does not create duplicate pending drafts when asked again", async () => {
    await askSalaahkaar(sql, m, "kya khatam hone wala hai?", OFFLINE);
    await askSalaahkaar(sql, m, "stock khatam?", OFFLINE);
    const [{ n }] = await sql`select count(*)::int n from actions where type = 'reorder' and status = 'PENDING'`;
    expect(n).toBe(1);
  });

  it("offline: overdue udhaar and a reminder draft on request", async () => {
    const r = await askSalaahkaar(sql, m, "kiska udhaar baaki hai? yaad dilao", OFFLINE);
    expect(r.display).toContain("3 customers ka ₹2,150 udhaar 30 din se purana hai");
    expect(r.actions[0]).toMatchObject({ type: "reminder", status: "PENDING" });
    expect(r.actions[0].draft).toContain("₹980");
  });

  it("offline: unknown questions get help, not invented numbers", async () => {
    const r = await askSalaahkaar(sql, m, "mausam kaisa hai?", OFFLINE);
    expect(r.tools).toEqual([]);
    expect(r.display).toContain("Aaj kitna sale hua?");
  });

  it("AI mode: runs the requested tool, feeds the result back, and keeps a grounded answer", async () => {
    // Make the final answer quote the real tool number.
    const real = await askSalaahkaar(sql, m, "aaj ka sale", OFFLINE);
    const total = real.display.match(/₹[\d,]+/)![0];
    const scripted = fakeClient([
      { output: [{ type: "function_call", name: "get_sales_summary", arguments: JSON.stringify({ period: "today" }), call_id: "c1" }] },
      { output: [], output_text: JSON.stringify({ display: `Aaj ${total} ka sale hua.`, speak: `आज ${total} की बिक्री हुई।` }) },
    ]);
    const r = await askSalaahkaar(sql, m, "aaj ka sale?", { now: NOW, client: scripted.client, model: "test-model" });
    expect(r.mode).toBe("ai");
    expect(r.tools).toEqual(["get_sales_summary"]);
    expect(r.display).toBe(`Aaj ${total} ka sale hua.`);
    const second = scripted.calls[1] as { input: Array<{ type?: string; call_id?: string }>; tools: Array<{ strict: boolean }> };
    expect(second.input.some((i) => i.type === "function_call_output" && i.call_id === "c1")).toBe(true);
    expect(second.tools.every((t) => t.strict)).toBe(true);
  });

  it("AI mode: an invented number is caught and replaced by the tool cards", async () => {
    const { client } = fakeClient([
      { output: [{ type: "function_call", name: "get_sales_summary", arguments: JSON.stringify({ period: "today" }), call_id: "c1" }] },
      { output: [], output_text: JSON.stringify({ display: "Aaj ₹99,999 ka sale hua.", speak: "आज 99999 रुपये।" }) },
    ]);
    const r = await askSalaahkaar(sql, m, "aaj ka sale?", { now: NOW, client, model: "test-model" });
    expect(r.mode).toBe("ai-guarded");
    expect(r.display).not.toContain("99,999");
    expect(r.cards.length).toBeGreaterThan(0);
  });

  it("AI mode: a model failure falls back to the offline answer", async () => {
    const { client } = fakeClient([new Error("network down")]);
    const r = await askSalaahkaar(sql, m, "aaj kitna sale hua?", { now: NOW, client, model: "test-model" });
    expect(r.mode).toBe("offline");
    expect(r.tools).toContain("get_sales_summary");
  });

  it("logs every answer with the tools used", async () => {
    await askSalaahkaar(sql, m, "aaj kitna sale hua?", OFFLINE);
    const [e] = await sql`select summary from events where type = 'salaahkaar.answer' order by id desc limit 1`;
    expect(e.summary).toContain("get_sales_summary");
  });

  it("produces proactive nudges for milk and overdue udhaar", async () => {
    const cards = await salaahkaarNudges(sql, m, NOW);
    expect(cards.some((c) => c.headline.startsWith("Toned milk 500ml"))).toBe(true);
    expect(cards.some((c) => c.headline.includes("₹2,150"))).toBe(true);
  });
});

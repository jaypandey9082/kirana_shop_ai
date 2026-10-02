/**
 * Salaahkaar (Section 8): answers a shopkeeper's Hindi/Hinglish question.
 *
 * - AI mode (OpenAI configured): the model picks tools; tool results go back to it; it
 *   replies in short Hinglish (display) + Devanagari Hindi (speak).
 * - Offline mode (no key, or the AI call fails): keyword intents → the same tools →
 *   templated answers. Clearly labelled in the UI.
 * - Number guard: any number in the reply that isn't in a tool result (or the question)
 *   makes us discard the model's wording and show the tool cards instead.
 */
import OpenAI from "openai";
import { z } from "zod";
import type { Sql } from "@/lib/db/client";
import { normalize } from "@/lib/matcher";
import { openAiConfigured } from "@/lib/ai/extract";
import { logEvent } from "@/lib/events";
import { TOOLS, toolByName, type ActionView, type InsightCardData, type ToolContext, type ToolResult } from "./tools";

export interface SalaahkaarReply {
  mode: "ai" | "offline" | "ai-guarded";
  display: string;
  speak: string;
  cards: InsightCardData[];
  actions: ActionView[];
  tools: string[];
  /** The raw tool results the answer was built from (what the number guard checks against). */
  evidence: unknown[];
}

// ------------------------------------------------------------------ number guard

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const toAscii = (s: string) => s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
export function numbersIn(text: string): string[] {
  return (toAscii(text).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => String(Number(n.replace(/,/g, ""))));
}

export function allowedNumbers(values: unknown[]): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown, key = "") => {
    if (typeof v === "number" && Number.isFinite(v)) {
      // Replies state magnitudes ("22% kam" for -22), so allow absolute values too.
      for (const x of [v, Math.abs(v)]) { out.add(String(x)); out.add(String(Math.round(x))); }
      if (/paise$/i.test(key)) { out.add(String(v / 100)); out.add(String(Math.round(v / 100))); }
    } else if (typeof v === "string") {
      numbersIn(v).forEach((n) => out.add(n));
    } else if (Array.isArray(v)) {
      v.forEach((x) => walk(x, key));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, k);
    }
  };
  values.forEach((v) => walk(v));
  return out;
}

/** True when every number in the reply is backed by tool data or the question. */
export function numbersAreGrounded(reply: string, allowed: Set<string>): boolean {
  return numbersIn(reply).every((n) => allowed.has(n));
}

export { classifyApproval } from "./intent";

// ------------------------------------------------------------------ offline mode

type Intent = "sales" | "stock" | "dues" | "slow";
const KEYWORDS: Record<Intent, string[]> = {
  sales: ["sale", "sales", "bikri", "becha", "kamai", "kitna hua", "galla", "बिक्री", "सेल", "कमाई"],
  stock: ["khatam", "khatm", "khtm", "khatam hone", "stock", "mangwana", "mangwa", "reorder", "kam hai", "kam ho", "low", "खत्म", "ख़त्म", "स्टॉक", "मंगवाना"],
  dues: ["udhaar", "udhar", "udhaari", "baaki", "baki", "khata", "khate", "paisa", "paise", "dena", "उधार", "बाकी", "बाक़ी", "खाता"],
  slow: ["slow", "dheere", "nahi bik", "pada hai", "pade hain", "धीरे"],
};
function intentsOf(q: string): Intent[] {
  const t = ` ${normalize(q)} `;
  // Whole words/phrases only ("khata" must not match inside "khatam").
  return (Object.keys(KEYWORDS) as Intent[]).filter((i) => KEYWORDS[i].some((k) => t.includes(` ${normalize(k)} `)));
}

async function runTool(ctx: ToolContext, name: string, args: Record<string, unknown>, used: string[], results: ToolResult[]) {
  const tool = toolByName(name)!;
  const r = await tool.run(ctx, args);
  used.push(name);
  results.push(r);
  return r;
}

async function offlineAnswer(ctx: ToolContext, question: string): Promise<SalaahkaarReply> {
  const used: string[] = [];
  const results: ToolResult[] = [];
  const display: string[] = [];
  const speak: string[] = [];
  const q = normalize(question);
  const intents = intentsOf(question);

  if (intents.includes("sales")) {
    const period = /\bkal\b|कल|yesterday/.test(q) ? "yesterday" : /hafte|hafta|week|7 din|हफ्ते/.test(q) ? "last7" : "today";
    const { data } = await runTool(ctx, "get_sales_summary", { period }, used, results);
    const s = data as { label: string; total: string; bills: number; changePct: number | null };
    const change = s.changePct === null ? "" : s.changePct === 0 ? " Pichhle hafte jitna." : ` Pichhle hafte se ${Math.abs(s.changePct)}% ${s.changePct > 0 ? "zyada" : "kam"}.`;
    display.push(`${s.label[0].toUpperCase()}${s.label.slice(1)} ${s.total} ka sale hua, ${s.bills} bills.${change}`);
    speak.push(`${s.label === "aaj" ? "आज" : s.label === "kal" ? "कल" : "पिछले 7 दिन में"} ${s.total.replace("₹", "")} रुपये की बिक्री हुई, ${s.bills} बिल।`);
  }
  if (intents.includes("stock")) {
    const { data } = await runTool(ctx, "forecast_runout", { sku: null }, used, results);
    const items = (data as { items: Array<{ sku: string; name: string; stock: number; runsOutAtLocal: string | null }> }).items;
    if (items.length) {
      const top = items[0];
      display.push(`${top.name} sirf ${top.stock} bache hain${top.runsOutAtLocal ? `, lagbhag ${top.runsOutAtLocal} tak khatam ho sakta hai` : ""}. Reorder ka draft bana diya hai, approve karein to bhej dunga.`);
      speak.push(`${top.name} सिर्फ ${top.stock} बचे हैं, आज रात तक खत्म हो सकता है। मंगवाने का ड्राफ्ट तैयार है, हाँ बोलें तो भेज दूँ।`);
      await runTool(ctx, "propose_reorder", { sku: top.sku, qty: null }, used, results);
    } else {
      // Nothing runs out before the morning restock (e.g. after closing time), but items
      // already below their reorder level still deserve a reorder suggestion.
      const { data: low } = await runTool(ctx, "get_low_stock", {}, used, results);
      const items = (low as { items: Array<{ sku: string; name: string; stock: number; reorderLevel: number }> }).items;
      display.push("Kal subah ke restock tak koi item khatam hone ka khatra nahi.");
      speak.push("कल सुबह तक कोई सामान खत्म होने का खतरा नहीं है।");
      if (items.length) {
        const top = items[0];
        display.push(`Par ${top.name} reorder level se neeche hai (${top.stock} bache, level ${top.reorderLevel}). Reorder ka draft bana diya hai, approve karein to bhej dunga.`);
        speak.push(`पर ${top.name} कम है, सिर्फ ${top.stock} बचे हैं। मंगवाने का ड्राफ्ट तैयार है।`);
        await runTool(ctx, "propose_reorder", { sku: top.sku, qty: null }, used, results);
      }
    }
  }
  if (intents.includes("dues")) {
    const { data } = await runTool(ctx, "get_overdue_dues", { min_days: 30 }, used, results);
    const d = data as { items: Array<{ name: string; balance: string }>; total: string };
    if (d.items.length) {
      display.push(`${d.items.length} customers ka ${d.total} udhaar 30 din se purana hai. Sabse purana: ${d.items[0].name} (${d.items[0].balance}).`);
      speak.push(`${d.items.length} ग्राहकों का ${d.total.replace("₹", "")} रुपये उधार 30 दिन से पुराना है।`);
      if (/yaad|remind|reminder|message|bolo|याद/.test(q)) {
        await runTool(ctx, "propose_reminder", { customer_name: d.items[0].name }, used, results);
        display.push(`${d.items[0].name} ke liye reminder draft tayyar hai, approve karein.`);
      }
    } else {
      display.push("30 din se purana koi udhaar nahi hai.");
      speak.push("तीस दिन से पुराना कोई उधार नहीं है।");
    }
  }
  if (intents.includes("slow")) {
    const { data } = await runTool(ctx, "get_slow_movers", {}, used, results);
    const items = (data as { items: Array<{ name: string }> }).items;
    display.push(items.length ? `Dheere bik rahe hain: ${items.slice(0, 3).map((i) => i.name).join(", ")}.` : "Koi item zyada der se pada nahi hai.");
    speak.push(items.length ? "कुछ सामान धीरे बिक रहा है, स्क्रीन पर देखिए।" : "कोई सामान ज़्यादा देर से नहीं पड़ा है।");
  }
  if (!intents.length) {
    display.push("Main sales, stock, udhaar aur dheere bikne wale items ke baare mein bata sakta hoon. Jaise: “Aaj kitna sale hua?” ya “Kya khatam hone wala hai?”");
    speak.push("मैं बिक्री, स्टॉक और उधार के बारे में बता सकता हूँ।");
  }
  const evidence = results.map((r) => r.data);
  const allowed = allowedNumbers([question, ...evidence]);
  let text = display.join(" ");
  let voice = speak.join(" ");
  if (!numbersAreGrounded(text, allowed) || !numbersAreGrounded(voice, allowed)) {
    // Should never happen (templates only use tool data), but the guard applies to every mode.
    console.warn("offline Salaahkaar text failed the number guard", { text });
    text = "Yeh rahe aapke numbers (seedhe dukaan ke data se):";
    voice = "जवाब स्क्रीन पर है।";
  }
  return {
    mode: "offline", display: text, speak: voice,
    cards: results.flatMap((r) => r.cards), actions: results.flatMap((r) => (r.action ? [r.action] : [])), tools: used, evidence,
  };
}

// ------------------------------------------------------------------ AI mode

export const SALAAHKAAR_INSTRUCTIONS = `You are Salaahkaar, the business adviser inside Kirana Shop AI for a neighbourhood kirana store in Mumbai.
The shopkeeper asks short questions in Hindi, Hinglish or English, often by voice, while serving customers.

Rules:
- Always call tools to get numbers. Never state a number (money, quantity, count, percentage, time, days) that is not in a tool result or in the question.
- Keep answers to one or two short sentences a busy shopkeeper can hear in a few seconds.
- "display" is natural Hinglish in Latin script. "speak" is the same message in simple Hindi (Devanagari), using digits for numbers.
- If something will run out, call propose_reorder for the most urgent item. If nothing will run out but items are below their reorder level (get_low_stock), propose a reorder for the lowest one. If asked to remind a customer, call propose_reminder.
- Drafts are not sent. Say they need the shopkeeper's approval ("approve karein to bhej dunga"). Never say a message was sent or a payment was made.
- No financial advice, loans or credit scoring. If asked something you have no tool for, say so briefly.`;

const replySchema = z.object({ display: z.string().min(1), speak: z.string().min(1) });
const REPLY_FORMAT = {
  type: "json_schema" as const, name: "salaahkaar_reply", strict: true,
  schema: { type: "object", properties: { display: { type: "string" }, speak: { type: "string" } }, required: ["display", "speak"], additionalProperties: false },
};

async function aiAnswer(ctx: ToolContext, question: string, client: OpenAI, model: string): Promise<SalaahkaarReply> {
  const used: string[] = [];
  const results: ToolResult[] = [];
  const input: OpenAI.Responses.ResponseInput = [{ role: "user", content: question }];
  const tools: OpenAI.Responses.Tool[] = TOOLS.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters, strict: true }));

  for (let round = 0; round < 5; round++) {
    const res = await client.responses.create({ model, instructions: SALAAHKAAR_INSTRUCTIONS, input, tools, text: { format: REPLY_FORMAT } });
    const calls = res.output.filter((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === "function_call");
    if (!calls.length) {
      const parsed = replySchema.safeParse((() => { try { return JSON.parse(res.output_text); } catch { return null; } })());
      if (!parsed.success) throw new Error("Salaahkaar reply was not valid JSON");
      const allowed = allowedNumbers([question, ...results.map((r) => r.data)]);
      const grounded = numbersAreGrounded(parsed.data.display, allowed) && numbersAreGrounded(parsed.data.speak, allowed);
      const cards = results.flatMap((r) => r.cards);
      return {
        mode: grounded ? "ai" : "ai-guarded",
        display: grounded ? parsed.data.display : "Yeh rahe aapke numbers (seedhe dukaan ke data se):",
        speak: grounded ? parsed.data.speak : "जवाब स्क्रीन पर है।",
        cards, actions: results.flatMap((r) => (r.action ? [r.action] : [])), tools: used, evidence: results.map((r) => r.data),
      };
    }
    input.push(...(res.output as OpenAI.Responses.ResponseInputItem[]));
    for (const call of calls) {
      const tool = toolByName(call.name);
      let output: unknown;
      if (!tool) output = { error: `Unknown tool ${call.name}` };
      else {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.arguments || "{}"); } catch { /* empty args */ }
        const r = await tool.run(ctx, args);
        used.push(call.name);
        results.push(r);
        output = r.data;
      }
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output) });
    }
  }
  throw new Error("Salaahkaar used too many tool rounds");
}

export async function askSalaahkaar(
  sql: Sql, merchantId: string, question: string,
  opts: { now?: Date; client?: OpenAI; model?: string; env?: Record<string, string | undefined> } = {},
): Promise<SalaahkaarReply> {
  const env = opts.env ?? process.env;
  const [m] = await sql<{ name: string }[]>`select name from merchants where id = ${merchantId}`;
  const ctx: ToolContext = { sql, merchantId, now: opts.now ?? new Date(), shopName: m?.name ?? "Dukaan" };
  let reply: SalaahkaarReply;
  const client = opts.client ?? (openAiConfigured(env) ? new OpenAI({ apiKey: env.OPENAI_API_KEY!.trim(), timeout: 30_000, maxRetries: 1 }) : null);
  const model = opts.model ?? env.OPENAI_MODEL?.trim();
  if (client && model) {
    try {
      reply = await aiAnswer(ctx, question, client, model);
    } catch (error) {
      console.error("salaahkaar AI failed, using offline mode", error);
      reply = await offlineAnswer(ctx, question);
    }
  } else {
    reply = await offlineAnswer(ctx, question);
  }
  await logEvent(sql, null, "salaahkaar.answer",
    `Salaahkaar (${reply.mode}) answered “${question.slice(0, 60)}” using ${reply.tools.length ? reply.tools.join(", ") : "no tools"}`,
    { mode: reply.mode, tools: reply.tools });
  return reply;
}

/** Proactive cards for the Salaahkaar screen: what needs attention right now. */
export async function salaahkaarNudges(sql: Sql, merchantId: string, now = new Date()): Promise<InsightCardData[]> {
  const ctx: ToolContext = { sql, merchantId, now, shopName: "" };
  const runout = await toolByName("forecast_runout")!.run(ctx, { sku: null });
  const dues = await toolByName("get_overdue_dues")!.run(ctx, { min_days: 30 });
  return [...runout.cards.filter((c) => !c.headline.startsWith("Kal subah tak koi")), ...dues.cards.filter((c) => !c.headline.includes("koi udhaar nahi"))];
}

import { getSql } from "@/lib/db/client";
import { getPaymentMode } from "@/lib/payments/service";
import { openAiConfigured } from "@/lib/ai/extract";
import { getVoiceProvider } from "@/lib/ai/voice";
import { DEMO_MERCHANT_SLUG } from "@/lib/demo/generate";

/**
 * GET /api/ready — pre-demo checklist. Reports what is configured and reachable,
 * never secret values. (/api/health stays a pure liveness check.)
 */
export async function GET() {
  let database: { ok: boolean; detail: string };
  try {
    const sql = getSql();
    const [r] = await sql`select (select count(*)::int from schema_migrations) migrations,
                                 (select count(*)::int from products) products,
                                 (select count(*)::int from merchants where slug = ${process.env.DEMO_MERCHANT_SLUG || DEMO_MERCHANT_SLUG}) store`;
    database = { ok: r.store === 1 && r.products > 0, detail: `${r.migrations} migrations · ${r.products} products · demo store ${r.store ? "loaded" : "missing"}` };
  } catch (error) {
    database = { ok: false, detail: error instanceof Error ? error.message.split("\n")[0] : "unreachable" };
  }
  const payment = getPaymentMode();
  const body = {
    database,
    payments: { mode: payment, ok: payment !== "misconfigured", detail: payment === "staging" ? "Paytm staging" : payment === "mock" ? "Mock gateway (labelled)" : "PAYMENT_PROVIDER=paytm but MID/key missing" },
    parchiAndAgent: { ok: openAiConfigured(), detail: openAiConfigured() ? `OpenAI ${process.env.OPENAI_MODEL}` : "Not set: cached demo parchi + offline Salaahkaar" },
    voice: (() => { const v = getVoiceProvider(); return { ok: !!v, detail: v ? v.label : "Not set: typing + device voice" }; })(),
    automation: { ok: true, detail: process.env.N8N_WEBHOOK_URL ? "n8n webhook" : "Built-in outbox" },
    demoReset: { ok: process.env.DEMO_RESET_ENABLED === "true" && (process.env.DEMO_RESET_SECRET ?? "").length >= 16, detail: process.env.DEMO_RESET_ENABLED === "true" ? "enabled (secret required)" : "disabled" },
    appUrl: process.env.APP_URL ?? null,
  };
  return Response.json(body, { status: database.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

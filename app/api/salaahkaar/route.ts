import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { getMerchantId } from "@/lib/bills";
import { askSalaahkaar } from "@/lib/salaahkaar/agent";
import { handle, ok, readJson } from "@/lib/api";

const body = z.object({ question: z.string().trim().min(1).max(500) });

/** POST /api/salaahkaar — ask a question; returns text, source-backed cards and pending drafts. */
export async function POST(request: Request) {
  return handle(async () => {
    const { question } = await readJson(request, body);
    const sql = getSql();
    const reply = await askSalaahkaar(sql, await getMerchantId(sql), question);
    // Evidence stays server-side; the UI renders numbers from cards.
    return ok({ reply: { mode: reply.mode, display: reply.display, speak: reply.speak, cards: reply.cards, actions: reply.actions, tools: reply.tools } });
  });
}

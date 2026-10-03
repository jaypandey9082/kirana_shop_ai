/**
 * Time candidate OpenAI models on the three live tasks: parchi photo, spoken order and a
 * Salaahkaar question. Writes Salaahkaar events/actions to the DB, so reset demo data after.
 *   npx tsx --env-file=.env.local scripts/bench-models.mts <image.jpg> model1 model2 …
 */
import { readFileSync } from "node:fs";
import { OpenAiExtractor } from "@/lib/ai/extract";
import { askSalaahkaar } from "@/lib/salaahkaar/agent";
import { createSql } from "@/lib/db/client";
import { getMerchantId } from "@/lib/bills";

const [image, ...models] = process.argv.slice(2);
const key = process.env.OPENAI_API_KEY!.trim();
const base64 = readFileSync(image).toString("base64");
const sql = createSql(process.env.DATABASE_URL!);
const merchantId = await getMerchantId(sql);

async function timed<T>(fn: () => Promise<T>): Promise<[number, T | string]> {
  const t = Date.now();
  try { const r = await fn(); return [Date.now() - t, r]; }
  catch (e) { return [Date.now() - t, `ERROR ${e instanceof Error ? e.message.slice(0, 160) : e}`]; }
}

for (const model of models) {
  console.log(`\n=== ${model}`);
  const ex = new OpenAiExtractor(model, key);
  const [t1, photo] = await timed(() => ex.fromImage({ base64, mime: "image/jpeg" }));
  console.log(`parchi photo  ${t1} ms`, typeof photo === "string" ? photo : JSON.stringify(photo.map((i) => [i.raw, i.name, i.qty, i.legible])));
  const [t2, spoken] = await timed(() => ex.fromText("do doodh, ek bread aur teen biskut"));
  console.log(`spoken order  ${t2} ms`, typeof spoken === "string" ? spoken : JSON.stringify(spoken.map((i) => [i.name, i.qty])));
  const [t3, reply] = await timed(() => askSalaahkaar(sql, merchantId, "Aaj kitna sale hua, aur kya khatam hone wala hai?", { env: { ...process.env, OPENAI_MODEL: model } }));
  if (typeof reply === "string") console.log(`salaahkaar    ${t3} ms`, reply);
  else console.log(`salaahkaar    ${t3} ms [${reply.mode}] tools=${reply.tools.join(",")} actions=${reply.actions.length}\n              ${reply.display}`);
}
await sql.end();

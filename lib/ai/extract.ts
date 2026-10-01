/**
 * Item extraction from a parchi photo or a voice transcript (Section 6).
 * The model only READS the list. It never prices items or maps them to products:
 * our deterministic matcher does that, and unsure lines go to the shopkeeper.
 */
import OpenAI from "openai";
import { z } from "zod";

export interface ExtractedItem { raw: string; name: string; qty: number; legible: boolean }

export interface ItemExtractor {
  readonly label: string;
  fromImage(image: { base64: string; mime: string }): Promise<ExtractedItem[]>;
  fromText(text: string): Promise<ExtractedItem[]>;
}

const resultSchema = z.object({
  items: z.array(z.object({
    raw: z.string(),
    name: z.string(),
    qty: z.number().int(),
    legible: z.boolean(),
  })),
});

/** Strict JSON schema sent to the model (all fields required, no extras). */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw: { type: "string", description: "The line exactly as written or heard, original script." },
          name: { type: "string", description: "Item in simple lowercase Latin/Hinglish words, e.g. doodh, bread, biskut, atta 5kg." },
          qty: { type: "integer", description: "Units wanted. Default 1." },
          legible: { type: "boolean", description: "False if unsure what the item is." },
        },
        required: ["raw", "name", "qty", "legible"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

export const EXTRACTION_INSTRUCTIONS = `You read shopping lists that customers bring to Indian neighbourhood kirana shops, either as a handwritten parchi photo or as speech already turned into text.
Lists mix Hindi, Marathi, English and Hinglish, in Devanagari or Latin script, often with spelling mistakes.

Return every item in the order it appears. For each item:
- raw: the line exactly as written or heard, in its original script.
- name: the item in simple lowercase Latin/Hinglish words, the way a shopkeeper would say it (for example "doodh", "bread", "biskut", "namak", "atta 5kg"). Keep a size or weight if one is written. Do not add brands and do not guess a specific product.
- qty: how many units. Number words count: "do" or "दो" is 2, "teen" or "तीन" is 3. Default to 1. A weight that is part of the product (5kg atta) is not the quantity.
- legible: false whenever you are not sure what the item is.

Never invent items that are not on the list. Ignore prices, totals, dates, phone numbers and people's names. If the input is not a shopping list, return an empty list.`;

/** Validate and tidy the model's answer. Anything malformed is dropped, not guessed. */
export function cleanItems(json: unknown): ExtractedItem[] {
  const parsed = resultSchema.safeParse(json);
  if (!parsed.success) throw new Error("The model returned an unexpected format.");
  return parsed.data.items
    .map((i) => ({
      raw: i.raw.trim().slice(0, 120),
      name: i.name.trim().toLowerCase().slice(0, 80),
      qty: Math.min(Math.max(Number.isFinite(i.qty) ? Math.round(i.qty) : 1, 1), 99),
      legible: i.legible,
    }))
    .filter((i) => i.name.length > 0)
    .slice(0, 40);
}

export function openAiConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.OPENAI_API_KEY?.trim() && !!env.OPENAI_MODEL?.trim();
}

export class OpenAiExtractor implements ItemExtractor {
  readonly label: string;
  private client: OpenAI;
  constructor(private model: string, apiKey: string, client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 });
    this.label = `OpenAI ${model}`;
  }

  private async run(content: OpenAI.Responses.ResponseInputMessageContentList): Promise<ExtractedItem[]> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: EXTRACTION_INSTRUCTIONS,
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "shopping_list", schema: EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>, strict: true } },
    });
    let json: unknown;
    try { json = JSON.parse(response.output_text); } catch { throw new Error("The model did not return JSON."); }
    return cleanItems(json);
  }

  fromImage(image: { base64: string; mime: string }) {
    return this.run([
      { type: "input_text", text: "Read this parchi." },
      { type: "input_image", image_url: `data:${image.mime};base64,${image.base64}`, detail: "high" },
    ]);
  }

  fromText(text: string) {
    return this.run([{ type: "input_text", text: `Spoken order: ${text}` }]);
  }
}

export function getExtractor(env: Record<string, string | undefined> = process.env): ItemExtractor | null {
  if (!openAiConfigured(env)) return null;
  return new OpenAiExtractor(env.OPENAI_MODEL!.trim(), env.OPENAI_API_KEY!.trim());
}

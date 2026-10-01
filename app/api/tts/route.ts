import { z } from "zod";
import { DomainError } from "@/lib/bills";
import { sarvamConfigured, textToSpeech } from "@/lib/ai/sarvam";
import { handle, ok, readJson } from "@/lib/api";

const body = z.object({ text: z.string().trim().min(1).max(500) });
const cache = new Map<string, { base64: string; mime: string }>();

/** POST /api/tts — Hindi speech for short app messages. The client falls back to device speech if this fails. */
export async function POST(request: Request) {
  return handle(async () => {
    if (!sarvamConfigured()) throw new DomainError("CONFLICT", "Sarvam TTS is not set up.");
    const { text } = await readJson(request, body);
    let audio = cache.get(text);
    if (!audio) {
      try { audio = await textToSpeech(text); } catch (error) {
        console.error("tts failed", error);
        throw new DomainError("CONFLICT", "Voice unavailable right now.");
      }
      if (cache.size > 200) cache.clear();
      cache.set(text, audio);
    }
    return ok(audio);
  });
}

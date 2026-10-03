import { z } from "zod";
import { DomainError } from "@/lib/bills";
import { getVoiceProvider } from "@/lib/ai/voice";
import { handle, ok, readJson } from "@/lib/api";

const body = z.object({ text: z.string().trim().min(1).max(500) });
const cache = new Map<string, { base64: string; mime: string }>();

/** POST /api/tts — Hindi speech for short app messages. The client falls back to device speech if this fails. */
export async function POST(request: Request) {
  return handle(async () => {
    const voice = getVoiceProvider();
    if (!voice) throw new DomainError("CONFLICT", "Voice is not set up.");
    const { text } = await readJson(request, body);
    const cacheKey = `${voice.name}:${text}`;
    let audio = cache.get(cacheKey);
    if (!audio) {
      try { audio = await voice.speak(text); } catch (error) {
        console.error(`tts failed (${voice.name})`, error);
        throw new DomainError("CONFLICT", "Voice unavailable right now.");
      }
      if (cache.size > 200) cache.clear();
      cache.set(cacheKey, audio);
    }
    return ok(audio);
  });
}

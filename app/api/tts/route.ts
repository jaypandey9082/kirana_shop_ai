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

/**
 * GET /api/tts?text=… — streams the speech so a browser <audio> starts playing on the first bytes.
 * Identical phrases ("202 रुपये प्राप्त हुए", "ठीक है…") are served from the CDN cache next time.
 */
export async function GET(request: Request) {
  const voice = getVoiceProvider();
  const text = new URL(request.url).searchParams.get("text")?.trim() ?? "";
  if (!voice) return new Response("Voice is not set up.", { status: 409 });
  if (!text || text.length > 500) return new Response("text is required (max 500 characters).", { status: 400 });
  const headers = { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=3600, s-maxage=604800", "X-Voice-Provider": voice.name };
  const cacheKey = `${voice.name}:${text}`;
  const hit = cache.get(cacheKey);
  if (hit) return new Response(Buffer.from(hit.base64, "base64"), { headers: { ...headers, "Content-Type": hit.mime, "X-Cache": "hit" } });
  try {
    const { body, mime } = await voice.stream(text);
    // Pass bytes straight through and keep a copy once the clip is complete.
    const chunks: Uint8Array[] = [];
    const keep = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, c) { chunks.push(chunk); c.enqueue(chunk); },
      flush() {
        if (cache.size > 200) cache.clear();
        cache.set(cacheKey, { base64: Buffer.concat(chunks).toString("base64"), mime });
      },
    });
    return new Response(body.pipeThrough(keep), {
      headers: {
        ...headers,
        "Content-Type": mime,
      },
    });
  } catch (error) {
    console.error(`tts stream failed (${voice.name})`, error);
    return new Response("Voice unavailable right now.", { status: 502 });
  }
}

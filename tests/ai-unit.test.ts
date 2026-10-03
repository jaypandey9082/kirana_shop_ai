import { describe, expect, it } from "vitest";
import type OpenAI from "openai";
import { cleanItems, EXTRACTION_JSON_SCHEMA, OpenAiExtractor, openAiConfigured } from "@/lib/ai/extract";
import { sarvamConfigured, speechToText, textToSpeech } from "@/lib/ai/sarvam";
import { parseItemList } from "@/lib/matcher";

describe("cleanItems", () => {
  it("validates, tidies and clamps the model output", () => {
    expect(cleanItems({ items: [
      { raw: " दूध 2 ", name: " Doodh ", qty: 2, legible: true },
      { raw: "x", name: "   ", qty: 1, legible: true },
      { raw: "chips", name: "chips", qty: 500, legible: false },
      { raw: "salt", name: "namak", qty: 0, legible: true },
    ] })).toEqual([
      { raw: "दूध 2", name: "doodh", qty: 2, legible: true },
      { raw: "chips", name: "chips", qty: 99, legible: false },
      { raw: "salt", name: "namak", qty: 1, legible: true },
    ]);
  });

  it("rejects malformed output instead of guessing", () => {
    expect(() => cleanItems({ lines: [] })).toThrow(/unexpected format/);
    expect(() => cleanItems({ items: [{ raw: "a", name: "a", qty: "two", legible: true }] })).toThrow();
  });

  it("uses a strict schema with every field required", () => {
    const item = EXTRACTION_JSON_SCHEMA.properties.items.items;
    expect(item.required).toEqual(["raw", "name", "qty", "legible"]);
    expect(item.additionalProperties).toBe(false);
  });
});

describe("OpenAiExtractor (fake client, no network)", () => {
  const fakeClient = (outputText: string, seen: Array<Record<string, unknown>>) =>
    ({ responses: { create: async (req: Record<string, unknown>) => { seen.push(req); return { output_text: outputText }; } } }) as unknown as OpenAI;

  it("sends the photo as a data URL with a strict json_schema and parses the list", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const ex = new OpenAiExtractor("test-model", "sk-test", fakeClient(JSON.stringify({ items: [{ raw: "biskut 3", name: "biskut", qty: 3, legible: true }] }), seen));
    const items = await ex.fromImage({ base64: "AAAA", mime: "image/jpeg" });
    expect(items).toEqual([{ raw: "biskut 3", name: "biskut", qty: 3, legible: true }]);
    const req = seen[0] as { model: string; text: { format: { type: string; strict: boolean } }; input: Array<{ content: Array<{ type: string; image_url?: string }> }> };
    expect(req.model).toBe("test-model");
    expect(req.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(req.input[0].content.find((c) => c.type === "input_image")?.image_url).toBe("data:image/jpeg;base64,AAAA");
  });

  it("fails clearly when the model doesn't return JSON", async () => {
    const ex = new OpenAiExtractor("m", "k", fakeClient("sorry, I can't", []));
    await expect(ex.fromText("do doodh")).rejects.toThrow(/did not return JSON/);
  });

  it("is only configured with both key and model", () => {
    expect(openAiConfigured({ OPENAI_API_KEY: "k" })).toBe(false);
    expect(openAiConfigured({ OPENAI_API_KEY: "k", OPENAI_MODEL: "m" })).toBe(true);
  });
});

describe("Sarvam adapters (fake fetch, no network)", () => {
  const env = { SARVAM_API_KEY: "test-key" };

  it("sends audio with the subscription header and returns the transcript", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => { captured = { url, init }; return Response.json({ transcript: " do doodh ", language_code: "hi-IN" }); }) as unknown as typeof fetch;
    const r = await speechToText(new Blob(["x"], { type: "audio/webm" }), "a.webm", env, fake);
    expect(r).toEqual({ transcript: "do doodh", languageCode: "hi-IN" });
    expect(captured!.url).toBe("https://api.sarvam.ai/speech-to-text");
    expect((captured!.init.headers as Record<string, string>)["api-subscription-key"]).toBe("test-key");
    const form = captured!.init.body as FormData;
    expect(form.get("model")).toBe("saaras:v4");
    expect(form.get("language_code")).toBe("hi-IN");
  });

  it("returns base64 audio from TTS and surfaces API errors", async () => {
    const ok = (async () => Response.json({ audios: ["QUJD"] })) as unknown as typeof fetch;
    expect(await textToSpeech("129 रुपये प्राप्त हुए", env, ok)).toEqual({ base64: "QUJD", mime: "audio/mpeg" });
    const bad = (async () => Response.json({ error: { message: "bad key" } }, { status: 403 })) as unknown as typeof fetch;
    await expect(textToSpeech("x", env, bad)).rejects.toThrow(/\(403\): bad key/);
  });

  it("is off without a key", () => {
    expect(sarvamConfigured({})).toBe(false);
  });
});

describe("spoken/Devanagari list parsing (fallback when AI is not set up)", () => {
  it("reads Hindi number words, Devanagari digits and 'और'", () => {
    expect(parseItemList("दो दूध और एक ब्रेड, बिस्कुट ३")).toEqual([
      { text: "दूध", qty: 2 }, { text: "ब्रेड", qty: 1 }, { text: "बिस्कुट", qty: 3 },
    ]);
  });
});

describe("voice provider choice", () => {
  it("prefers Sarvam, falls back to OpenAI, and honours VOICE_PROVIDER", async () => {
    const { getVoiceProvider, voiceConfigured } = await import("@/lib/ai/voice");
    expect(getVoiceProvider({})).toBeNull();
    expect(voiceConfigured({})).toBe(false);
    expect(getVoiceProvider({ OPENAI_API_KEY: "sk-test" })?.name).toBe("openai");
    expect(getVoiceProvider({ SARVAM_API_KEY: "s", OPENAI_API_KEY: "sk-test" })?.name).toBe("sarvam");
    expect(getVoiceProvider({ VOICE_PROVIDER: "openai", SARVAM_API_KEY: "s", OPENAI_API_KEY: "sk-test" })?.name).toBe("openai");
    // A forced provider without its key means no voice, never a silent switch.
    expect(getVoiceProvider({ VOICE_PROVIDER: "sarvam", OPENAI_API_KEY: "sk-test" })).toBeNull();
    expect(getVoiceProvider({ OPENAI_API_KEY: "sk-test", OPENAI_STT_MODEL: "whisper-1" })?.label).toContain("whisper-1");
  });

  it("OpenAI voice sends the shop prompt and returns base64 mp3", async () => {
    const { openAiVoice, STT_PROMPT } = await import("@/lib/ai/voice");
    const calls: Record<string, unknown>[] = [];
    const fake = {
      audio: {
        transcriptions: { create: async (p: Record<string, unknown>) => { calls.push(p); return { text: " do doodh \n" }; } },
        speech: { create: async (p: Record<string, unknown>) => { calls.push(p); return { arrayBuffer: async () => new TextEncoder().encode("mp3").buffer }; } },
      },
    } as unknown as import("openai").default;
    const v = openAiVoice({}, fake);
    expect(await v.transcribe(new Blob(["x"], { type: "audio/webm" }), "speech.webm")).toEqual({ transcript: "do doodh", languageCode: null });
    expect(calls[0]).toMatchObject({ model: "gpt-4o-mini-transcribe", prompt: STT_PROMPT });
    expect(await v.speak("ठीक है")).toEqual({ base64: Buffer.from("mp3").toString("base64"), mime: "audio/mpeg" });
    expect(calls[1]).toMatchObject({ model: "gpt-4o-mini-tts", input: "ठीक है", response_format: "mp3" });
  });
});

describe("prepareSpeech", () => {
  it("makes digits easy to say without changing them", async () => {
    const { prepareSpeech } = await import("@/lib/ai/voice");
    expect(prepareSpeech("आज ₹2,205 का सेल, 15% कम")).toBe("आज 2205 रुपये का सेल, 15 प्रतिशत कम");
    expect(prepareSpeech("Rs. 1,20,000 बाकी")).toBe("120000 रुपये बाकी");
    expect(prepareSpeech("Toned milk 500ml   शाम 4:58")).toBe("Toned milk 500 ml शाम 4:58");
  });
});

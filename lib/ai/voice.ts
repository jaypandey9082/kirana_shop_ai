/**
 * One voice adapter for speech-to-text and text-to-speech, so providers can be swapped.
 * Choice: VOICE_PROVIDER=sarvam|openai forces one; otherwise Sarvam when SARVAM_API_KEY is set,
 * else OpenAI when OPENAI_API_KEY is set, else none (typing + device voice).
 * Software voice only (not Soundbox hardware).
 */
import OpenAI, { toFile } from "openai";
import { sarvamConfigured, speechToText as sarvamStt, textToSpeech as sarvamTts } from "./sarvam";

type Env = Record<string, string | undefined>;
export interface Transcript { transcript: string; languageCode: string | null }
export interface SpeechAudio { base64: string; mime: string }
export interface SpeechStream { body: ReadableStream<Uint8Array>; mime: string }
export interface VoiceProvider {
  name: "sarvam" | "openai";
  /** Shown in /api/ready, e.g. "OpenAI gpt-4o-mini-transcribe + gpt-4o-mini-tts". */
  label: string;
  transcribe(audio: Blob, filename: string): Promise<Transcript>;
  speak(text: string): Promise<SpeechAudio>;
  /** Audio as it is generated, so playback can start before the whole clip exists. */
  stream(text: string): Promise<SpeechStream>;
}

/** Steers transcription towards shop words and Hinglish (Roman script), which the catalogue matcher reads best. */
export const STT_PROMPT =
  "Kirana dukaan, Mumbai. Hinglish mein likhiye (Roman script). Jaise: do doodh, ek bread, teen biskut, namak, atta, " +
  "dahi, anda, chai patti. Aaj kitna sale hua? Kya khatam hone wala hai? Kiska paisa baaki hai? Haan, bhej do. Abhi nahi.";
const TTS_INSTRUCTIONS = [
  "Voice: a friendly, confident assistant at a neighbourhood kirana shop in Mumbai.",
  "Language: natural everyday spoken Hindi (Hindustani), the way people talk at a shop counter, not formal or news-reader Hindi.",
  "English words (milk, bread, reorder, draft, approve) are said with a normal Indian English accent.",
  "If the text is Hindi written in English letters (Hinglish), pronounce it as Hindi, not as English.",
  "Pace: brisk and clear. Tone: warm and helpful. Short pauses only at commas and full stops. Read money as rupees.",
].join(" ");

/**
 * Make digits easy to say without changing them (the number guard reads the same digits):
 * "₹2,205" → "2205 रुपये", "15%" → "15 प्रतिशत", "500ml" → "500 ml".
 */
export function prepareSpeech(text: string): string {
  return text
    .replace(/(?:₹|Rs\.?\s?)\s*([\d,]+(?:\.\d+)?)/g, (_, n: string) => `${n.replace(/,/g, "")} रुपये`)
    .replace(/(\d),(?=\d{2,3}\b)/g, "$1")
    .replace(/(\d+(?:\.\d+)?)\s?%/g, "$1 प्रतिशत")
    .replace(/(\d)(ml|g|kg|L)\b/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);
}

export function openAiVoice(env: Env = process.env, client?: OpenAI): VoiceProvider {
  const stt = env.OPENAI_STT_MODEL?.trim() || "gpt-4o-mini-transcribe";
  const tts = env.OPENAI_TTS_MODEL?.trim() || "gpt-4o-mini-tts";
  const voice = env.OPENAI_TTS_VOICE?.trim() || "marin";
  const api = client ?? new OpenAI({ apiKey: env.OPENAI_API_KEY?.trim(), timeout: 20_000, maxRetries: 1 });
  return {
    name: "openai",
    label: `OpenAI ${stt} + ${tts}`,
    async transcribe(audio, filename) {
      const file = await toFile(audio, filename, { type: audio.type || undefined });
      const res = await api.audio.transcriptions.create({ file, model: stt, prompt: STT_PROMPT });
      return { transcript: res.text.trim(), languageCode: null };
    },
    async speak(text) {
      const res = await api.audio.speech.create({ model: tts, voice, input: prepareSpeech(text), instructions: TTS_INSTRUCTIONS, response_format: "mp3" });
      return { base64: Buffer.from(await res.arrayBuffer()).toString("base64"), mime: "audio/mpeg" };
    },
    async stream(text) {
      const res = await api.audio.speech.create({ model: tts, voice, input: prepareSpeech(text), instructions: TTS_INSTRUCTIONS, response_format: "mp3" });
      if (!res.body) throw new Error("OpenAI TTS returned no audio stream.");
      return { body: res.body as ReadableStream<Uint8Array>, mime: "audio/mpeg" };
    },
  };
}

function sarvamVoice(env: Env): VoiceProvider {
  return {
    name: "sarvam",
    label: `Sarvam ${env.SARVAM_STT_MODEL?.trim() || "saaras:v4"} + ${env.SARVAM_TTS_MODEL?.trim() || "bulbul:v3"}`,
    transcribe: (audio, filename) => sarvamStt(audio, filename, env),
    speak: (text) => sarvamTts(prepareSpeech(text), env),
    async stream(text) {
      // Sarvam returns the whole clip at once; send it as a one-chunk stream.
      const { base64, mime } = await sarvamTts(prepareSpeech(text), env);
      const bytes = Buffer.from(base64, "base64");
      return { body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(bytes)); c.close(); } }), mime };
    },
  };
}

export function getVoiceProvider(env: Env = process.env): VoiceProvider | null {
  const forced = env.VOICE_PROVIDER?.trim().toLowerCase();
  const hasOpenAi = !!env.OPENAI_API_KEY?.trim();
  if (forced === "sarvam") return sarvamConfigured(env) ? sarvamVoice(env) : null;
  if (forced === "openai") return hasOpenAi ? openAiVoice(env) : null;
  if (sarvamConfigured(env)) return sarvamVoice(env);
  if (hasOpenAi) return openAiVoice(env);
  return null;
}

export function voiceConfigured(env: Env = process.env): boolean {
  return getVoiceProvider(env) !== null;
}

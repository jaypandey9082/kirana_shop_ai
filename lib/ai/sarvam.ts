/**
 * Sarvam speech adapters (docs reviewed 30 Sep 2026):
 *   STT  POST https://api.sarvam.ai/speech-to-text  (multipart: file, model, language_code[, mode])
 *   TTS  POST https://api.sarvam.ai/text-to-speech  (json: text, language_code, model, speaker, …) → { audios: [base64] }
 * Header: api-subscription-key. Not yet tested with a real key.
 */
const BASE = "https://api.sarvam.ai";

export function sarvamConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.SARVAM_API_KEY?.trim();
}

function key(env: Record<string, string | undefined>) {
  const k = env.SARVAM_API_KEY?.trim();
  if (!k) throw new Error("SARVAM_API_KEY is not set.");
  return k;
}

export async function speechToText(audio: Blob, filename: string, env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<{ transcript: string; languageCode: string | null }> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", env.SARVAM_STT_MODEL?.trim() || "saaras:v4");
  form.append("language_code", env.SARVAM_STT_LANGUAGE?.trim() || "hi-IN");
  if (env.SARVAM_STT_MODE?.trim()) form.append("mode", env.SARVAM_STT_MODE.trim());
  const res = await fetchImpl(`${BASE}/speech-to-text`, {
    method: "POST", headers: { "api-subscription-key": key(env) }, body: form, signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { transcript?: unknown; language_code?: unknown; error?: { message?: string } };
  if (!res.ok) throw new Error(`Sarvam STT failed (${res.status})${data.error?.message ? `: ${data.error.message}` : ""}`);
  if (typeof data.transcript !== "string") throw new Error("Sarvam STT returned no transcript.");
  return { transcript: data.transcript.trim(), languageCode: typeof data.language_code === "string" ? data.language_code : null };
}

export async function textToSpeech(text: string, env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<{ base64: string; mime: string }> {
  const codec = "mp3";
  const res = await fetchImpl(`${BASE}/text-to-speech`, {
    method: "POST",
    headers: { "api-subscription-key": key(env), "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.slice(0, 1500),
      language_code: "hi-IN",
      model: env.SARVAM_TTS_MODEL?.trim() || "bulbul:v3",
      speaker: env.SARVAM_TTS_SPEAKER?.trim() || "shubh",
      output_audio_codec: codec,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { audios?: unknown; error?: { message?: string } };
  if (!res.ok) throw new Error(`Sarvam TTS failed (${res.status})${data.error?.message ? `: ${data.error.message}` : ""}`);
  const first = Array.isArray(data.audios) ? data.audios[0] : null;
  if (typeof first !== "string" || !first) throw new Error("Sarvam TTS returned no audio.");
  return { base64: first, mime: "audio/mpeg" };
}

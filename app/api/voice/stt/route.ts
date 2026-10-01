import { DomainError } from "@/lib/bills";
import { sarvamConfigured, speechToText } from "@/lib/ai/sarvam";
import { handle, ok } from "@/lib/api";

const MAX_BYTES = 5 * 1024 * 1024;

/** POST /api/voice/stt — multipart `audio` (≤ 25 s recording) → transcript. Nothing is added to a bill here. */
export async function POST(request: Request) {
  return handle(async () => {
    if (!sarvamConfigured()) throw new DomainError("CONFLICT", "Voice is not set up (SARVAM_API_KEY). Type karke poochiye.");
    const form = await request.formData().catch(() => null);
    const file = form?.get("audio");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("INVALID", "Attach the recording as `audio`.");
    if (file.size > MAX_BYTES) throw new DomainError("INVALID", "Recording is too long.");
    try {
      return ok(await speechToText(file, file.name || "speech.webm"));
    } catch (error) {
      console.error("stt failed", error);
      throw new DomainError("CONFLICT", "Awaaz samajh nahi aayi. Dobara bolein ya type karein.");
    }
  });
}

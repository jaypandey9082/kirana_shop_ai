import { DomainError } from "@/lib/bills";
import { getVoiceProvider } from "@/lib/ai/voice";
import { handle, ok } from "@/lib/api";

const MAX_BYTES = 5 * 1024 * 1024;

/** POST /api/voice/stt — multipart `audio` (≤ 25 s recording) → transcript. Nothing is added to a bill here. */
export async function POST(request: Request) {
  return handle(async () => {
    const voice = getVoiceProvider();
    if (!voice) throw new DomainError("CONFLICT", "Voice is not set up. Type karke poochiye.");
    const form = await request.formData().catch(() => null);
    const file = form?.get("audio");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("INVALID", "Attach the recording as `audio`.");
    if (file.size > MAX_BYTES) throw new DomainError("INVALID", "Recording is too long.");
    try {
      return ok({ ...(await voice.transcribe(file, file.name || "speech.webm")), provider: voice.name });
    } catch (error) {
      console.error(`stt failed (${voice.name})`, error);
      throw new DomainError("CONFLICT", "Awaaz samajh nahi aayi. Dobara bolein ya type karein.");
    }
  });
}

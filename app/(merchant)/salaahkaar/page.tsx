import { SalaahkaarScreen } from "@/components/kirana/salaahkaar";
import { openAiConfigured } from "@/lib/ai/extract";
import { voiceConfigured } from "@/lib/ai/voice";

export default function Page() {
  return <SalaahkaarScreen aiMode={openAiConfigured() ? "ai" : "offline"} voiceEnabled={voiceConfigured()} />;
}

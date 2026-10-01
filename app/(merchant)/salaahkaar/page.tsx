import { SalaahkaarScreen } from "@/components/kirana/salaahkaar";
import { openAiConfigured } from "@/lib/ai/extract";
import { sarvamConfigured } from "@/lib/ai/sarvam";

export default function Page() {
  return <SalaahkaarScreen aiMode={openAiConfigured() ? "ai" : "offline"} voiceEnabled={sarvamConfigured()} />;
}

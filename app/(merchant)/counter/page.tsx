import { CounterScreen } from "@/components/kirana/counter";
import { ErrorBanner } from "@/components/ui/primitives";
import { getSql } from "@/lib/db/client";
import { getMerchantId, listCatalogue, type CatalogueProduct } from "@/lib/bills";
import { getPaymentMode } from "@/lib/payments/service";
import { openAiConfigured } from "@/lib/ai/extract";
import { voiceConfigured } from "@/lib/ai/voice";
import { salesSummary } from "@/lib/insights";

export default async function Page() {
  let catalogue: CatalogueProduct[];
  let today: { totalPaise: number; bills: number; source: string } | null = null;
  try {
    const sql = getSql();
    const merchantId = await getMerchantId(sql);
    catalogue = await listCatalogue(sql, merchantId);
    today = await salesSummary(sql, merchantId, "today").catch(() => null);
  } catch (error) {
    console.error(error);
    return <><h1>Counter</h1><div className="mt-4"><ErrorBanner message="Catalogue load nahi hua. Check DATABASE_URL and run npm run db:reset." /></div></>;
  }
  const mode = getPaymentMode();
  const ai = {
    parchi: openAiConfigured(),
    voice: voiceConfigured(),
    parchiLabel: openAiConfigured() ? `OpenAI ${process.env.OPENAI_MODEL!.trim()}` : null,
  };
  return <CounterScreen catalogue={catalogue} onlineMode={mode === "misconfigured" ? "live-off" : mode} ai={ai} today={today && { totalPaise: today.totalPaise, bills: today.bills, source: today.source }} />;
}

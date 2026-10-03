import { CounterScreen } from "@/components/kirana/counter";
import { ErrorBanner } from "@/components/ui/primitives";
import { getSql } from "@/lib/db/client";
import { getMerchantId, listCatalogue, type CatalogueProduct } from "@/lib/bills";
import { getPaymentMode } from "@/lib/payments/service";
import { openAiConfigured } from "@/lib/ai/extract";
import { voiceConfigured } from "@/lib/ai/voice";
import { lowStock, salesSummary } from "@/lib/insights";
import { khataOverview } from "@/lib/khata";
import type { DayGlance } from "@/components/kirana/counter";

export default async function Page() {
  let catalogue: CatalogueProduct[];
  let glance: DayGlance | null = null;
  try {
    const sql = getSql();
    const merchantId = await getMerchantId(sql);
    catalogue = await listCatalogue(sql, merchantId);
    glance = await Promise.all([salesSummary(sql, merchantId, "today"), lowStock(sql, merchantId), khataOverview(sql, merchantId)])
      .then(([sales, low, khata]): DayGlance => {
        const urgent = [...low.items].sort((a, b) => a.stock / a.reorderLevel - b.stock / b.reorderLevel)[0];
        return {
          sales: { totalPaise: sales.totalPaise, bills: sales.bills, changePct: sales.changePct },
          low: { count: low.items.length, top: urgent ? { name: urgent.name, stock: urgent.stock } : null },
          udhaar: { totalPaise: khata.totalPaise, overduePaise: khata.buckets["30+"] },
          source: "bill register · stock register · Khata ledger",
        };
      })
      .catch(() => null);
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
  return <CounterScreen catalogue={catalogue} onlineMode={mode === "misconfigured" ? "live-off" : mode} ai={ai} glance={glance} />;
}

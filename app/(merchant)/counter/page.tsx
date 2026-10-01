import { CounterScreen } from "@/components/kirana/counter";
import { ErrorBanner } from "@/components/ui/primitives";
import { getSql } from "@/lib/db/client";
import { getMerchantId, listCatalogue, type CatalogueProduct } from "@/lib/bills";
import { getPaymentMode } from "@/lib/payments/service";

export default async function Page() {
  let catalogue: CatalogueProduct[];
  try {
    const sql = getSql();
    catalogue = await listCatalogue(sql, await getMerchantId(sql));
  } catch (error) {
    console.error(error);
    return <><h1>Counter</h1><div className="mt-6"><ErrorBanner message="Catalogue load nahi hua. Check DATABASE_URL and run npm run db:reset." /></div></>;
  }
  const mode = getPaymentMode();
  return <CounterScreen catalogue={catalogue} onlineMode={mode === "misconfigured" ? "live-off" : mode} />;
}

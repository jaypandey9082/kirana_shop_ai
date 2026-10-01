import { notFound } from "next/navigation";
import { getSql } from "@/lib/db/client";
import { getStore, storeCatalogue } from "@/lib/orders";
import { getPaymentMode } from "@/lib/payments/service";
import { Storefront } from "@/components/shop/storefront";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/s/[shop]">) {
  const store = await getStore(getSql(), (await props.params).shop);
  return { title: store ? `${store.name} · Order online` : "Store" };
}

export default async function Page(props: PageProps<"/s/[shop]">) {
  const sql = getSql();
  const store = await getStore(sql, (await props.params).shop);
  if (!store) notFound();
  const mode = getPaymentMode();
  return <Storefront store={store} products={await storeCatalogue(sql, store.id)} paymentLabel={mode === "staging" ? "Paytm (staging)" : mode === "mock" ? "mock payment" : "payment unavailable"} />;
}

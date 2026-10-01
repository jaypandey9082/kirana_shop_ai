import { notFound } from "next/navigation";
import { getSql } from "@/lib/db/client";
import { getOrder, getStore } from "@/lib/orders";
import { OrderStatus } from "@/components/shop/order-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order status", robots: { index: false } };

export default async function Page(props: PageProps<"/s/[shop]/order/[id]">) {
  const { shop, id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sql = getSql();
  const store = await getStore(sql, shop);
  if (!store) notFound();
  const order = await getOrder(sql, id).catch(() => null);
  if (!order) notFound();
  return <OrderStatus initial={order} shopName={store.name} />;
}

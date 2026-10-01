import { notFound } from "next/navigation";
import { getSql } from "@/lib/db/client";
import { getCustomerCheckout, getPaymentMode } from "@/lib/payments/service";
import { CustomerPay } from "@/components/kirana/pay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay · Sharma General Store", robots: { index: false } };

export default async function Page(props: PageProps<"/pay/[orderId]">) {
  const { orderId } = await props.params;
  if (!/^[A-Za-z0-9-]{6,50}$/.test(orderId)) notFound();
  const checkout = await getCustomerCheckout(getSql(), orderId);
  if (!checkout) notFound();
  return <CustomerPay checkout={checkout} mockEnabled={getPaymentMode() === "mock"} />;
}

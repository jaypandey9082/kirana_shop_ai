import { OrdersScreen } from "@/components/kirana/orders";
import { DEMO_MERCHANT_SLUG } from "@/lib/demo/generate";

export default function Page() {
  return <OrdersScreen shopSlug={process.env.DEMO_MERCHANT_SLUG || DEMO_MERCHANT_SLUG} shopName="Sharma General Store" />;
}

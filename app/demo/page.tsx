import { Presenter } from "@/components/kirana/presenter";
import { DEMO_MERCHANT_SLUG } from "@/lib/demo/generate";

export const metadata = { title: "Demo · Kirana Shop AI", robots: { index: false } };

/** Projector view: customer phone, merchant phone and live log side by side. */
export default function Page() {
  return <Presenter shopSlug={process.env.DEMO_MERCHANT_SLUG || DEMO_MERCHANT_SLUG} />;
}

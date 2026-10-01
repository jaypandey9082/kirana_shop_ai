import { MerchantShell } from "@/components/kirana/shell";
import { shellFixture } from "@/lib/ui-fixtures";
import { getPaymentMode } from "@/lib/payments/service";
export const dynamic = "force-dynamic";
export default function Layout({ children }: { children: React.ReactNode }) {
  const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date());
  const mode = getPaymentMode();
  const paymentMode = mode === "staging" ? "staging" : mode === "mock" ? "mock" : "live-off";
  return <MerchantShell fixture={{ ...shellFixture, paymentMode }} date={date}>{children}</MerchantShell>;
}

/** Payment gateway adapter contract. Paytm (staging) and the mock gateway both implement it. */
export type GatewayStatus = "SUCCESS" | "PENDING" | "FAILED" | "NOT_FOUND";

export interface GatewayVerification {
  status: GatewayStatus;
  orderId: string | null;
  amountPaise: number | null;
  txnId: string | null;
  raw: unknown;
}

export interface CheckoutInfo {
  provider: "paytm" | "mock";
  orderId: string;
  amountPaise: number;
  /** Present for Paytm JS Checkout. */
  paytm?: { mid: string; txnToken: string; scriptUrl: string };
}

export interface PaymentProvider {
  readonly name: "paytm" | "mock";
  /** Shown in the UI and the event log, e.g. "Paytm staging" or "Mock payment". */
  readonly label: string;
  createOrder(input: { orderId: string; amountPaise: number; customerRef: string; callbackUrl: string }): Promise<CheckoutInfo>;
  /** Server-side status check. The only thing that can make a payment SUCCESS. */
  verify(orderId: string): Promise<GatewayVerification>;
}

/** "174.00" -> 17400. Returns null for anything that isn't a plain rupee amount. */
export function rupeesToPaise(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const s = String(value).trim();
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

/** 17400 -> "174.00" without floating-point rounding. */
export function paiseToRupees(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new TypeError("paise must be a non-negative integer");
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

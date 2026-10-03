/**
 * Paytm Payment Gateway (staging) adapter.
 * Docs (reviewed 30 Sep 2026): Initiate Transaction, JS Checkout, Callback/Webhook,
 * Transaction Status (v3). Hosts are configurable because Paytm's docs list different
 * staging hosts for initiate and status calls; confirm both with real credentials.
 * Checked against Paytm staging on 3 Oct 2026: signing and status host work (initiate pending
 * merchant activation, resultCode 239).
 */
import PaytmChecksum from "paytmchecksum";
import { paiseToRupees, rupeesToPaise, type GatewayVerification, type PaymentProvider } from "./types";

export interface PaytmConfig {
  mid: string;
  key: string;
  website: string;
  host: string;        // initiate + JS checkout host
  statusHost: string;  // transaction status host
  scriptUrl?: string;
}

export function paytmConfigFromEnv(env: Record<string, string | undefined> = process.env): PaytmConfig | null {
  const mid = env.PAYTM_MID?.trim();
  const key = env.PAYTM_MERCHANT_KEY?.trim();
  if (!mid || !key) return null;
  return {
    mid, key,
    website: env.PAYTM_WEBSITE?.trim() || "WEBSTAGING",
    host: env.PAYTM_HOST?.trim() || "https://securestage.paytmpayments.com",
    statusHost: env.PAYTM_STATUS_HOST?.trim() || "https://securestage.paytmpayments.com",
    scriptUrl: env.PAYTM_CHECKOUT_JS_URL?.trim() || undefined,
  };
}

/** Verify a callback/webhook CHECKSUMHASH over all other form fields. Never throws. */
export function verifyPaytmChecksum(fields: Record<string, string>, key: string): boolean {
  const checksum = fields.CHECKSUMHASH;
  if (!checksum) return false;
  const rest = Object.fromEntries(Object.entries(fields).filter(([k]) => k !== "CHECKSUMHASH"));
  try {
    return PaytmChecksum.verifySignature(rest, key, checksum) === true;
  } catch {
    return false;
  }
}

const STATUS_MAP: Record<string, GatewayVerification["status"]> = {
  TXN_SUCCESS: "SUCCESS", PENDING: "PENDING", TXN_FAILURE: "FAILED", NO_RECORD_FOUND: "NOT_FOUND",
};
/**
 * Paytm reports some non-answers as TXN_FAILURE. They must not fail an order:
 * 334 "Invalid Order Id" = no attempt yet (staging, checked 3 Oct 2026); 501 "System Error" = unknown, retry.
 */
const RESULT_CODE_OVERRIDES: Record<string, GatewayVerification["status"]> = { "334": "NOT_FOUND", "501": "PENDING" };

export class PaytmProvider implements PaymentProvider {
  readonly name = "paytm" as const;
  readonly label = "Paytm staging";
  constructor(private config: PaytmConfig, private fetchImpl: typeof fetch = fetch) {}

  private async post(url: string, body: Record<string, unknown>) {
    const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), this.config.key);
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, head: { signature } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Paytm responded ${res.status}`);
    return (await res.json()) as { body?: Record<string, unknown> };
  }

  async createOrder({ orderId, amountPaise, customerRef, callbackUrl }: { orderId: string; amountPaise: number; customerRef: string; callbackUrl: string }) {
    const { mid, website, host } = this.config;
    const json = await this.post(`${host}/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(mid)}&orderId=${encodeURIComponent(orderId)}`, {
      requestType: "Payment", mid, websiteName: website, orderId, callbackUrl,
      txnAmount: { value: paiseToRupees(amountPaise), currency: "INR" },
      userInfo: { custId: customerRef },
    });
    const result = json.body?.resultInfo as { resultStatus?: string; resultMsg?: string } | undefined;
    const txnToken = json.body?.txnToken;
    if (result?.resultStatus !== "S" || typeof txnToken !== "string") {
      throw new Error(`Paytm could not start the payment: ${result?.resultMsg ?? "unknown error"}`);
    }
    return {
      provider: this.name, orderId, amountPaise,
      paytm: { mid, txnToken, scriptUrl: this.config.scriptUrl ?? `${host}/merchantpgpui/checkoutjs/merchants/${mid}.js` },
    };
  }

  async verify(orderId: string): Promise<GatewayVerification> {
    const json = await this.post(`${this.config.statusHost}/v3/order/status`, { mid: this.config.mid, orderId });
    const body = json.body ?? {};
    const result = body.resultInfo as { resultStatus?: string; resultCode?: string } | undefined;
    return {
      status: RESULT_CODE_OVERRIDES[result?.resultCode ?? ""] ?? STATUS_MAP[result?.resultStatus ?? ""] ?? "PENDING",
      orderId: typeof body.orderId === "string" ? body.orderId : null,
      amountPaise: rupeesToPaise(body.txnAmount),
      txnId: typeof body.txnId === "string" ? body.txnId : null,
      raw: json,
    };
  }
}

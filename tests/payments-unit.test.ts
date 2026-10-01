import { describe, expect, it } from "vitest";
import PaytmChecksum from "paytmchecksum";
import { paiseToRupees, rupeesToPaise } from "@/lib/payments/types";
import { PaytmProvider, paytmConfigFromEnv, verifyPaytmChecksum } from "@/lib/payments/paytm";
import { getPaymentMode } from "@/lib/payments/service";

const KEY = "TESTKEY123456789"; // dummy 16-char key, not a real merchant key
const config = { mid: "TESTMID00000000000000", key: KEY, website: "WEBSTAGING", host: "https://stage.example", statusHost: "https://status.example" };

describe("amount conversion", () => {
  it("converts exactly without floating point", () => {
    expect(paiseToRupees(17400)).toBe("174.00");
    expect(paiseToRupees(12345)).toBe("123.45");
    expect(paiseToRupees(5)).toBe("0.05");
    expect(rupeesToPaise("174.00")).toBe(17400);
    expect(rupeesToPaise("0.1")).toBe(10);
    expect(rupeesToPaise("1e3")).toBeNull();
    expect(rupeesToPaise("-1")).toBeNull();
    expect(rupeesToPaise(undefined)).toBeNull();
  });
});

describe("Paytm checksum", () => {
  it("accepts a correctly signed callback and rejects tampered or unsigned ones", async () => {
    const fields = { ORDERID: "KSA-1-ABC", TXNAMOUNT: "174.00", STATUS: "TXN_SUCCESS", TXNID: "T1" };
    const CHECKSUMHASH = await PaytmChecksum.generateSignature({ ...fields }, KEY);
    expect(verifyPaytmChecksum({ ...fields, CHECKSUMHASH }, KEY)).toBe(true);
    expect(verifyPaytmChecksum({ ...fields, TXNAMOUNT: "1.00", CHECKSUMHASH }, KEY)).toBe(false);
    expect(verifyPaytmChecksum({ ...fields, CHECKSUMHASH }, "OTHERKEY12345678")).toBe(false);
    expect(verifyPaytmChecksum({ ...fields }, KEY)).toBe(false);
    expect(verifyPaytmChecksum({ ...fields, CHECKSUMHASH: "garbage" }, KEY)).toBe(false);
  });
});

describe("Paytm provider (no network)", () => {
  it("starts a transaction with a signed body and returns the txn token", async () => {
    let sent: { url: string; body: { body: Record<string, unknown>; head: { signature: string } } } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)) };
      return Response.json({ body: { resultInfo: { resultStatus: "S" }, txnToken: "TOKEN123" } });
    }) as unknown as typeof fetch;
    const p = new PaytmProvider(config, fakeFetch);
    const r = await p.createOrder({ orderId: "KSA-1-ABC", amountPaise: 17400, customerRef: "BILL1", callbackUrl: "https://app/cb" });
    expect(r.paytm?.txnToken).toBe("TOKEN123");
    expect(r.paytm?.scriptUrl).toBe("https://stage.example/merchantpgpui/checkoutjs/merchants/TESTMID00000000000000.js");
    expect(sent!.url).toContain("/theia/api/v1/initiateTransaction?mid=TESTMID00000000000000&orderId=KSA-1-ABC");
    expect(sent!.body.body.txnAmount).toEqual({ value: "174.00", currency: "INR" });
    expect(sent!.body.body.websiteName).toBe("WEBSTAGING");
    expect(PaytmChecksum.verifySignature(JSON.stringify(sent!.body.body), KEY, sent!.body.head.signature)).toBe(true);
  });

  it("maps transaction status responses", async () => {
    const respond = (body: unknown) => (async () => Response.json({ body })) as unknown as typeof fetch;
    const ok = await new PaytmProvider(config, respond({ resultInfo: { resultStatus: "TXN_SUCCESS" }, orderId: "O1", txnAmount: "174.00", txnId: "T9" })).verify("O1");
    expect(ok).toMatchObject({ status: "SUCCESS", orderId: "O1", amountPaise: 17400, txnId: "T9" });
    expect((await new PaytmProvider(config, respond({ resultInfo: { resultStatus: "TXN_FAILURE" } })).verify("O1")).status).toBe("FAILED");
    expect((await new PaytmProvider(config, respond({ resultInfo: { resultStatus: "NO_RECORD_FOUND" } })).verify("O1")).status).toBe("NOT_FOUND");
    expect((await new PaytmProvider(config, respond({ resultInfo: { resultStatus: "SOMETHING_NEW" } })).verify("O1")).status).toBe("PENDING");
  });

  it("refuses to start when Paytm says no", async () => {
    const fakeFetch = (async () => Response.json({ body: { resultInfo: { resultStatus: "F", resultMsg: "Invalid MID" } } })) as unknown as typeof fetch;
    await expect(new PaytmProvider(config, fakeFetch).createOrder({ orderId: "O", amountPaise: 100, customerRef: "C", callbackUrl: "u" })).rejects.toThrow(/Invalid MID/);
  });
});

describe("payment mode", () => {
  it("is mock by default, staging only with credentials, never silently mock when Paytm is chosen", () => {
    expect(getPaymentMode({})).toBe("mock");
    expect(getPaymentMode({ PAYMENT_PROVIDER: "paytm" })).toBe("misconfigured");
    expect(getPaymentMode({ PAYMENT_PROVIDER: "paytm", PAYTM_MID: "M", PAYTM_MERCHANT_KEY: KEY })).toBe("staging");
    expect(paytmConfigFromEnv({ PAYTM_MID: "M", PAYTM_MERCHANT_KEY: KEY })?.website).toBe("WEBSTAGING");
  });
});

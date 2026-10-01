"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, ShieldCheck, XCircle } from "lucide-react";
import { Button, ErrorBanner } from "@/components/ui/primitives";
import { MoneyText } from "./components";
import { paiseToRupees } from "@/lib/payments/types";

interface Checkout {
  orderId: string; provider: "paytm" | "mock"; status: string; amountPaise: number; billNumber: number; shop: string;
  items: Array<{ name: string; qty: number; totalPaise: number }>;
  paytm: { mid: string; txnToken: string; scriptUrl: string } | null;
}
type View = "ready" | "verifying" | "paid" | "failed";

declare global {
  interface Window {
    Paytm?: { CheckoutJS: { onLoad(cb: () => void): void; init(config: unknown): Promise<void>; invoke(): void; close(): void } };
  }
}

const viewFor = (status: string): View => (status === "SUCCESS" ? "paid" : status === "FAILED" ? "failed" : "ready");

/** The customer's screen. It can start a payment, but only our server can say it succeeded. */
export function CustomerPay({ checkout, mockEnabled }: { checkout: Checkout; mockEnabled: boolean }) {
  const [view, setView] = useState<View>(viewFor(checkout.status));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const poll = useCallback(async () => {
    setView("verifying");
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`/api/payments/${checkout.orderId}`);
        const { payment } = await res.json();
        if (payment?.status === "SUCCESS") return setView("paid");
        if (payment?.status === "FAILED") return setView("failed");
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 2000));
    }
    setView("ready");
    setError("Payment status abhi confirm nahi hua. Shopkeeper se check karein.");
  }, [checkout.orderId]);

  // Coming back from Paytm's callback redirect: verify immediately.
  useEffect(() => {
    if (checkout.status !== "PENDING") return;
    const t = setTimeout(() => void poll(), 0);
    return () => clearTimeout(t);
  }, [checkout.status, poll]);

  const payMock = (outcome: "success" | "failure") => start(async () => {
    setError(null);
    const res = await fetch(`/api/payments/mock/${checkout.orderId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome }) });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not complete the mock payment."); return; }
    await poll();
  });

  const payPaytm = () => start(async () => {
    setError(null);
    const p = checkout.paytm;
    if (!p) { setError("Paytm checkout is not available for this order."); return; }
    try {
      await new Promise<void>((resolve, reject) => {
        if (window.Paytm?.CheckoutJS) return resolve();
        const s = document.createElement("script");
        s.src = p.scriptUrl; s.crossOrigin = "anonymous"; s.onload = () => resolve(); s.onerror = () => reject(new Error("Paytm checkout could not load."));
        document.body.appendChild(s);
      });
      window.Paytm!.CheckoutJS.onLoad(async () => {
        await window.Paytm!.CheckoutJS.init({
          root: "", flow: "DEFAULT",
          data: { orderId: checkout.orderId, token: p.txnToken, tokenType: "TXN_TOKEN", amount: paiseToRupees(checkout.amountPaise) },
          handler: {
            notifyMerchant: () => {},
            // Paytm's browser-side status is not trusted; we ask our server instead.
            transactionStatus: () => { window.Paytm?.CheckoutJS.close(); void poll(); },
          },
        });
        window.Paytm!.CheckoutJS.invoke();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Paytm checkout failed to open.");
    }
  });

  const mock = checkout.provider === "mock";
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[420px] bg-canvas p-4 pb-10">
      <section className="rounded-xl bg-navy-950 p-5 text-surface">
        <p className="caption text-on-dark-muted">Bill #{checkout.billNumber}</p>
        <h1 className="mt-1 text-surface">{checkout.shop}</h1>
        <div className="mt-4"><MoneyText paise={checkout.amountPaise} size="display" /></div>
      </section>

      {mock && (
        <p className="mt-4 rounded-lg border border-warning-line bg-warning-tint p-3 text-sm font-semibold text-warning" role="note">
          MOCK PAYMENT · not a real Paytm transaction. No money moves.
        </p>
      )}

      <ul className="card mt-4 divide-y divide-line">
        {checkout.items.map((i) => (
          <li key={i.name} className="flex justify-between gap-3 py-3 text-sm">
            <span>{i.name} <span className="text-muted tabular-nums">× {i.qty}</span></span>
            <MoneyText paise={i.totalPaise} size="sm" />
          </li>
        ))}
      </ul>

      <div className="mt-6" aria-live="polite">
        {view === "paid" && (
          <div className="card text-center">
            <CheckCircle2 className="mx-auto !h-10 !w-10 text-success" aria-hidden="true" />
            <h2 className="mt-3 text-lg">Payment received</h2>
            <p className="secondary mt-1">Confirmed by the shop&apos;s server{mock ? " (mock)" : ""}. Dhanyavaad!</p>
          </div>
        )}
        {view === "verifying" && (
          <div className="card flex items-center gap-3"><LoaderCircle className="spin text-blue-600" aria-hidden="true" /><p>Server se verify ho raha hai…</p></div>
        )}
        {view === "failed" && (
          <div className="card text-center">
            <XCircle className="mx-auto !h-10 !w-10 text-danger" aria-hidden="true" />
            <h2 className="mt-3 text-lg">Payment nahi hua</h2>
            <p className="secondary mt-1">No money was taken for this attempt. Ask the shopkeeper to try again.</p>
          </div>
        )}
        {view === "ready" && (mock ? (
          mockEnabled ? (
            <div className="space-y-2">
              <Button className="w-full" disabled={pending} onClick={() => payMock("success")}>Pay <MoneyText paise={checkout.amountPaise} size="sm" /> (mock)</Button>
              <Button variant="quiet" className="w-full" disabled={pending} onClick={() => payMock("failure")}>Simulate a failed payment</Button>
            </div>
          ) : <ErrorBanner message="Mock payments are turned off on this server." />
        ) : (
          <Button className="w-full" disabled={pending} onClick={payPaytm}>Pay with Paytm (staging)</Button>
        ))}
        {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
      </div>
      <p className="caption mt-6 flex items-start gap-2 text-muted"><ShieldCheck aria-hidden="true" />The shop marks this bill paid only after its server verifies the payment.</p>
    </main>
  );
}

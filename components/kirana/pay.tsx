"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, ChevronDown, LoaderCircle, ShieldCheck, XCircle } from "lucide-react";
import { Button, ErrorBanner } from "@/components/ui/primitives";
import { MoneyText } from "./components";
import { paiseToRupees } from "@/lib/payments/types";

interface Checkout {
  orderId: string; provider: "paytm" | "mock"; status: string; amountPaise: number; billNumber: number; shop: string; trackPath: string | null;
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
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col bg-canvas px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))]">
      <header className="flex items-center gap-3">
        <span className="avatar h-10 w-10 bg-navy-950 text-surface" aria-hidden="true">{checkout.shop.charAt(0)}</span>
        <div className="min-w-0 flex-1"><p className="truncate font-semibold text-navy-950">{checkout.shop}</p><p className="caption text-muted">Bill #{checkout.billNumber}</p></div>
        <span className={`badge ${mock ? "tone-warning" : "tone-staging"}`}>{mock ? "MOCK" : "PAYTM STAGING"}</span>
      </header>

      <section className="card mt-4 text-center" aria-live="polite">
        {view === "paid" ? (
          <div className="py-4">
            <span className="pop-in mx-auto grid h-16 w-16 place-items-center rounded-full bg-success-500 text-surface"><Check className="!h-8 !w-8 !stroke-[2.5]" aria-hidden="true" /></span>
            <h1 className="mt-4">Payment ho gaya</h1>
            <p className="mt-1 text-navy-950"><MoneyText paise={checkout.amountPaise} size="display" /></p>
            <p className="secondary mt-2">Dukaan ke server ne confirm kiya{mock ? " (mock · not real money)" : ""}. Dhanyavaad!</p>
          </div>
        ) : view === "failed" ? (
          <div className="py-4">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-danger-tint text-danger"><XCircle className="!h-8 !w-8" aria-hidden="true" /></span>
            <h1 className="mt-4">Payment nahi hua</h1>
            <p className="secondary mt-2">Is attempt mein koi paisa nahi kata. Dukaandaar se dobara try karne ko kahiye.</p>
          </div>
        ) : (
          <div className="py-2">
            <p className="secondary">{checkout.shop} ko pay karein</p>
            <p className="mt-1 text-navy-950"><MoneyText paise={checkout.amountPaise} size="display" /></p>
            {view === "verifying" && <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1.5 text-sm font-medium text-blue-700"><LoaderCircle className="spin !h-4 !w-4" aria-hidden="true" />Server se verify ho raha hai…</p>}
          </div>
        )}
      </section>

      {mock && view !== "paid" && (
        <p className="mt-3 rounded-2xl border border-warning-line bg-warning-tint p-3 text-sm font-medium text-warning" role="note">
          MOCK PAYMENT · not a real Paytm transaction. No money moves.
        </p>
      )}

      <details className="card mt-3 p-0" open={checkout.items.length <= 4}>
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-navy-950">
          {checkout.items.length} items<ChevronDown className="!h-4 !w-4 text-muted" aria-hidden="true" />
        </summary>
        <ul className="border-t border-line px-4">
          {checkout.items.map((i) => (
            <li key={i.name} className="flex justify-between gap-3 border-b border-line py-2.5 text-sm last:border-0">
              <span>{i.name} <span className="text-muted tabular-nums">× {i.qty}</span></span>
              <MoneyText paise={i.totalPaise} size="sm" />
            </li>
          ))}
        </ul>
      </details>

      <div className="mt-auto pt-6">
        {view === "paid" && checkout.trackPath && <a className="btn btn-primary w-full" href={checkout.trackPath}>Order track karein</a>}
        {view === "ready" && (mock ? (
          mockEnabled ? (
            <div className="space-y-2">
              <Button className="w-full" disabled={pending} onClick={() => payMock("success")}>{pending ? <LoaderCircle className="spin" aria-hidden="true" /> : null}Pay <MoneyText paise={checkout.amountPaise} size="sm" /> (mock)</Button>
              <Button variant="quiet" className="w-full" disabled={pending} onClick={() => payMock("failure")}>Simulate a failed payment</Button>
            </div>
          ) : <ErrorBanner message="Mock payments are turned off on this server." />
        ) : (
          <Button className="w-full" disabled={pending} onClick={payPaytm}>{pending ? <LoaderCircle className="spin" aria-hidden="true" /> : null}Pay with Paytm (staging)</Button>
        ))}
        {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
        <p className="caption mt-4 flex items-start justify-center gap-1.5 text-center text-muted"><ShieldCheck className="!h-4 !w-4" aria-hidden="true" />Bill tabhi paid hoga jab dukaan ka server payment verify karega.</p>
      </div>
    </main>
  );
}

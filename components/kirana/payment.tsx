"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import QRCode from "qrcode";
import { Banknote, BookUser, ExternalLink, QrCode, RotateCcw } from "lucide-react";
import { Button, ErrorBanner, Sheet } from "@/components/ui/primitives";
import { MoneyText, PaidToast, PaymentStatus, StockDelta, type PaymentState } from "./components";
import { formatMoney } from "@/lib/format-money";
import type { BillView } from "@/lib/bills";
import { speakHindi } from "./voice";

export type OnlineMode = "staging" | "mock" | "live-off";
interface Delta { productId: string; name: string; before: number; after: number; reorderLevel: number }
interface PaymentInfo { orderId: string; provider: "paytm" | "mock"; label: string; payPath: string; amountPaise: number }
interface StatusInfo { status: "CREATED" | "PENDING" | "SUCCESS" | "FAILED"; stock: Delta[]; rejectedReason: string | null }
type Done =
  | { kind: "online"; label: string; provider: "paytm" | "mock"; stock: Delta[]; at: string }
  | { kind: "cash"; stock: Delta[]; at: string }
  | { kind: "udhaar"; customer: string; balancePaise: number; stock: Delta[] };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed. Please try again.");
  return data as T;
}

const timeNow = () => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date());

/** Software voice confirmation of a verified amount (not Soundbox hardware). */
const announce = (paise: number) => speakHindi(`${Math.round(paise / 100)} रुपये प्राप्त हुए`);

export function PaymentPanel({ bill, onlineMode, onNewBill, onSettled }: { bill: BillView; onlineMode: OnlineMode; onNewBill: () => void; onSettled?: (label: string) => void }) {
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"cash" | "udhaar" | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>) => start(async () => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
  });

  const startOnline = () => run(async () => {
    const { payment: p } = await api<{ payment: PaymentInfo }>(`/api/bills/${bill.id}/pay`, { method: "POST", body: JSON.stringify({ method: "online" }) });
    setStatus(null);
    setPayment(p);
  });

  // Poll our server; the server asks the gateway. The browser never decides "paid".
  useEffect(() => {
    if (!payment || done) return;
    let stop = false;
    const tick = async () => {
      try {
        const { payment: s } = await api<{ payment: StatusInfo }>(`/api/payments/${payment.orderId}`);
        if (stop) return;
        setStatus(s);
        if (s.status === "SUCCESS") {
          void announce(bill.totalPaise);
          setDone({ kind: "online", label: payment.label, provider: payment.provider, stock: s.stock, at: timeNow() });
          return;
        }
        if (s.status === "FAILED") return;
      } catch { /* keep polling through brief network drops */ }
      if (!stop) timer = setTimeout(tick, 2000);
    };
    let timer = setTimeout(tick, 1200);
    return () => { stop = true; clearTimeout(timer); };
  }, [payment, done, bill.totalPaise]);

  useEffect(() => {
    if (done) onSettled?.(done.kind === "udhaar" ? "on udhaar" : "paid");
  }, [done, onSettled]);

  if (done) return <PaidView bill={bill} done={done} onNewBill={onNewBill} />;

  const stepState: PaymentState = !status || status.status === "CREATED" ? "waiting" : status.status === "PENDING" ? "verifying" : status.status === "SUCCESS" ? "paid" : "failed";

  return (
    <section aria-label="Payment" className="mt-4 space-y-4">
      {!payment ? (
        <div className="card">
          <p className="section-label">Payment kaise?</p>
          <div className="mt-3 grid gap-2">
            <Button className="w-full justify-start" disabled={pending || onlineMode === "live-off"} onClick={startOnline}>
              <QrCode aria-hidden="true" />{onlineMode === "staging" ? "Paytm se lein (staging)" : onlineMode === "mock" ? "Online · mock payment" : "Online payment off"}
            </Button>
            <Button variant="quiet" className="w-full justify-start" disabled={pending} onClick={() => setSheet("cash")}><Banknote aria-hidden="true" />Cash</Button>
            <Button variant="quiet" className="w-full justify-start" disabled={pending} onClick={() => setSheet("udhaar")}><BookUser aria-hidden="true" />Udhaar (Khata)</Button>
          </div>
          {onlineMode === "mock" && <p className="caption mt-3 rounded-sm bg-warning-tint p-2 text-warning">Mock payment · not a real Paytm transaction. Server verification still runs.</p>}
          {onlineMode === "live-off" && <p className="caption mt-3 text-muted">Paytm credentials are not set. Cash and udhaar still work.</p>}
        </div>
      ) : (
        <OnlineWait payment={payment} state={stepState} rejected={status?.rejectedReason ?? null} onRetry={startOnline} busy={pending} />
      )}
      {error && <ErrorBanner message={error} />}

      <Sheet title={`Cash ${formatMoney(bill.totalPaise)} mil gaya?`} open={sheet === "cash"} onClose={() => setSheet(null)}>
        <p className="secondary">Recorded by you, not verified by a gateway. Stock updates now.</p>
        <Button className="mt-4 w-full" disabled={pending} onClick={() => run(async () => {
          const r = await api<{ stock: Delta[] }>(`/api/bills/${bill.id}/pay`, { method: "POST", body: JSON.stringify({ method: "cash" }) });
          setSheet(null);
          void announce(bill.totalPaise);
          setDone({ kind: "cash", stock: r.stock, at: timeNow() });
        })}>Haan, cash mil gaya</Button>
      </Sheet>
      <UdhaarSheet open={sheet === "udhaar"} onClose={() => setSheet(null)} total={bill.totalPaise} busy={pending} onPick={(c) => run(async () => {
        const r = await api<{ stock: Delta[]; balancePaise: number }>(`/api/bills/${bill.id}/pay`, { method: "POST", body: JSON.stringify({ method: "udhaar", customerId: c.id }) });
        setSheet(null);
        setDone({ kind: "udhaar", customer: c.name, balancePaise: r.balancePaise, stock: r.stock });
      })} />
    </section>
  );
}

function OnlineWait({ payment, state, rejected, onRetry, busy }: { payment: PaymentInfo; state: PaymentState; rejected: string | null; onRetry: () => void; busy: boolean }) {
  const [svg, setSvg] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    const full = `${window.location.origin}${payment.payPath}`;
    QRCode.toString(full, { type: "svg", margin: 1, color: { dark: "#0B1F44", light: "#FFFFFF" } })
      .then((markup) => { setSvg(markup); setUrl(full); })
      .catch(() => setUrl(full));
  }, [payment.payPath]);
  const failed = state === "failed";
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2">
        <p className="section-label">{payment.label}</p>
        <span className={`badge ${payment.provider === "mock" ? "tone-warning" : "tone-staging"}`}>{payment.provider === "mock" ? "MOCK" : "PAYTM STAGING"}</span>
      </div>
      {!failed && (
        <>
          <div className="mx-auto mt-4 w-56 max-w-full rounded-lg border border-line p-2" aria-label="Payment QR code for the customer" role="img" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="secondary mt-3 text-center">Customer phone se scan karein</p>
          <a className="btn btn-secondary mt-3 w-full" href={url || payment.payPath} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Customer view kholiye</a>
        </>
      )}
      <div className="mt-4"><PaymentStatus state={state} orderId={payment.orderId} /></div>
      {failed && (
        <div className="mt-4 space-y-3">
          <p className="rounded-sm bg-danger-tint p-3 text-sm text-danger">{rejected ? `Rejected by server: ${rejected}.` : "Payment fail hua."} Bill abhi unpaid hai.</p>
          <Button className="w-full" disabled={busy} onClick={onRetry}><RotateCcw aria-hidden="true" />Dobara try karein</Button>
        </div>
      )}
    </div>
  );
}

function UdhaarSheet({ open, onClose, total, onPick, busy }: { open: boolean; onClose: () => void; total: number; onPick: (c: { id: string; name: string }) => void; busy: boolean }) {
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; balancePaise: number }> | null>(null);
  const loaded = useRef(false);
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    api<{ customers: Array<{ id: string; name: string; balancePaise: number }> }>("/api/customers").then((r) => setCustomers(r.customers)).catch(() => setCustomers([]));
  }, [open]);
  return (
    <Sheet title={`Udhaar · ${formatMoney(total)}`} open={open} onClose={onClose}>
      <p className="secondary mb-3">Kiske khate mein likhein? Stock updates now; this bill stays unpaid until settled.</p>
      {!customers ? <p className="secondary">Loading…</p> : (
        <ul className="max-h-[50dvh] divide-y divide-line overflow-y-auto">
          {customers.map((c) => (
            <li key={c.id}>
              <button type="button" disabled={busy} onClick={() => onPick(c)} className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left">
                <span className="font-medium">{c.name}</span>
                <span className="caption text-muted">Baaki <MoneyText paise={c.balancePaise} size="sm" /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function PaidView({ bill, done, onNewBill }: { bill: BillView; done: Done; onNewBill: () => void }) {
  return (
    <section className="mt-4 space-y-4" aria-live="polite">
      {done.kind === "udhaar" ? (
        <div className="rounded-xl bg-navy-950 p-4 text-surface">
          <p className="text-lg font-semibold">Udhaar mein likh diya</p>
          <p className="caption mt-1 text-on-dark-muted">{done.customer} ab {formatMoney(done.balancePaise)} dena hai · bill unpaid until settled</p>
        </div>
      ) : (
        <PaidToast amount={bill.totalPaise} time={done.at}
          note={done.kind === "cash" ? `Cash recorded by you · ${done.at}` : done.provider === "mock" ? `Mock payment verified by server · not real money · ${done.at}` : `Verified by server with Paytm staging · ${done.at}`} />
      )}
      {done.stock.length > 0 && (
        <div className="card space-y-2">
          <p className="section-label">Stock updated</p>
          {done.stock.map((s) => <StockDelta key={s.productId} name={s.name} before={s.before} after={s.after} reorderLevel={s.reorderLevel} />)}
        </div>
      )}
      <Button className="w-full" onClick={onNewBill}>Naya bill</Button>
    </section>
  );
}

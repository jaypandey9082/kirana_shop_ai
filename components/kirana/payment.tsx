"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import QRCode from "qrcode";
import { Banknote, BookUser, Check, ExternalLink, LoaderCircle, Plus, QrCode, RotateCcw, Search } from "lucide-react";
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
  const onlineOff = onlineMode === "live-off";

  return (
    <section aria-label="Payment" className="mt-5 space-y-4">
      {!payment ? (
        <div>
          <p className="section-label mb-2">Payment kaise?</p>
          <div className="grid grid-cols-3 gap-2">
            <PayOption primary icon={<QrCode aria-hidden="true" />} label="Online" sub={onlineMode === "staging" ? "Paytm staging" : onlineMode === "mock" ? "Mock" : "Off"} disabled={pending || onlineOff} onClick={startOnline} />
            <PayOption icon={<Banknote aria-hidden="true" />} label="Cash" sub="Haath mein" disabled={pending} onClick={() => setSheet("cash")} />
            <PayOption icon={<BookUser aria-hidden="true" />} label="Udhaar" sub="Khata mein" disabled={pending} onClick={() => setSheet("udhaar")} />
          </div>
          {onlineMode === "mock" && <p className="caption mt-3 rounded-xl bg-warning-tint p-3 text-warning">Mock payment · not a real Paytm transaction. Server verification still runs.</p>}
          {onlineOff && <p className="caption mt-3 text-muted">Paytm credentials are not set. Cash and udhaar still work.</p>}
        </div>
      ) : (
        <OnlineWait payment={payment} state={stepState} rejected={status?.rejectedReason ?? null} onRetry={startOnline} busy={pending} />
      )}
      {error && <ErrorBanner message={error} />}

      <Sheet title={`Cash ${formatMoney(bill.totalPaise)} mil gaya?`} open={sheet === "cash"} onClose={() => setSheet(null)}>
        <div className="rounded-2xl bg-canvas p-4 text-center">
          <Banknote className="mx-auto !h-8 !w-8 text-success" aria-hidden="true" />
          <p className="mt-2 text-2xl font-bold text-navy-950 tabular-nums">{formatMoney(bill.totalPaise)}</p>
          <p className="caption mt-1 text-muted">Aapke dwara recorded · gateway verified nahi. Stock abhi update hoga.</p>
        </div>
        <Button className="mt-4 w-full" disabled={pending} onClick={() => run(async () => {
          const r = await api<{ stock: Delta[] }>(`/api/bills/${bill.id}/pay`, { method: "POST", body: JSON.stringify({ method: "cash" }) });
          setSheet(null);
          void announce(bill.totalPaise);
          setDone({ kind: "cash", stock: r.stock, at: timeNow() });
        })}>{pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />}Haan, cash mil gaya</Button>
      </Sheet>
      <UdhaarSheet open={sheet === "udhaar"} onClose={() => setSheet(null)} total={bill.totalPaise} busy={pending} onPick={(c) => run(async () => {
        const r = await api<{ stock: Delta[]; balancePaise: number }>(`/api/bills/${bill.id}/pay`, { method: "POST", body: JSON.stringify({ method: "udhaar", customerId: c.id }) });
        setSheet(null);
        setDone({ kind: "udhaar", customer: c.name, balancePaise: r.balancePaise, stock: r.stock });
      })} />
    </section>
  );
}

function PayOption({ icon, label, sub, onClick, disabled, primary = false }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void; disabled: boolean; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl p-3 text-center transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${primary ? "bg-blue-600 text-surface shadow-[0_6px_16px_rgb(0_114_188/.25)]" : "border border-line bg-surface text-navy-950 shadow-card"}`}>
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${primary ? "bg-white/15" : "bg-canvas"}`}>{icon}</span>
      <span className="leading-tight"><span className="block font-semibold">{label}</span><span className={`caption ${primary ? "text-white/80" : "text-muted"}`}>{sub}</span></span>
    </button>
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
        <p className="font-semibold text-navy-950">{payment.label}</p>
        <span className={`badge ${payment.provider === "mock" ? "tone-warning" : "tone-staging"}`}>{payment.provider === "mock" ? "MOCK · NOT REAL MONEY" : "PAYTM STAGING"}</span>
      </div>
      {!failed && (
        <>
          <div className="mx-auto mt-4 w-60 max-w-full rounded-2xl border border-line bg-surface p-3 shadow-card">
            {svg ? <div aria-label="Payment QR code for the customer" role="img" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="skeleton aspect-square w-full" />}
          </div>
          <p className="secondary mt-3 text-center">Customer apne phone se scan kare</p>
          <a className="btn btn-secondary mt-3 w-full" href={url || payment.payPath} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Customer view kholiye</a>
        </>
      )}
      <div className="mt-5 rounded-2xl bg-canvas p-4"><PaymentStatus state={state} orderId={payment.orderId} provider={payment.provider} /></div>
      {failed && (
        <div className="mt-4 space-y-3">
          <p className="rounded-xl bg-danger-tint p-3 text-sm text-danger">{rejected ? `Rejected by server: ${rejected}.` : "Payment fail hua."} Bill abhi unpaid hai.</p>
          <Button className="w-full" disabled={busy} onClick={onRetry}><RotateCcw aria-hidden="true" />Dobara try karein</Button>
        </div>
      )}
    </div>
  );
}

function UdhaarSheet({ open, onClose, total, onPick, busy }: { open: boolean; onClose: () => void; total: number; onPick: (c: { id: string; name: string }) => void; busy: boolean }) {
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; balancePaise: number }> | null>(null);
  const [q, setQ] = useState("");
  const loaded = useRef(false);
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    api<{ customers: Array<{ id: string; name: string; balancePaise: number }> }>("/api/customers").then((r) => setCustomers(r.customers)).catch(() => setCustomers([]));
  }, [open]);
  const shown = (customers ?? []).filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet title={`Udhaar · ${formatMoney(total)}`} open={open} onClose={onClose}>
      <p className="secondary mb-3">Kiske khate mein likhein? Stock abhi update hoga; bill settle hone tak unpaid rahega.</p>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input className="field pl-11" placeholder="Customer ka naam" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
      </div>
      {!customers ? <div className="skeleton h-40" /> : (
        <ul className="max-h-[45dvh] overflow-y-auto">
          {shown.map((c) => (
            <li key={c.id}>
              <button type="button" disabled={busy} onClick={() => onPick(c)} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-canvas">
                <span className="avatar h-9 w-9 bg-sky-100 text-xs text-blue-700" aria-hidden="true">{c.name.split(" ").slice(0, 2).map((s) => s[0]).join("")}</span>
                <span className="min-w-0 flex-1 font-medium">{c.name}</span>
                <span className="caption text-muted">Baaki <MoneyText paise={c.balancePaise} size="sm" /></span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="secondary py-6 text-center">Koi customer nahi mila.</li>}
        </ul>
      )}
    </Sheet>
  );
}

function PaidView({ bill, done, onNewBill }: { bill: BillView; done: Done; onNewBill: () => void }) {
  return (
    <section className="mt-5 space-y-4" aria-live="polite">
      {done.kind === "udhaar" ? (
        <div className="card text-center">
          <span className="pop-in mx-auto grid h-14 w-14 place-items-center rounded-full bg-sky-100 text-blue-600"><BookUser aria-hidden="true" /></span>
          <p className="mt-3 text-xl font-bold text-navy-950">Udhaar mein likh diya</p>
          <p className="secondary mt-1">{done.customer} ka baaki ab <span className="font-semibold text-navy-950">{formatMoney(done.balancePaise)}</span></p>
          <p className="caption mt-2 text-muted">Bill settle hone tak unpaid rahega</p>
        </div>
      ) : (
        <PaidToast amount={bill.totalPaise} time={done.at} kind={done.kind === "cash" ? "cash" : "verified"}
          note={done.kind === "cash" ? `Cash · aapne record kiya · ${done.at}` : done.provider === "mock" ? `Mock payment verified by server · not real money · ${done.at}` : `Verified by server with Paytm staging · ${done.at}`} />
      )}
      {done.stock.length > 0 && (
        <div>
          <p className="section-label mb-2">Stock updated</p>
          <div className="list-card">
            {done.stock.map((s) => <StockDelta key={s.productId} name={s.name} before={s.before} after={s.after} reorderLevel={s.reorderLevel} />)}
          </div>
        </div>
      )}
      <Button className="w-full" onClick={onNewBill}><Plus aria-hidden="true" />Naya bill</Button>
    </section>
  );
}

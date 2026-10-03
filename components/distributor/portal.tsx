"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Clock, LoaderCircle, Store, Truck, X } from "lucide-react";
import { Button, EmptyState, ErrorBanner, Sheet, Skeleton } from "@/components/ui/primitives";
import { MoneyText, Stepper } from "@/components/kirana/components";
import { ProductIcon } from "@/components/kirana/product-icon";
import { formatMoney } from "@/lib/format-money";
import type { PurchaseOrder } from "@/lib/purchases";

const ETAS = ["Aaj shaam", "Kal subah", "Kal shaam"] as const;
const REASONS = ["Stock nahi hai", "Area se bahar", "Rate badal gaya"] as const;
const time = (iso: string) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const STATUS: Record<PurchaseOrder["status"], { label: string; tone: string }> = {
  SENT: { label: "Naya", tone: "tone-info" }, ACCEPTED: { label: "Accepted", tone: "tone-success" },
  REJECTED: { label: "Rejected", tone: "tone-neutral" }, RECEIVED: { label: "Delivered", tone: "tone-neutral" },
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}

/** The distributor's phone: incoming shop orders, confirm quantities and delivery, or decline. */
export function DistributorPortal({ slug, name, area }: { slug: string; name: string; area: string }) {
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [tab, setTab] = useState<"new" | "accepted" | "done">("new");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/distributor/${slug}/orders`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrders(data.orders);
    } catch { /* keep the last list; polling retries */ }
  }, [slug]);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => { await load(); if (!stop) timer = setTimeout(loop, 4000); };
    void loop();
    return () => { stop = true; clearTimeout(timer); };
  }, [load]);

  const lists = {
    new: orders?.filter((o) => o.status === "SENT") ?? [],
    accepted: orders?.filter((o) => o.status === "ACCEPTED") ?? [],
    done: orders?.filter((o) => o.status === "RECEIVED" || o.status === "REJECTED") ?? [],
  };
  const shown = lists[tab];
  const replace = (o: PurchaseOrder) => setOrders((list) => list?.map((x) => (x.id === o.id ? o : x)) ?? null);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[420px] bg-canvas pb-10">
      <header className="bg-navy-950 px-4 pb-5 pt-[calc(16px+env(safe-area-inset-top))] text-surface">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-500 text-navy-950"><Truck aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl text-surface">{name}</h1>
            <p className="caption text-on-dark-muted">Distributor · {area}</p>
          </div>
          <span className="badge bg-white/10 text-surface">DEMO</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="caption text-on-dark-muted">Naye orders</p>
            <p className="text-2xl font-bold tabular-nums">{lists.new.length}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="caption text-on-dark-muted">Deliver karna hai</p>
            <p className="text-2xl font-bold tabular-nums">{formatMoney(lists.accepted.reduce((s, o) => s + o.totalPaise, 0))}</p>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4">
        <div role="group" aria-label="Order status" className="segmented mb-4">
          {([["new", "Naye", lists.new.length], ["accepted", "Accepted", lists.accepted.length], ["done", "Ho gaye", lists.done.length]] as const).map(([k, label, n]) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
              {label}{orders && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${tab === k && k === "new" && n ? "bg-blue-600 text-surface" : "bg-canvas text-muted"}`}>{n}</span>}
            </button>
          ))}
        </div>
        {error && <div className="mb-3"><ErrorBanner message={error} /></div>}
        {orders === null ? <Skeleton rows={3} /> : shown.length === 0 ? (
          <EmptyState icon={Truck} title={tab === "new" ? "Abhi koi naya order nahi" : "Kuch nahi"} description="Dukaan se approved reorders yahan aate hain." />
        ) : (
          <div className="space-y-3" aria-live="polite">
            {shown.map((o) => <OrderCard key={o.id} o={o} showSupplier={slug === "all"} onDone={replace} onError={setError} />)}
          </div>
        )}
        <p className="caption mt-4 text-center text-muted">Demo rate: catalogue price − 15% (assumption)</p>
      </div>
    </main>
  );
}

function OrderCard({ o, showSupplier, onDone, onError }: { o: PurchaseOrder; showSupplier: boolean; onDone: (o: PurchaseOrder) => void; onError: (m: string | null) => void }) {
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(o.items.map((i) => [i.id, i.qtyConfirmed ?? i.qtyOrdered])));
  const [eta, setEta] = useState<string>(ETAS[1]);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const editable = o.status === "SENT";
  const total = o.items.reduce((s, i) => s + (editable ? qty[i.id] : i.qtyConfirmed ?? i.qtyOrdered) * i.unitCostPaise, 0);

  const act = async (fn: () => Promise<{ order: PurchaseOrder }>) => {
    setBusy(true);
    onError(null);
    try { onDone((await fn()).order); } catch (e) { onError(e instanceof Error ? e.message : "Update nahi hua."); } finally { setBusy(false); }
  };

  return (
    <div className="card fade-up">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-blue-600"><Store aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-navy-950">{o.shop} <span className="font-normal text-muted">· #{o.number}</span></p>
          <p className="caption text-muted">{showSupplier ? `${o.supplierName.replace(" (demo supplier)", "")} · ` : ""}{time(o.createdAt)}</p>
        </div>
        <span className={`badge ${STATUS[o.status].tone}`}>{STATUS[o.status].label}</span>
      </div>

      <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
        {o.items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-3 py-2.5">
            <ProductIcon name={i.name} category={i.category} className="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{i.name}</p>
              <p className="caption text-muted tabular-nums">{formatMoney(i.unitCostPaise)} · order {i.qtyOrdered}</p>
            </div>
            {editable ? (
              <Stepper qty={qty[i.id]} name={i.name} max={i.qtyOrdered} busy={busy}
                onChange={(d) => setQty((q) => ({ ...q, [i.id]: Math.max(0, Math.min(i.qtyOrdered, q[i.id] + d)) }))} />
            ) : <span className="font-semibold tabular-nums">× {i.qtyConfirmed ?? i.qtyOrdered}</span>}
          </li>
        ))}
      </ul>

      {editable && (
        <div className="chip-row mt-3" role="radiogroup" aria-label="Delivery time">
          {ETAS.map((e) => (
            <button key={e} type="button" role="radio" aria-checked={eta === e} className="chip" onClick={() => setEta(e)}>
              <Clock aria-hidden="true" />{e}
            </button>
          ))}
        </div>
      )}
      {o.status === "ACCEPTED" && <p className="caption mt-3 flex items-center gap-1.5 text-success"><Clock className="!h-4 !w-4" aria-hidden="true" />Delivery {o.eta}</p>}
      {o.status === "REJECTED" && <p className="caption mt-3 text-muted">{o.note}</p>}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div><p className="caption text-muted">Total</p><MoneyText paise={total} /></div>
        {editable && (
          <div className="flex gap-2">
            <Button variant="quiet" disabled={busy} onClick={() => setRejecting(true)} aria-label="Decline order"><X aria-hidden="true" /></Button>
            <Button disabled={busy || total === 0} onClick={() => act(() => post(`/api/purchases/${o.id}/accept`, { eta, items: o.items.map((i) => ({ id: i.id, qty: qty[i.id] })) }))}>
              {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />}Accept
            </Button>
          </div>
        )}
      </div>

      <Sheet title={`Order #${o.number} decline karein?`} open={rejecting} onClose={() => setRejecting(false)}>
        <div className="grid gap-2">
          {REASONS.map((r) => (
            <Button key={r} variant="quiet" className="justify-start" disabled={busy} onClick={() => { setRejecting(false); void act(() => post(`/api/purchases/${o.id}/reject`, { note: r })); }}>{r}</Button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

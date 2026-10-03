"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Clock, ExternalLink, HandCoins, LoaderCircle, PackageCheck, Truck } from "lucide-react";
import { Button, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/primitives";
import { MoneyText, SourceLine } from "./components";
import { ProductIcon } from "./product-icon";
import { formatMoney } from "@/lib/format-money";
import type { PurchaseOrder } from "@/lib/purchases";

interface Dues { totalPaise: number; suppliers: Array<{ supplier: string; total: number; orders: number }>; source: string }
interface Delta { productId: string; name: string; before: number; after: number }
const time = (iso: string) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const short = (name: string) => name.replace(" (demo supplier)", "");
const STATUS: Record<PurchaseOrder["status"], { label: string; tone: string }> = {
  SENT: { label: "Bheja", tone: "tone-info" }, ACCEPTED: { label: "Aa raha hai", tone: "tone-success" },
  REJECTED: { label: "Mana kiya", tone: "tone-danger" }, RECEIVED: { label: "Aa gaya", tone: "tone-neutral" },
};

async function post<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Update nahi hua.");
  return data as T;
}

/** The shop's orders to distributors: track, receive ("Maal aa gaya"), and record supplier payments. */
export function SupplierOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [dues, setDues] = useState<Dues | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [received, setReceived] = useState<Record<string, Delta[]>>({});

  const load = useCallback(async () => {
    try {
      const data = await fetch("/api/purchases").then((r) => r.json());
      setOrders(data.orders ?? []);
      setDues(data.dues ?? null);
    } catch { /* keep the last list */ }
  }, []);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => { await load(); if (!stop) timer = setTimeout(loop, 4000); };
    void loop();
    return () => { stop = true; clearTimeout(timer); };
  }, [load]);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Update nahi hua."); } finally { setBusy(null); }
  };
  const receive = (id: string) => run(id, async () => {
    const r = await post<{ stock: Delta[] }>(`/api/purchases/${id}/receive`);
    setReceived((m) => ({ ...m, [id]: r.stock }));
  });
  const paid = (id: string) => run(id, async () => { await post(`/api/purchases/${id}/paid`); });

  return (
    <>
      {dues && dues.totalPaise > 0 && (
        <section className="hero mb-4 p-4">
          <p className="text-sm text-on-dark-muted">Suppliers ko dena hai</p>
          <MoneyText paise={dues.totalPaise} size="display" />
          <p className="caption mt-2 text-on-dark-muted">{dues.suppliers.map((s) => `${short(s.supplier)} ${formatMoney(s.total)}`).join(" · ")}</p>
        </section>
      )}
      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
      {orders === null ? <Skeleton rows={3} /> : orders.length === 0 ? (
        <EmptyState icon={Truck} title="Abhi koi supplier order nahi" description="Salaahkaar ka reorder approve karein, order yahan aayega." />
      ) : (
        <div className="space-y-3" aria-live="polite">
          {orders.map((o) => {
            const deltas = received[o.id];
            return (
              <div key={o.id} className="card fade-up">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-blue-600"><Truck aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-navy-950">{short(o.supplierName)} <span className="font-normal text-muted">· #{o.number}</span></p>
                    <p className="caption text-muted">{time(o.createdAt)}{o.status === "ACCEPTED" && o.eta ? ` · delivery ${o.eta}` : ""}</p>
                  </div>
                  <span className={`badge ${STATUS[o.status].tone}`}>{o.paidAt ? "Paid" : STATUS[o.status].label}</span>
                </div>
                <ul className="mt-3 space-y-2">
                  {o.items.map((i) => (
                    <li key={i.id} className="flex items-center gap-3">
                      <ProductIcon name={i.name} category={i.category} className="h-9 w-9" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{i.name}</span>
                      <span className="text-sm tabular-nums">
                        {i.qtyConfirmed !== null && i.qtyConfirmed < i.qtyOrdered ? <><s className="text-muted">{i.qtyOrdered}</s> {i.qtyConfirmed}</> : `× ${i.qtyConfirmed ?? i.qtyOrdered}`}
                      </span>
                    </li>
                  ))}
                </ul>
                {deltas && deltas.length > 0 && (
                  <div className="mt-3 rounded-xl bg-success-tint p-3 text-sm text-success">
                    {deltas.map((d) => <p key={d.productId} className="flex items-center gap-2 tabular-nums"><PackageCheck className="!h-4 !w-4" aria-hidden="true" />{d.name}: {d.before}<ArrowRight className="!h-3.5 !w-3.5" aria-hidden="true" /><b>{d.after}</b></p>)}
                  </div>
                )}
                {o.status === "REJECTED" && o.note && <p className="caption mt-3 text-danger">{o.note}</p>}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div><p className="caption text-muted">{o.status === "RECEIVED" ? (o.paidAt ? "Paid" : "Dena hai") : "Order value"}</p><MoneyText paise={o.totalPaise} /></div>
                  {(o.status === "SENT" || o.status === "ACCEPTED") && (
                    <Button disabled={busy === o.id} onClick={() => receive(o.id)}>
                      {busy === o.id ? <LoaderCircle className="spin" aria-hidden="true" /> : <PackageCheck aria-hidden="true" />}Maal aa gaya
                    </Button>
                  )}
                  {o.status === "RECEIVED" && !o.paidAt && (
                    <Button variant="quiet" disabled={busy === o.id} onClick={() => paid(o.id)}>
                      {busy === o.id ? <LoaderCircle className="spin" aria-hidden="true" /> : <HandCoins aria-hidden="true" />}Payment diya
                    </Button>
                  )}
                  {o.paidAt && <span className="caption flex items-center gap-1 text-success"><Check className="!h-4 !w-4" aria-hidden="true" />Hisaab saaf</span>}
                </div>
                {o.status === "SENT" && <p className="caption mt-2 flex items-center gap-1.5 text-muted"><Clock className="!h-3.5 !w-3.5" aria-hidden="true" />Distributor ke confirm ka intezaar</p>}
              </div>
            );
          })}
        </div>
      )}
      {dues && <SourceLine source={`${dues.source} · demo rates (catalogue − 15%)`} />}
      <a href="/d/all" target="_blank" rel="noreferrer" className="btn btn-quiet mt-4 w-full"><ExternalLink aria-hidden="true" />Distributor view (demo)</a>
    </>
  );
}

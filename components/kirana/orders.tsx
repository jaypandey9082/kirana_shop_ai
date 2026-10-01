"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Bike, ExternalLink, QrCode, Store } from "lucide-react";
import { Button, EmptyState, ErrorBanner, Sheet } from "@/components/ui/primitives";
import { MoneyText } from "./components";
import type { Fulfilment, OrderView } from "@/lib/orders";

const NEXT: Record<Fulfilment, { to: Fulfilment; label: string } | null> = {
  RECEIVED: { to: "PREPARING", label: "Taiyaar karna shuru" },
  PREPARING: { to: "READY", label: "Ready hai" },
  READY: { to: "COMPLETED", label: "Customer ko de diya" },
  COMPLETED: null,
};
const LABEL: Record<Fulfilment, string> = { RECEIVED: "Received", PREPARING: "Preparing", READY: "Ready", COMPLETED: "Completed" };
const time = (iso: string) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

export function OrdersScreen({ shopSlug, shopName }: { shopSlug: string; shopName: string }) {
  const [orders, setOrders] = useState<OrderView[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [qr, setQr] = useState(false);
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const data = await fetch("/api/orders").then((r) => r.json());
        if (stop) return;
        const list: OrderView[] = data.orders ?? [];
        const paidIds = list.filter((o) => o.status === "PAID").map((o) => o.id);
        if (known.current) {
          const added = paidIds.filter((id) => !known.current!.has(id));
          if (added.length) {
            setFresh((f) => new Set([...f, ...added]));
            setTimeout(() => setFresh((f) => new Set([...f].filter((id) => !added.includes(id)))), 3000);
          }
        }
        known.current = new Set(paidIds);
        setOrders(list);
      } catch { /* keep polling */ }
      if (!stop) timer = setTimeout(load, 3000);
    };
    void load();
    return () => { stop = true; clearTimeout(timer); };
  }, []);

  const advance = async (id: string, to: Fulfilment) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fulfilment: to }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Update nahi hua.");
      setOrders((list) => list?.map((o) => (o.id === id ? data.order : o)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update nahi hua.");
    } finally {
      setBusy(null);
    }
  };

  const paid = orders?.filter((o) => o.status === "PAID" && o.fulfilment !== "COMPLETED") ?? [];
  const waiting = orders?.filter((o) => o.status !== "PAID") ?? [];
  const done = orders?.filter((o) => o.fulfilment === "COMPLETED") ?? [];

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div><h1>Orders</h1><p className="secondary mt-1">QR storefront ke online orders.</p></div>
        <Button variant="secondary" onClick={() => setQr(true)}><QrCode aria-hidden="true" />Shop QR</Button>
      </div>
      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
      {orders === null ? <p className="secondary">Loading…</p> : paid.length === 0 && waiting.length === 0 && done.length === 0 ? (
        <EmptyState title="Abhi koi online order nahi" description="Customers scan the Shop QR to order. New paid orders appear here instantly." />
      ) : (
        <div className="space-y-6" aria-live="polite">
          {paid.length > 0 && <section className="space-y-3"><p className="section-label">Taiyaar karna hai</p>{paid.map((o) => <OrderCard key={o.id} o={o} fresh={fresh.has(o.id)} busy={busy === o.id} onAdvance={advance} />)}</section>}
          {waiting.length > 0 && <section className="space-y-3"><p className="section-label">Payment pending</p>{waiting.slice(0, 5).map((o) => <OrderCard key={o.id} o={o} busy={false} />)}</section>}
          {done.length > 0 && <section className="space-y-3"><p className="section-label">Completed</p>{done.slice(0, 5).map((o) => <OrderCard key={o.id} o={o} busy={false} />)}</section>}
        </div>
      )}
      <ShopQr open={qr} onClose={() => setQr(false)} slug={shopSlug} name={shopName} />
    </>
  );
}

function OrderCard({ o, fresh = false, busy, onAdvance }: { o: OrderView; fresh?: boolean; busy: boolean; onAdvance?: (id: string, to: Fulfilment) => void }) {
  const next = o.fulfilment ? NEXT[o.fulfilment] : null;
  return (
    <div className={`card transition-colors duration-500 ${fresh ? "border-blue-600 bg-sky-100" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">#{o.number} · {o.name}</p>
          <p className="caption mt-1 flex items-center gap-1 text-muted">{o.mode === "delivery" ? <Bike aria-hidden="true" /> : <Store aria-hidden="true" />}{o.mode === "delivery" ? "Delivery" : "Pickup"} · {time(o.createdAt)}{o.phone ? ` · ${o.phone}` : ""}</p>
        </div>
        <MoneyText paise={o.totalPaise} />
      </div>
      <p className="secondary mt-2">{o.items.map((i) => `${i.name} × ${i.qty}`).join(", ")}</p>
      {o.note && <p className="caption mt-1 text-muted">Address: {o.note}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`badge ${o.status !== "PAID" ? "tone-warning" : o.fulfilment === "COMPLETED" ? "tone-neutral" : "tone-success"}`}>{o.status !== "PAID" ? "Waiting for payment" : `Paid · ${LABEL[o.fulfilment!]}`}</span>
        {next && onAdvance && <Button disabled={busy} onClick={() => onAdvance(o.id, next.to)}>{next.label}</Button>}
      </div>
    </div>
  );
}

function ShopQr({ open, onClose, slug, name }: { open: boolean; onClose: () => void; slug: string; name: string }) {
  const [svg, setSvg] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!open) return;
    const full = `${window.location.origin}/s/${slug}`;
    QRCode.toString(full, { type: "svg", margin: 1, color: { dark: "#0B1F44", light: "#FFFFFF" } }).then((m) => { setSvg(m); setUrl(full); }).catch(() => setUrl(full));
  }, [open, slug]);
  return (
    <Sheet title={`${name} · Shop QR`} open={open} onClose={onClose}>
      <div className="mx-auto w-60 max-w-full rounded-lg border border-line p-2" role="img" aria-label="QR code for the online store" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="secondary mt-3 text-center">Customer scan karke order aur payment kar sakte hain.</p>
      {url && <a className="btn btn-secondary mt-3 w-full" href={url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Storefront kholiye</a>}
    </Sheet>
  );
}

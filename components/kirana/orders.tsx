"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Bike, ExternalLink, LoaderCircle, QrCode, ShoppingBag, Store } from "lucide-react";
import { Button, EmptyState, ErrorBanner, ScreenHead, Sheet, Skeleton } from "@/components/ui/primitives";
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
  const [tab, setTab] = useState<"active" | "pending" | "done">("active");
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
  const lists = { active: paid, pending: waiting.slice(0, 10), done: done.slice(0, 10) };
  const shown = lists[tab];

  return (
    <>
      <ScreenHead title="Orders" subtitle="QR storefront ke online orders">
        <Button variant="secondary" className="shrink-0" onClick={() => setQr(true)}><QrCode aria-hidden="true" />Shop QR</Button>
      </ScreenHead>
      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
      <div role="group" aria-label="Order status" className="segmented mb-4">
        {([["active", "Taiyaar karo", paid.length], ["pending", "Payment", waiting.length], ["done", "Ho gaye", done.length]] as const).map(([k, label, n]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {label}{orders && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${tab === k ? (k === "active" && n ? "bg-blue-600 text-surface" : "bg-canvas text-muted") : "bg-white/70"}`}>{n}</span>}
          </button>
        ))}
      </div>
      {orders === null ? <Skeleton rows={3} /> : shown.length === 0 ? (
        tab === "active"
          ? <EmptyState icon={ShoppingBag} title="Abhi koi naya order nahi" description="Customer Shop QR scan karke order karte hain. Paid orders yahan turant aate hain."><Button variant="secondary" onClick={() => setQr(true)}><QrCode aria-hidden="true" />Shop QR dikhaiye</Button></EmptyState>
          : <EmptyState icon={ShoppingBag} title={tab === "pending" ? "Koi pending payment nahi" : "Abhi koi completed order nahi"} description="Online orders yahan dikhenge." />
      ) : (
        <div className="space-y-3" aria-live="polite">
          {shown.map((o) => <OrderCard key={o.id} o={o} fresh={fresh.has(o.id)} busy={busy === o.id} onAdvance={tab === "active" ? advance : undefined} />)}
        </div>
      )}
      <ShopQr open={qr} onClose={() => setQr(false)} slug={shopSlug} name={shopName} />
    </>
  );
}

const STEP_INDEX: Record<Fulfilment, number> = { RECEIVED: 0, PREPARING: 1, READY: 2, COMPLETED: 3 };
function OrderCard({ o, fresh = false, busy, onAdvance }: { o: OrderView; fresh?: boolean; busy: boolean; onAdvance?: (id: string, to: Fulfilment) => void }) {
  const next = o.fulfilment ? NEXT[o.fulfilment] : null;
  const paid = o.status === "PAID";
  const step = o.fulfilment ? STEP_INDEX[o.fulfilment] : -1;
  return (
    <div className={`card transition-colors duration-700 ${fresh ? "border-blue-600 bg-sky-100" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${o.mode === "delivery" ? "bg-warning-tint text-warning" : "bg-sky-100 text-blue-600"}`}>
          {o.mode === "delivery" ? <Bike aria-hidden="true" /> : <Store aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-navy-950">{o.name} <span className="font-normal text-muted">· #{o.number}</span></p>
            <MoneyText paise={o.totalPaise} />
          </div>
          <p className="caption mt-0.5 text-muted">{o.mode === "delivery" ? "Delivery" : "Pickup"} · {time(o.createdAt)}{o.phone ? ` · ${o.phone}` : ""}</p>
        </div>
      </div>
      <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-sm leading-6">{o.items.map((i) => `${i.name} × ${i.qty}`).join(" · ")}</p>
      {o.note && <p className="caption mt-2 text-muted">Address: {o.note}</p>}
      {paid && o.fulfilment !== "COMPLETED" && (
        <div className="mt-3 flex gap-1" aria-label={`Status: ${LABEL[o.fulfilment!]}`}>
          {["Received", "Preparing", "Ready"].map((l, i) => (
            <div key={l} className="flex-1">
              <div className={`h-1 rounded-full ${i <= step ? "bg-success-500" : "bg-line"}`} />
              <p className={`caption mt-1 ${i === step ? "font-semibold text-navy-950" : "text-muted"}`}>{l}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`badge ${!paid ? "tone-warning" : o.fulfilment === "COMPLETED" ? "tone-neutral" : "tone-success"}`}>{!paid ? "Payment ka intezaar" : o.fulfilment === "COMPLETED" ? "Completed" : "Paid · server verified"}</span>
        {next && onAdvance && <Button disabled={busy} onClick={() => onAdvance(o.id, next.to)}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : null}{next.label}</Button>}
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
    <Sheet title="Shop QR" open={open} onClose={onClose}>
      <div className="rounded-3xl bg-navy-950 p-5 text-center text-surface">
        <p className="font-semibold">{name}</p>
        <p className="caption text-on-dark-muted">Scan karke order kijiye</p>
        <div className="mx-auto mt-4 w-56 max-w-full rounded-2xl bg-surface p-3">
          {svg ? <div role="img" aria-label="QR code for the online store" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="skeleton aspect-square w-full" />}
        </div>
      </div>
      <p className="secondary mt-3 text-center">Customer order aur payment khud kar sakte hain.</p>
      {url && <a className="btn btn-secondary mt-3 w-full" href={url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Storefront kholiye</a>}
    </Sheet>
  );
}

"use client";
import { useEffect, useState } from "react";
import { Check, ChefHat, PackageCheck, ShoppingBag } from "lucide-react";
import { MoneyText } from "@/components/kirana/components";
import type { OrderView } from "@/lib/orders";

const STEPS = [
  { key: "RECEIVED", label: "Order mila", Icon: ShoppingBag },
  { key: "PREPARING", label: "Taiyaar ho raha hai", Icon: ChefHat },
  { key: "READY", label: "Ready", Icon: PackageCheck },
] as const;

/** Customer's tracking page; refreshes every 4 s. */
export function OrderStatus({ initial, shopName }: { initial: OrderView; shopName: string }) {
  const [order, setOrder] = useState(initial);
  useEffect(() => {
    if (order.fulfilment === "COMPLETED") return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/orders/${order.id}`).catch(() => null);
      const data = await res?.json().catch(() => null);
      if (data?.order) setOrder(data.order);
    }, 4000);
    return () => clearInterval(t);
  }, [order.id, order.fulfilment]);

  const reached = order.fulfilment === "COMPLETED" ? 3 : STEPS.findIndex((s) => s.key === order.fulfilment);
  const paid = order.status === "PAID";
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[420px] bg-canvas px-4 pb-10 pt-[calc(16px+env(safe-area-inset-top))]">
      <header className="flex items-center gap-3">
        <span className="avatar h-10 w-10 bg-navy-950 text-surface" aria-hidden="true">{shopName.charAt(0)}</span>
        <div className="min-w-0 flex-1"><p className="truncate font-semibold text-navy-950">{shopName}</p><p className="caption text-muted">Order #{order.number} · {order.mode === "delivery" ? "Delivery" : "Pickup"}</p></div>
        <MoneyText paise={order.totalPaise} />
      </header>
      <section className="card mt-4" aria-live="polite">
        <h1>{!paid ? "Payment pending" : order.fulfilment === "COMPLETED" ? "Order complete" : order.fulfilment === "READY" ? (order.mode === "delivery" ? "Delivery par hai" : "Pickup ke liye ready") : "Order taiyaar ho raha hai"}</h1>
        <p className="secondary mt-1">{paid ? "Yeh page apne aap update hota hai." : "Payment complete hone ke baad order dukaan tak pahunchega."}</p>
        {paid && (
          <ol className="mt-5">
            {STEPS.map((s, i) => {
              const done = i < reached || order.fulfilment === "COMPLETED";
              const active = i === reached && order.fulfilment !== "COMPLETED";
              return (
                <li key={s.key} className="relative flex items-center gap-3 pb-5 last:pb-0">
                  {i < STEPS.length - 1 && <span className={`absolute left-[19px] top-10 h-[calc(100%-40px)] w-0.5 ${done ? "bg-success-500" : "bg-line"}`} aria-hidden="true" />}
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${done ? "bg-success-500 text-surface" : active ? "bg-sky-100 text-blue-600 ring-4 ring-sky-100/60" : "bg-canvas text-muted"}`}>{done ? <Check aria-hidden="true" /> : <s.Icon aria-hidden="true" />}</span>
                  <span className={active ? "font-semibold text-navy-950" : done ? "text-ink" : "text-muted"}>{s.label}{s.key === "READY" && order.mode === "delivery" ? " · delivery par" : ""}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <ul className="card mt-3 p-0 text-sm">
        {order.items.map((i) => <li key={i.name} className="flex justify-between border-b border-line px-4 py-2.5 last:border-0"><span>{i.name}</span><span className="tabular-nums text-muted">× {i.qty}</span></li>)}
      </ul>
    </main>
  );
}

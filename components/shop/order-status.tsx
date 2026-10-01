"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, ChefHat, PackageCheck, ShoppingBag } from "lucide-react";
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
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[420px] bg-canvas p-4">
      <section className="rounded-xl bg-navy-950 p-5 text-surface">
        <p className="caption text-on-dark-muted">Order #{order.number} · {shopName}</p>
        <h1 className="mt-1 text-surface">{order.status !== "PAID" ? "Payment pending" : order.fulfilment === "COMPLETED" ? "Order complete" : "Aapka order"}</h1>
        <div className="mt-3"><MoneyText paise={order.totalPaise} size="display" /></div>
      </section>
      {order.status === "PAID" ? (
        <ol className="card mt-4 space-y-4" aria-live="polite">
          {STEPS.map((s, i) => (
            <li key={s.key} className={`flex items-center gap-3 ${i <= reached ? "font-semibold text-navy-950" : "text-muted"}`}>
              <span className={`grid h-10 w-10 place-items-center rounded-full ${i <= reached ? "bg-success-tint text-success" : "bg-canvas"}`}>{i < reached || order.fulfilment === "COMPLETED" ? <CheckCircle2 aria-hidden="true" /> : <s.Icon aria-hidden="true" />}</span>
              {s.label}{s.key === "READY" && order.mode === "delivery" ? " · delivery par" : ""}
            </li>
          ))}
        </ol>
      ) : <p className="card mt-4 secondary">Payment complete hone ke baad order dukaan tak pahunchega.</p>}
      <ul className="card mt-4 divide-y divide-line text-sm">
        {order.items.map((i) => <li key={i.name} className="flex justify-between py-2"><span>{i.name}</span><span className="tabular-nums text-muted">× {i.qty}</span></li>)}
      </ul>
    </main>
  );
}

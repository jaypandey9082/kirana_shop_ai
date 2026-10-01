"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, Carrot, CupSoda, Droplet, LoaderCircle, Milk, Minus, Cookie, Plus, Search, ShowerHead, Store, Wheat, type LucideIcon } from "lucide-react";
import { Button, ErrorBanner, Sheet } from "@/components/ui/primitives";
import { MoneyText } from "@/components/kirana/components";
import { matchProduct } from "@/lib/matcher";
import type { StoreInfo, StoreProduct } from "@/lib/orders";

const ICONS: Record<string, { Icon: LucideIcon; tint: string }> = {
  "Dairy & bakery": { Icon: Milk, tint: "bg-sky-100 text-blue-600" },
  Fresh: { Icon: Carrot, tint: "bg-success-tint text-success" },
  Staples: { Icon: Wheat, tint: "bg-warning-tint text-warning" },
  "Biscuits & snacks": { Icon: Cookie, tint: "bg-warning-tint text-warning" },
  "Oil, spices & tea": { Icon: Droplet, tint: "bg-warning-tint text-warning" },
  Beverages: { Icon: CupSoda, tint: "bg-sky-100 text-blue-600" },
  "Personal care & home": { Icon: ShowerHead, tint: "bg-sky-100 text-blue-600" },
};

export function Storefront({ store, products, paymentLabel }: { store: StoreInfo; products: StoreProduct[]; paymentLabel: string }) {
  const router = useRouter();
  const categories = useMemo(() => {
    const order = Object.keys(ICONS); // everyday needs first
    return [...new Set(products.map((p) => p.category))].sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99);
  }, [products]);
  const [category, setCategory] = useState(categories[0] ?? "");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkout, setCheckout] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<"pickup" | "delivery">("pickup");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    if (query.trim()) return products.filter((p) => matchProduct(query, [{ id: p.id, name: p.name, aliases: [] }]).confidence >= 0.5 || p.name.toLowerCase().includes(query.toLowerCase()));
    return products.filter((p) => p.category === category);
  }, [products, category, query]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => ({ product: byId.get(id)!, qty }));
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.qty * l.product.pricePaise, 0);
  const setQty = (id: string, qty: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(qty, Math.min(20, byId.get(id)!.stock))) }));

  const placeOrder = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shop/${store.slug}/orders`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })), name, phone, mode, note: mode === "delivery" ? note : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Order nahi hua. Dobara try karein.");
      router.push(data.payPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order nahi hua.");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[420px] bg-surface pb-40">
      <section className="m-4 rounded-xl bg-navy-950 p-5 text-surface">
        <p className="caption flex items-center gap-2 text-on-dark-muted"><Store aria-hidden="true" />Opened from shop QR</p>
        <h1 className="mt-2 text-surface">{store.name}</h1>
        <p className="mt-1 text-sm text-on-dark-muted">Open till {store.openTill} · Pickup or delivery within {store.deliveryRadiusKm} km</p>
      </section>

      <div className="mx-4 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input className="field pl-10" placeholder="Search atta, doodh, sabun…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
      </div>

      {!query && (
        <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Categories">
          {categories.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}
              className={`badge shrink-0 px-3 py-2 text-xs ${category === c ? "bg-navy-950 text-surface" : "tone-neutral"}`}>{c}</button>
          ))}
        </div>
      )}

      <ul className="mt-4 grid grid-cols-2 gap-3 px-4">
        {shown.map((p) => {
          const qty = cart[p.id] ?? 0;
          const out = p.stock === 0;
          const { Icon, tint } = ICONS[p.category] ?? ICONS["Dairy & bakery"];
          return (
            <li key={p.id} className={`rounded-lg border border-line p-3 ${out ? "opacity-60" : ""}`}>
              <div className={`grid h-16 place-items-center rounded-md ${tint}`}><Icon aria-hidden="true" /></div>
              <p className="mt-2 min-h-10 text-sm font-semibold leading-5">{p.name}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <MoneyText paise={p.pricePaise} size="sm" />
                {out ? <span className="badge tone-neutral">Khatam</span> : qty === 0 ? (
                  <button type="button" className="btn btn-secondary min-h-10 px-3 py-1 text-sm" onClick={() => setQty(p.id, 1)} aria-label={`Add ${p.name}`}>Add</button>
                ) : (
                  <span className="flex items-center gap-1 rounded-md bg-blue-600 text-surface">
                    <button type="button" className="grid h-10 w-9 place-items-center" aria-label={`Remove one ${p.name}`} onClick={() => setQty(p.id, qty - 1)}><Minus aria-hidden="true" /></button>
                    <span className="min-w-4 text-center text-sm font-semibold tabular-nums">{qty}</span>
                    <button type="button" className="grid h-10 w-9 place-items-center" aria-label={`Add one ${p.name}`} disabled={qty >= Math.min(20, p.stock)} onClick={() => setQty(p.id, qty + 1)}><Plus aria-hidden="true" /></button>
                  </span>
                )}
              </div>
              {!out && p.stock <= 5 && <p className="caption mt-1 text-warning">Sirf {p.stock} bache</p>}
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="secondary mt-6 px-4 text-center">Koi item nahi mila.</p>}

      {count > 0 && (
        <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-[420px] -translate-x-1/2 p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-navy-950 p-3 pl-4 text-surface shadow-raised">
            <div><p className="caption text-on-dark-muted">{count} item{count > 1 ? "s" : ""}</p><MoneyText paise={total} /></div>
            <Button onClick={() => setCheckout(true)}>Order karein</Button>
          </div>
        </div>
      )}

      <Sheet title="Order details" open={checkout} onClose={() => setCheckout(false)}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void placeOrder(); }}>
          <ul className="max-h-40 divide-y divide-line overflow-y-auto text-sm">
            {lines.map((l) => <li key={l.product.id} className="flex justify-between py-2"><span>{l.product.name} × {l.qty}</span><MoneyText paise={l.qty * l.product.pricePaise} size="sm" /></li>)}
          </ul>
          <label className="grid gap-1 text-sm font-medium">Naam<input className="field" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <label className="grid gap-1 text-sm font-medium">Mobile (optional)<input className="field" inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} autoComplete="tel-national" /></label>
          <div role="radiogroup" aria-label="Pickup or delivery" className="grid grid-cols-2 gap-2">
            {(["pickup", "delivery"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`btn ${mode === m ? "bg-navy-950 text-surface" : "btn-quiet"}`}>
                {m === "pickup" ? <Store aria-hidden="true" /> : <Bike aria-hidden="true" />}{m === "pickup" ? "Pickup" : "Delivery"}
              </button>
            ))}
          </div>
          {mode === "delivery" && <label className="grid gap-1 text-sm font-medium">Address (within {store.deliveryRadiusKm} km)<textarea className="field min-h-20" required value={note} onChange={(e) => setNote(e.target.value)} autoComplete="street-address" /></label>}
          {error && <ErrorBanner message={error} />}
          <Button type="submit" className="w-full" disabled={busy || name.trim().length < 2}>
            {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : null}Pay <MoneyText paise={total} size="sm" /> · {paymentLabel}
          </Button>
          <p className="caption text-muted">Prices are checked by the shop before payment. You can track the order after paying.</p>
        </form>
      </Sheet>
    </main>
  );
}

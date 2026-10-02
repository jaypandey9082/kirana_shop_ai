"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, Carrot, ChevronRight, CupSoda, Droplet, LoaderCircle, Milk, Minus, Cookie, Plus, Search, ShoppingBag, ShowerHead, Store, Wheat, type LucideIcon } from "lucide-react";
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
    <main className="mx-auto min-h-dvh w-full max-w-[420px] bg-canvas pb-36">
      <header className="bg-surface px-4 pb-3 pt-[calc(16px+env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <span className="avatar h-12 w-12 bg-navy-950 text-lg text-surface" aria-hidden="true">{store.name.charAt(0)}</span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl leading-7">{store.name}</h1>
            <p className="caption flex flex-wrap items-center gap-x-1.5 text-muted"><span className="h-1.5 w-1.5 rounded-full bg-success-500" aria-hidden="true" />Open till {store.openTill} · {store.deliveryRadiusKm} km delivery<span className="badge tone-neutral px-1.5 text-[10px] leading-4">DEMO STORE</span></p>
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-10 space-y-3 border-b border-line bg-surface/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input className="field rounded-full bg-canvas pl-11" placeholder="Search atta, doodh, sabun…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
        </div>
        {!query && (
          <div className="chip-row" role="group" aria-label="Categories">
            {categories.map((c) => {
              const { Icon } = ICONS[c] ?? ICONS["Dairy & bakery"];
              return <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className="chip"><Icon aria-hidden="true" />{c}</button>;
            })}
          </div>
        )}
      </div>

      {query && <p className="caption px-4 pt-3 text-muted">{shown.length} results for “{query}”</p>}
      <ul className="grid grid-cols-2 gap-3 p-4">
        {shown.map((p) => {
          const qty = cart[p.id] ?? 0;
          const out = p.stock === 0;
          const { Icon, tint } = ICONS[p.category] ?? ICONS["Dairy & bakery"];
          return (
            <li key={p.id} className={`flex flex-col rounded-2xl border border-line bg-surface p-2.5 shadow-card ${out ? "opacity-60" : ""}`}>
              <div className={`relative grid aspect-[16/9] place-items-center rounded-xl ${tint}`}>
                <Icon className="!h-9 !w-9 !stroke-[1.5]" aria-hidden="true" />
                {!out && p.stock <= 5 && <span className="badge absolute left-1.5 top-1.5 bg-surface text-warning">Sirf {p.stock} bache</span>}
                {out && <span className="badge absolute left-1.5 top-1.5 bg-surface text-muted">Khatam</span>}
              </div>
              <p className="mt-2 line-clamp-2 min-h-10 px-0.5 text-sm font-semibold leading-5 text-navy-950">{p.name}</p>
              <div className="mt-auto flex items-center justify-between gap-2 px-0.5 pt-2">
                <MoneyText paise={p.pricePaise} size="sm" />
                {out ? null : qty === 0 ? (
                  <button type="button" className="h-9 rounded-lg border border-blue-600 bg-surface px-4 text-sm font-bold text-blue-600 transition-colors hover:bg-sky-100" onClick={() => setQty(p.id, 1)} aria-label={`Add ${p.name}`}>ADD</button>
                ) : (
                  <span className="flex h-9 items-center rounded-lg bg-blue-600 text-surface">
                    <button type="button" className="grid h-9 w-8 place-items-center" aria-label={`Remove one ${p.name}`} onClick={() => setQty(p.id, qty - 1)}><Minus className="!h-4 !w-4" aria-hidden="true" /></button>
                    <span className="min-w-4 text-center text-sm font-bold tabular-nums">{qty}</span>
                    <button type="button" className="grid h-9 w-8 place-items-center disabled:opacity-50" aria-label={`Add one ${p.name}`} disabled={qty >= Math.min(20, p.stock)} onClick={() => setQty(p.id, qty + 1)}><Plus className="!h-4 !w-4" aria-hidden="true" /></button>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="secondary mt-6 px-4 text-center">Koi item nahi mila.</p>}

      {count > 0 && (
        <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-[420px] -translate-x-1/2 p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => setCheckout(true)} className="fade-up flex w-full items-center justify-between gap-3 rounded-2xl bg-blue-600 px-4 py-3 text-left text-surface shadow-[0_8px_24px_rgb(0_114_188/.35)]">
            <span className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15"><ShoppingBag aria-hidden="true" /></span>
              <span><span className="caption block opacity-85">{count} item{count > 1 ? "s" : ""}</span><MoneyText paise={total} /></span>
            </span>
            <span className="flex items-center gap-1 font-semibold">Cart dekhiye<ChevronRight aria-hidden="true" /></span>
          </button>
        </div>
      )}

      <Sheet title="Aapka order" open={checkout} onClose={() => setCheckout(false)}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void placeOrder(); }}>
          <ul className="max-h-44 overflow-y-auto rounded-2xl border border-line text-sm">
            {lines.map((l) => (
              <li key={l.product.id} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5 last:border-0">
                <span className="min-w-0">{l.product.name} <span className="text-muted tabular-nums">× {l.qty}</span></span>
                <MoneyText paise={l.qty * l.product.pricePaise} size="sm" />
              </li>
            ))}
            <li className="flex justify-between bg-canvas px-3 py-2.5 font-semibold"><span>Total</span><MoneyText paise={total} size="sm" /></li>
          </ul>
          <div role="radiogroup" aria-label="Pickup or delivery" className="segmented">
            {(["pickup", "delivery"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
                {m === "pickup" ? <Store aria-hidden="true" /> : <Bike aria-hidden="true" />}{m === "pickup" ? "Pickup" : "Delivery"}
              </button>
            ))}
          </div>
          <label className="grid gap-1.5 text-sm font-medium">Naam<input className="field" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <label className="grid gap-1.5 text-sm font-medium">Mobile <span className="sr-only">(optional)</span><input className="field" inputMode="numeric" placeholder="Optional" pattern="[6-9][0-9]{9}" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} autoComplete="tel-national" /></label>
          {mode === "delivery" && <label className="grid gap-1.5 text-sm font-medium">Address (within {store.deliveryRadiusKm} km)<textarea className="field min-h-20" required value={note} onChange={(e) => setNote(e.target.value)} autoComplete="street-address" /></label>}
          {error && <ErrorBanner message={error} />}
          <Button type="submit" className="w-full" disabled={busy || name.trim().length < 2}>
            {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : null}Pay <MoneyText paise={total} size="sm" /> · {paymentLabel}
          </Button>
          <p className="caption text-center text-muted">Daam dukaan ke catalogue se. Payment ke baad order track kar sakte hain.</p>
        </form>
      </Sheet>
    </main>
  );
}

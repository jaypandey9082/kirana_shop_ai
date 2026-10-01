"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ListPlus, Plus, ScanLine, Search } from "lucide-react";
import { Button, ErrorBanner } from "@/components/ui/primitives";
import { BillLine, BillSummary, InputModeTabs, MoneyText, type InputMode } from "./components";
import { matchProduct, normalize } from "@/lib/matcher";
import type { BillView, CatalogueProduct } from "@/lib/bills";
import { PaymentPanel, type OnlineMode } from "./payment";

const STORAGE_KEY = "kirana.counter.billId";
/** Everyday items shown as one-tap chips before the merchant searches. */
const QUICK_SKUS = ["DAI-001", "DAI-006", "DAI-008", "STP-007", "SNK-005", "SNK-007", "BEV-002", "HOM-001"];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed. Please try again.");
  return data as T;
}

function stockLabel(p: CatalogueProduct) {
  if (p.stock === 0) return { text: "Khatam", tone: "tone-danger" };
  if (p.stock < p.reorderLevel) return { text: `${p.stock} left`, tone: "tone-warning" };
  return { text: `${p.stock} in stock`, tone: "tone-neutral" };
}

export function CounterScreen({ catalogue, onlineMode }: { catalogue: CatalogueProduct[]; onlineMode: OnlineMode }) {
  const [mode, setMode] = useState<InputMode>("Manual");
  const [query, setQuery] = useState("");
  const [bill, setBill] = useState<BillView | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Restore the bill in progress after a reload.
  useEffect(() => {
    const id = sessionStorage.getItem(STORAGE_KEY);
    if (!id) return;
    api<{ bill: BillView }>(`/api/bills/${id}`)
      .then(({ bill }) => (bill.status === "DRAFT" || bill.status === "CONFIRMED" ? setBill(bill) : sessionStorage.removeItem(STORAGE_KEY)))
      .catch(() => sessionStorage.removeItem(STORAGE_KEY));
  }, []);

  const run = (fn: () => Promise<void>) => start(async () => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
  });

  const ensureBill = async (): Promise<BillView> => {
    if (bill && bill.status === "DRAFT") return bill;
    const { bill: created } = await api<{ bill: BillView }>("/api/bills", { method: "POST" });
    sessionStorage.setItem(STORAGE_KEY, created.id);
    return created;
  };

  const addProduct = (productId: string, source: "manual" | "scan" = "manual") => run(async () => {
    const b = await ensureBill();
    const { bill: next } = await api<{ bill: BillView }>(`/api/bills/${b.id}/lines`, { method: "POST", body: JSON.stringify({ productId, qty: 1, source }) });
    setBill(next);
    setQuery("");
  });

  const addText = (text: string) => run(async () => {
    const b = await ensureBill();
    const res = await api<{ bill: BillView; unmatched: string[] }>(`/api/bills/${b.id}/lines`, { method: "POST", body: JSON.stringify({ text, source: "manual" }) });
    setBill(res.bill);
    setUnmatched(res.unmatched);
    setQuery("");
  });

  const patchLine = (lineId: string, change: { qty?: number; productId?: string }) => run(async () => {
    const { bill: next } = await api<{ bill: BillView }>(`/api/bills/${bill!.id}/lines/${lineId}`, { method: "PATCH", body: JSON.stringify(change) });
    setBill(next);
  });

  const removeLine = (lineId: string) => run(async () => {
    const { bill: next } = await api<{ bill: BillView }>(`/api/bills/${bill!.id}/lines/${lineId}`, { method: "DELETE" });
    setBill(next);
  });

  const confirm = () => run(async () => {
    const { bill: next } = await api<{ bill: BillView }>(`/api/bills/${bill!.id}/confirm`, { method: "POST" });
    setBill(next);
  });

  const newBill = () => { sessionStorage.removeItem(STORAGE_KEY); setBill(null); setUnmatched([]); setError(null); window.scrollTo({ top: 0 }); router.refresh(); /* fresh stock counts */ };

  // Search results: best matches for a single item, or nothing while a list is being typed.
  const isList = /[,\n]|\b\d+\s+\S/.test(query.trim()) && query.trim().split(/\s+/).length > 1;
  const results = useMemo(() => {
    const q = normalize(query);
    if (!q || isList) return [];
    return catalogue
      .map((p) => ({ p, score: matchProduct(q, [p]).confidence }))
      .filter((r) => r.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((r) => r.p);
  }, [query, isList, catalogue]);
  const quick = useMemo(() => QUICK_SKUS.map((s) => catalogue.find((p) => p.sku === s)).filter((p): p is CatalogueProduct => !!p), [catalogue]);

  if (bill?.status === "CONFIRMED") return <Confirmed bill={bill} onNew={newBill} onlineMode={onlineMode} />;

  const lines = bill?.lines ?? [];
  const reviewCount = bill?.needsReviewCount ?? 0;
  const disabledReason = !lines.length ? "Add at least one item" : reviewCount ? `${reviewCount} item${reviewCount > 1 ? "s" : ""} check karna hai` : undefined;

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div><h1>Counter</h1><p className="secondary mt-1">Naya bill, aapke tareeke se.</p></div>
        {bill && <span className="caption text-muted tabular-nums">Bill #{bill.number}</span>}
      </div>
      <InputModeTabs value={mode} onChange={setMode} />

      <div className="mt-4">
        {mode === "Manual" || mode === "Scan" ? (
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              const q = query.trim();
              if (!q) return;
              if (mode === "Scan") {
                const hit = catalogue.find((p) => p.barcode === q);
                if (hit) addProduct(hit.id, "scan"); else setError("Barcode catalogue mein nahi mila.");
              } else if (isList || results.length === 0) addText(q);
              else if (results.length === 1 || matchProduct(q, catalogue).needsReview === false) addProduct(results[0].id);
              else addText(q);
            }}
          >
            <label htmlFor="counter-search" className="section-label">{mode === "Scan" ? "Barcode" : "Item ya list"}</label>
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                {mode === "Scan" ? <ScanLine className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" /> : <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />}
                <input
                  id="counter-search" className="field pl-10" autoComplete="off" inputMode={mode === "Scan" ? "numeric" : "text"}
                  placeholder={mode === "Scan" ? "Scan or type barcode" : "doodh… ya 2 doodh, 1 bread"}
                  value={query} onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button type="submit" aria-label={isList ? "Add list" : "Add"} disabled={!query.trim() || pending}><ListPlus aria-hidden="true" /></Button>
            </div>
            {mode === "Manual" && isList && <p className="caption mt-2 text-muted">List mode: each item is matched to the catalogue. Unsure items will ask you to choose.</p>}
            {mode === "Scan" && <p className="caption mt-2 text-muted">USB/Bluetooth scanners type the code here. Camera scanning is not built yet.</p>}

            {mode === "Manual" && (results.length > 0 || (!query && !bill?.lines.length)) && (
              <ul className="mt-3 divide-y divide-line">
                {(query ? results : quick).map((p) => {
                  const s = stockLabel(p);
                  return (
                    <li key={p.id}>
                      <button type="button" disabled={pending} onClick={() => addProduct(p.id)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{p.name}</p>
                          <p className="caption mt-0.5 flex items-center gap-2 text-muted"><MoneyText paise={p.pricePaise} size="sm" /><span className={`badge ${s.tone}`}>{s.text}</span></p>
                        </div>
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-100 text-blue-600"><Plus aria-hidden="true" /></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {mode === "Manual" && !query && !bill?.lines.length && <p className="caption mt-2 text-muted">Roz ke items · tap to add</p>}
          </form>
        ) : (
          <div className="card text-center">
            <h2>{mode} billing abhi nahi</h2>
            <p className="secondary mt-2">{mode} input is built in a later section. Type the list in Manual for now, e.g. “2 doodh, 1 bread”.</p>
            <Button variant="secondary" className="mt-4 w-full" onClick={() => setMode("Manual")}>Type the list</Button>
          </div>
        )}
      </div>

      {error && <div className="mt-4"><ErrorBanner message={error} /></div>}
      {unmatched.length > 0 && (
        <p className="mt-4 rounded-lg bg-warning-tint p-3 text-sm text-warning" role="status">
          Catalogue mein nahi mila: {unmatched.join(", ")}. Search karke add karein.
        </p>
      )}

      <section aria-label="Bill" className="mt-6 space-y-3" aria-busy={pending}>
        {lines.length > 0 && <p className="section-label">Bill items</p>}
        {lines.map((l) => (
          <BillLine
            key={l.id}
            busy={pending}
            line={{
              name: l.needsReview ? `“${l.rawText ?? l.name}” — kaunsa?` : l.name,
              qty: l.qty, pricePaise: l.needsReview ? null : l.unitPricePaise,
              state: l.needsReview ? "needs-check" : "confirmed",
              reason: l.needsReview ? "Sahi product chuniye:" : undefined,
              candidates: l.candidates.map((c) => ({ id: c.id, label: `${c.name} · ${formatRupees(c.pricePaise)}` })),
            }}
            onQuantity={(d) => patchLine(l.id, { qty: l.qty + d })}
            onChoose={(productId) => patchLine(l.id, { productId })}
            onRemove={() => removeLine(l.id)}
          />
        ))}
      </section>

      {lines.length > 0 && (
        <div className="mt-6">
          <BillSummary sticky count={bill?.itemCount ?? 0} total={bill?.totalPaise ?? 0} disabledReason={disabledReason} onConfirm={confirm} busy={pending} />
        </div>
      )}
    </>
  );
}

function formatRupees(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

function Confirmed({ bill, onNew, onlineMode }: { bill: BillView; onNew: () => void; onlineMode: OnlineMode }) {
  const [settled, setSettled] = useState<string | null>(null);
  return (
    <>
      <h1>Counter</h1>
      <section className="mt-6 rounded-xl bg-navy-950 p-6 text-surface">
        <p className="flex items-center gap-2 text-sm text-on-dark-muted"><CheckCircle2 aria-hidden="true" />Bill #{bill.number} {settled ?? "confirmed"}</p>
        <div className="my-3"><MoneyText paise={bill.totalPaise} size="display" /></div>
        <p className="caption text-on-dark-muted">{bill.itemCount} items · prices from the catalogue</p>
      </section>
      <details className="card mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-navy-950">Bill items ({bill.lines.length})</summary>
        <ul className="mt-2 divide-y divide-line">
          {bill.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-3 py-3 text-sm">
              <span>{l.name} <span className="text-muted tabular-nums">× {l.qty}</span></span>
              <MoneyText paise={l.lineTotalPaise} size="sm" />
            </li>
          ))}
        </ul>
      </details>
      <PaymentPanel bill={bill} onlineMode={onlineMode} onNewBill={onNew} onSettled={setSettled} />
    </>
  );
}

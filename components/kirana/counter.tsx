"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, FileText, Mic, Plus, ScanBarcode, Search, TrendingUp } from "lucide-react";
import { ErrorBanner, ScreenHead } from "@/components/ui/primitives";
import { BillLine, BillSummary, InputModeTabs, MoneyText, type InputMode } from "./components";
import { matchProduct, normalize } from "@/lib/matcher";
import { formatMoney } from "@/lib/format-money";
import type { BillView, CatalogueProduct } from "@/lib/bills";
import { PaymentPanel, type OnlineMode } from "./payment";
import { ParchiPanel, VoicePanel, type AiCapabilities, type LinesResult } from "./inputs";

const STORAGE_KEY = "kirana.counter.billId";
/** Everyday items shown as one-tap chips before the merchant searches. */
const QUICK_SKUS = ["DAI-001", "DAI-006", "DAI-008", "STP-007", "SNK-005", "SNK-007", "BEV-002", "HOM-001"];
const BARCODE = /^\d{8,14}$/;

export interface TodayGlance { totalPaise: number; bills: number; source: string }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed. Please try again.");
  return data as T;
}

function stockLabel(p: CatalogueProduct) {
  if (p.stock === 0) return { text: "Khatam", tone: "tone-danger" };
  if (p.stock < p.reorderLevel) return { text: `${p.stock} bache`, tone: "tone-warning" };
  return { text: `${p.stock} stock`, tone: "tone-neutral" };
}

export function CounterScreen({ catalogue, onlineMode, ai, today }: { catalogue: CatalogueProduct[]; onlineMode: OnlineMode; ai: AiCapabilities; today: TodayGlance | null }) {
  const [mode, setMode] = useState<InputMode>("Parchi");
  const [query, setQuery] = useState("");
  const [bill, setBill] = useState<BillView | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
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
    setBill(created);
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  const onInputResult = (r: LinesResult, n: string) => { setBill(r.bill); setUnmatched(r.unmatched); setNote(n); };

  const newBill = () => { sessionStorage.removeItem(STORAGE_KEY); setBill(null); setUnmatched([]); setNote(null); setError(null); window.scrollTo({ top: 0 }); router.refresh(); /* fresh stock counts */ };

  // Search results: best matches for a single item, or nothing while a list is being typed.
  const trimmed = query.trim();
  const isBarcode = BARCODE.test(trimmed);
  const isList = /[,\n]|\b\d+\s+\S/.test(trimmed) && trimmed.split(/\s+/).length > 1;
  const results = useMemo(() => {
    const q = normalize(query);
    if (!q || isList || isBarcode) return [];
    return catalogue
      .map((p) => ({ p, score: matchProduct(q, [p]).confidence }))
      .filter((r) => r.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((r) => r.p);
  }, [query, isList, isBarcode, catalogue]);
  const quick = useMemo(() => QUICK_SKUS.map((s) => catalogue.find((p) => p.sku === s)).filter((p): p is CatalogueProduct => !!p), [catalogue]);

  if (bill?.status === "CONFIRMED") return <Confirmed bill={bill} onNew={newBill} onlineMode={onlineMode} />;

  const lines = bill?.lines ?? [];
  const flagged = lines.filter((l) => l.needsReview);
  const clean = lines.filter((l) => !l.needsReview);
  const reviewCount = bill?.needsReviewCount ?? 0;
  const disabledReason = !lines.length ? "Add at least one item" : reviewCount ? `${reviewCount} item${reviewCount > 1 ? "s" : ""} check karna hai` : undefined;

  const submitItems = () => {
    if (!trimmed) return;
    if (isBarcode) {
      const hit = catalogue.find((p) => p.barcode === trimmed);
      if (hit) addProduct(hit.id, "scan"); else setError("Barcode catalogue mein nahi mila.");
    } else if (isList || results.length === 0) addText(trimmed);
    else if (results.length === 1 || matchProduct(trimmed, catalogue).needsReview === false) addProduct(results[0].id);
    else addText(trimmed);
  };

  return (
    <>
      <ScreenHead title="Counter" subtitle={bill ? "Bill ban raha hai" : "Naya bill, aapke tareeke se"}>
        {bill && <span className="badge tone-neutral shrink-0 tabular-nums">Bill #{bill.number}</span>}
      </ScreenHead>

      {!lines.length && today && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success-tint text-success"><TrendingUp className="!h-[18px] !w-[18px]" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">Aaj ki bikri</p>
            <p className="caption truncate text-muted" title={today.source}>Source: bill register</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold leading-6 text-navy-950 tabular-nums">{formatMoney(today.totalPaise)}</p>
            <p className="caption text-muted tabular-nums">{today.bills} bills</p>
          </div>
        </div>
      )}

      <InputModeTabs value={mode} onChange={setMode} icons={{ Parchi: <FileText aria-hidden="true" />, Bolkar: <Mic aria-hidden="true" />, Items: <Search aria-hidden="true" /> }} />

      <div className="mt-4">
        {mode === "Items" ? (
          <form className="card" onSubmit={(e) => { e.preventDefault(); submitItems(); }}>
            <label htmlFor="counter-search" className="sr-only">Item, list ya barcode</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                {isBarcode ? <ScanBarcode className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" /> : <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />}
                <input id="counter-search" className="field pl-11" autoComplete="off" placeholder="doodh… ya 2 doodh, 1 bread"
                  value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary w-12 px-0" aria-label={isList ? "Add list" : "Add"} disabled={!trimmed || pending}><Plus aria-hidden="true" /></button>
            </div>
            <p className="caption mt-2 text-muted">
              {isBarcode ? "Barcode · Enter dabaiye" : isList ? "List: har item catalogue se match hoga. Jo pakka nahi, woh aap chunenge." : "Naam, poori list, ya scanner se barcode."}
            </p>

            {(results.length > 0 || !query) && (
              <>
                {!query && <p className="section-label mt-4">Roz ke items</p>}
                <ul className="-mx-2 mt-2">
                  {(query ? results : quick).map((p) => {
                    const s = stockLabel(p);
                    return (
                      <li key={p.id}>
                        <button type="button" disabled={pending} onClick={() => addProduct(p.id)} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-canvas">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium leading-6">{p.name}</p>
                            <p className="mt-0.5 flex items-center gap-2"><MoneyText paise={p.pricePaise} size="sm" /><span className={`badge ${s.tone}`}>{s.text}</span></p>
                          </div>
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-blue-600/30 text-blue-600"><Plus className="!h-[18px] !w-[18px]" aria-hidden="true" /></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </form>
        ) : mode === "Parchi" ? (
          <ParchiPanel caps={ai} ensureBill={ensureBill} onResult={onInputResult} compact={lines.length > 0} />
        ) : (
          <VoicePanel caps={ai} ensureBill={ensureBill} onResult={onInputResult} />
        )}
      </div>

      {error && <div className="mt-4"><ErrorBanner message={error} /></div>}
      {unmatched.length > 0 && (
        <p className="mt-4 rounded-2xl bg-warning-tint p-3 text-sm text-warning" role="status">
          Catalogue mein nahi mila: {unmatched.join(", ")}. Items tab se search karke add karein.
        </p>
      )}

      {lines.length > 0 && (
        <section aria-label="Bill" className="mt-6" aria-busy={pending}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="section-label">Bill items</p>
            {note && <span className="caption text-muted" role="status">{note}</span>}
          </div>
          <div className="space-y-3">
            {flagged.map((l) => (
              <BillLine key={l.id} busy={pending}
                line={{ name: l.name, raw: l.rawText ?? l.name, qty: l.qty, pricePaise: null, state: "needs-check", candidates: l.candidates }}
                onQuantity={(d) => patchLine(l.id, { qty: l.qty + d })} onChoose={(productId) => patchLine(l.id, { productId })} onRemove={() => removeLine(l.id)} />
            ))}
            {clean.length > 0 && (
              <div className="list-card">
                {clean.map((l) => (
                  <BillLine key={l.id} busy={pending} line={{ name: l.name, qty: l.qty, pricePaise: l.unitPricePaise, state: "confirmed" }}
                    onQuantity={(d) => patchLine(l.id, { qty: l.qty + d })} onRemove={() => removeLine(l.id)} />
                ))}
              </div>
            )}
          </div>
          <p className="caption mt-2 text-muted">Daam catalogue se aate hain, AI se nahi. Stock confirm ke baad hi badlega.</p>
          <div className="h-28" aria-hidden="true" />
          <BillSummary sticky count={bill?.itemCount ?? 0} total={bill?.totalPaise ?? 0} disabledReason={disabledReason} onConfirm={confirm} busy={pending} />
        </section>
      )}
    </>
  );
}

function Confirmed({ bill, onNew, onlineMode }: { bill: BillView; onNew: () => void; onlineMode: OnlineMode }) {
  const [settled, setSettled] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <ScreenHead title="Counter" subtitle={settled ? "Bill poora hua" : "Payment lijiye"} />
      <section className="hero p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm text-on-dark-muted"><CheckCircle2 className="!h-4 !w-4" aria-hidden="true" />Bill #{bill.number} · {settled ?? "confirmed"}</p>
            <button type="button" className="mt-1 flex items-center gap-1 text-sm font-medium text-surface" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {bill.itemCount} items{open ? "" : " dekhiye"}<ChevronDown className={`!h-4 !w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
          </div>
          <span className="text-[28px] font-bold leading-9 tracking-tight tabular-nums">{formatMoney(bill.totalPaise)}</span>
        </div>
        {open && (
          <ul className="mt-3 divide-y divide-white/10 border-t border-white/10">
            {bill.lines.map((l) => (
              <li key={l.id} className="flex justify-between gap-3 py-2.5 text-sm">
                <span>{l.name} <span className="text-on-dark-muted tabular-nums">× {l.qty}</span></span>
                <MoneyText paise={l.lineTotalPaise} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </section>
      <PaymentPanel bill={bill} onlineMode={onlineMode} onNewBill={onNew} onSettled={setSettled} />
    </>
  );
}

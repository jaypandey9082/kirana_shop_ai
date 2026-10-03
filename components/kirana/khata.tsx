"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, BellRing, HandCoins, LoaderCircle, Search } from "lucide-react";
import { Button, EmptyState, ErrorBanner, ScreenHead, Sheet, Skeleton } from "@/components/ui/primitives";
import { ActionCard, KhataRow, MoneyText, SourceLine } from "./components";
import { actionState, useActions } from "./salaahkaar";
import { formatMoney } from "@/lib/format-money";
import type { KhataOverview, LedgerEntry } from "@/lib/khata";
import type { ActionView } from "@/lib/salaahkaar/tools";

interface Ledger { customer: { id: string; name: string }; balancePaise: number; daysOverdue: number; entries: LedgerEntry[] }
const date = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const timeOf = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : undefined);

export function KhataScreen() {
  const [data, setData] = useState<KhataOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/khata");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json.khata);
      setError(null);
    } catch {
      setError("Khata load nahi hua.");
    }
  }, []);
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);

  const [q, setQ] = useState("");
  const match = (name: string) => name.toLowerCase().includes(q.trim().toLowerCase());
  const overdue = data?.customers.filter((c) => c.bucket === "30+" && match(c.name)) ?? [];
  const rest = data?.customers.filter((c) => c.bucket !== "30+" && match(c.name)) ?? [];
  const total = data?.totalPaise ?? 0;
  const share = (paise: number) => (total ? `${Math.max(2, (paise / total) * 100)}%` : "0%");
  const row = (c: KhataOverview["customers"][number]) => (
    <button key={c.customerId} type="button" className="block w-full text-left transition-colors hover:bg-canvas" onClick={() => setOpen(c.customerId)}>
      <KhataRow name={c.name} ageing={c.bucket} balance={c.balancePaise} days={c.daysOverdue} />
    </button>
  );
  return (
    <>
      <ScreenHead title="Khata" />
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}
      <section className="hero mb-5">
        <p className="text-sm text-on-dark-muted">Total lena hai</p>
        <div className="mt-1"><MoneyText paise={data?.totalPaise ?? null} size="display" /></div>
        {data && (
          <>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
              <span className="bg-danger-400" style={{ width: share(data.buckets["30+"]) }} />
              <span className="bg-warning-line" style={{ width: share(data.buckets["16–30"]) }} />
              <span className="bg-sky-500" style={{ width: share(data.buckets["0–15"]) }} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              {([["30+", "30+ din", "bg-danger-400"], ["16–30", "16–30 din", "bg-warning-line"], ["0–15", "Naya", "bg-sky-500"]] as const).map(([k, label, dot]) => (
                <div key={k}>
                  <dt className="flex items-center gap-1.5 text-xs text-on-dark-muted"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{formatMoney(data.buckets[k])}</dd>
                </div>
              ))}
            </dl>
            <p className="caption mt-4 border-t border-white/10 pt-3 text-on-dark-muted">{data.customers.length} customers · Source: {data.source.split(" · ")[0]}</p>
          </>
        )}
      </section>
      {!data && !error && <Skeleton rows={4} />}
      {data && data.customers.length === 0 && <EmptyState title="Koi udhaar baaki nahi" description="Counter se udhaar bills yahan dikhenge." />}
      {data && data.customers.length > 0 && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input className="field pl-11" placeholder="Customer dhoondhiye" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
        </div>
      )}
      {overdue.length > 0 && <><p className="section-label mb-2 text-danger">Pehle yeh collect karein</p><div className="list-card mb-5">{overdue.map(row)}</div></>}
      {rest.length > 0 && <><p className="section-label mb-2">Baaki sab</p><div className="list-card">{rest.map(row)}</div></>}
      {data && q && !overdue.length && !rest.length && <p className="secondary py-6 text-center">“{q}” naam ka customer nahi mila.</p>}
      {open && <CustomerSheet id={open} onClose={() => { setOpen(null); void load(); }} />}
    </>
  );
}

function CustomerSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActionView | null>(null);
  const { actions, put, decide, error: actionError } = useActions();

  useEffect(() => {
    fetch(`/api/khata/${id}`).then((r) => r.json()).then((d) => { setLedger(d.ledger); setAmount(String(d.ledger.balancePaise / 100)); }).catch(() => setError("Ledger load nahi hua."));
  }, [id]);

  const settle = async () => {
    const paise = Math.round(Number(amount) * 100);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/khata/${id}/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountPaise: paise, method: "cash" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Save nahi hua.");
      setLedger(d.ledger);
      setAmount(String(d.ledger.balancePaise / 100));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save nahi hua.");
    } finally {
      setBusy(false);
    }
  };

  const remind = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/khata/${id}/remind`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Draft nahi bana.");
      put(d.action);
      setDraft(d.action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft nahi bana.");
    } finally {
      setBusy(false);
    }
  };

  const current = draft ? actions[draft.id] ?? draft : null;
  return (
    <Sheet title={ledger?.customer.name ?? "Khata"} open onClose={onClose}>
      {!ledger ? <div className="space-y-3"><div className="skeleton h-20" /><div className="skeleton h-32" /></div> : (
        <div className="space-y-4">
          <div className={`rounded-2xl p-4 ${ledger.balancePaise > 0 ? "bg-canvas" : "bg-success-tint"}`}>
            <div className="flex items-end justify-between gap-3">
              <div><p className="caption text-muted">Baaki</p><MoneyText paise={ledger.balancePaise} size="display" /></div>
              {ledger.balancePaise > 0 ? <span className={`badge ${ledger.daysOverdue > 30 ? "tone-danger" : ledger.daysOverdue > 15 ? "tone-warning" : "tone-neutral"}`}>{ledger.daysOverdue} din purana</span> : <span className="badge tone-success">Hisaab saaf</span>}
            </div>
          </div>
          {ledger.balancePaise > 0 && (
            <>
              <form onSubmit={(e) => { e.preventDefault(); void settle(); }}>
                <label className="section-label" htmlFor="settle-amount">Kitna mila?</label>
                <div className="mt-2 flex gap-2">
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-muted">₹</span>
                    <input id="settle-amount" className="field pl-8 font-semibold tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
                  </div>
                  <Button type="submit" className="shrink-0 whitespace-nowrap" disabled={busy || !Number(amount)}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <HandCoins aria-hidden="true" />}Cash mila</Button>
                </div>
                <p className="caption mt-2 text-muted">Aapne record kiya · gateway verified nahi</p>
              </form>
              {!current && <Button variant="secondary" className="w-full" disabled={busy} onClick={remind}><BellRing aria-hidden="true" />Reminder draft banaiye</Button>}
              {current && (
                <ActionCard kind="reminder" title={current.title} draft={current.draft} state={actionState(current)} via={current.deliveredVia}
                  onApprove={() => decide(current.id, "approve")} onReject={() => decide(current.id, "reject")}
                  timestamps={{ approved: timeOf(current.decidedAt), done: timeOf(current.executedAt) }} />
              )}
            </>
          )}
          {(error || actionError) && <ErrorBanner message={(error || actionError)!} />}
          <div>
            <p className="section-label mb-2">Hisaab</p>
            <ul className="max-h-64 overflow-y-auto rounded-2xl border border-line">
              {ledger.entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 border-b border-line px-4 py-3 text-sm last:border-0">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${e.type === "credit" ? "bg-success-tint text-success" : "bg-canvas text-muted"}`}>
                    {e.type === "credit" ? <ArrowDownLeft className="!h-4 !w-4" aria-hidden="true" /> : <ArrowUpRight className="!h-4 !w-4" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{e.type === "debit" ? `Udhaar${e.billNumber ? ` · bill #${e.billNumber}` : ""}` : e.note ?? "Payment"}</span>
                    <span className="caption text-muted">{date(e.createdAt)}</span>
                  </span>
                  <MoneyText paise={e.amountPaise} size="sm" tone={e.type === "credit" ? "success" : "default"} />
                </li>
              ))}
            </ul>
            <SourceLine source="Khata ledger" />
          </div>
        </div>
      )}
    </Sheet>
  );
}

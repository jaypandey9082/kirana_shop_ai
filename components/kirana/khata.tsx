"use client";
import { useCallback, useEffect, useState } from "react";
import { BellRing, HandCoins, LoaderCircle } from "lucide-react";
import { Button, EmptyState, ErrorBanner, Sheet } from "@/components/ui/primitives";
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

  const overdue = data?.customers.filter((c) => c.bucket === "30+") ?? [];
  const rest = data?.customers.filter((c) => c.bucket !== "30+") ?? [];
  return (
    <>
      <h1>Khata</h1>
      <p className="secondary mb-6 mt-1">Udhaar ka saaf hisaab.</p>
      {error && <ErrorBanner message={error} onRetry={load} />}
      <section className="mb-6 rounded-xl bg-navy-950 p-6 text-surface">
        <h2 className="text-sm font-normal text-on-dark-muted">Total to collect</h2>
        <div className="my-3"><MoneyText paise={data?.totalPaise ?? null} size="display" /></div>
        {data && (
          <div className="flex flex-wrap gap-2">
            {data.buckets["30+"] > 0 && <span className="badge bg-danger-tint text-danger">{formatMoney(data.buckets["30+"])} · 30+ days</span>}
            {data.buckets["16–30"] > 0 && <span className="badge bg-warning-tint text-warning">{formatMoney(data.buckets["16–30"])} · 16–30 days</span>}
            <span className="badge bg-navy-700 text-surface">{formatMoney(data.buckets["0–15"])} · recent</span>
          </div>
        )}
        {data && <p className="caption mt-3 text-on-dark-muted">{data.customers.length} customers · {data.source}</p>}
      </section>
      {data && data.customers.length === 0 && <EmptyState title="Koi udhaar baaki nahi" description="Udhaar bills from the Counter appear here." />}
      {overdue.length > 0 && <><p className="section-label mb-1">Collect first</p><ul className="card mb-6 py-0">{overdue.map((c) => <li key={c.customerId}><button type="button" className="w-full text-left" onClick={() => setOpen(c.customerId)}><KhataRow name={c.name} ageing={c.bucket} balance={c.balancePaise} /></button></li>)}</ul></>}
      {rest.length > 0 && <><p className="section-label mb-1">Baaki sab</p><ul className="card py-0">{rest.map((c) => <li key={c.customerId}><button type="button" className="w-full text-left" onClick={() => setOpen(c.customerId)}><KhataRow name={c.name} ageing={c.bucket} balance={c.balancePaise} /></button></li>)}</ul></>}
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
      {!ledger ? <p className="secondary">Loading…</p> : (
        <div className="space-y-4">
          <div className="flex items-end justify-between">
            <div><p className="caption text-muted">Baaki</p><MoneyText paise={ledger.balancePaise} size="display" /></div>
            {ledger.balancePaise > 0 && <span className="caption text-muted">{ledger.daysOverdue} din purana</span>}
          </div>
          {ledger.balancePaise > 0 && (
            <>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void settle(); }}>
                <label className="sr-only" htmlFor="settle-amount">Amount received in rupees</label>
                <input id="settle-amount" className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
                <Button type="submit" className="shrink-0 whitespace-nowrap" disabled={busy || !Number(amount)}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <HandCoins aria-hidden="true" />}Cash mila</Button>
              </form>
              <p className="caption -mt-2 text-muted">Recorded by you, not verified by a gateway.</p>
              {!current && <Button variant="secondary" className="w-full" disabled={busy} onClick={remind}><BellRing aria-hidden="true" />Reminder draft banaiye</Button>}
              {current && (
                <ActionCard title={current.title} draft={current.draft} state={actionState(current)} via={current.deliveredVia}
                  onApprove={() => decide(current.id, "approve")} onReject={() => decide(current.id, "reject")}
                  timestamps={{ approved: timeOf(current.decidedAt), done: timeOf(current.executedAt) }} />
              )}
            </>
          )}
          {(error || actionError) && <ErrorBanner message={(error || actionError)!} />}
          <div>
            <p className="section-label mb-1">Hisaab</p>
            <ul className="max-h-60 divide-y divide-line overflow-y-auto">
              {ledger.entries.map((e) => (
                <li key={e.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span>{date(e.createdAt)} · {e.type === "debit" ? `Udhaar${e.billNumber ? ` (bill #${e.billNumber})` : ""}` : e.note ?? "Payment"}</span>
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

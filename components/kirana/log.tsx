"use client";
import { useEffect, useState } from "react";
import { EmptyState, ErrorBanner } from "@/components/ui/primitives";
import { EventLogItem } from "./components";

interface LogEvent { id: number; type: string; summary: string; verified: boolean; createdAt: string }
const FILTERS = ["All", "Payments", "Bills", "Stock", "Khata", "Actions"] as const;
type Filter = typeof FILTERS[number];

function groupOf(type: string): Filter {
  if (type.startsWith("payment.")) return "Payments";
  if (type === "bill.on_credit" || type.startsWith("khata.")) return "Khata";
  if (type.startsWith("bill.")) return "Bills";
  if (type.startsWith("stock.")) return "Stock";
  if (type.startsWith("action.")) return "Actions";
  return "All";
}
const time = (iso: string) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** Append-only event log, refreshed every 3 seconds. Newest first. */
export function LiveLog() {
  const [events, setEvents] = useState<LogEvent[] | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [error, setError] = useState(false);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const res = await fetch("/api/events");
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!stop) { setEvents(data.events); setError(false); }
      } catch { if (!stop) setError(true); }
      if (!stop) timer = setTimeout(load, 3000);
    };
    void load();
    return () => { stop = true; clearTimeout(timer); };
  }, []);

  const shown = (events ?? []).filter((e) => filter === "All" || groupOf(e.type) === filter);
  return (
    <>
      <h1>Live log</h1>
      <p className="secondary mb-6 mt-1">Every business event, in order. Verified = confirmed by a payment gateway.</p>
      <div role="group" aria-label="Event filters" className="mb-6 grid grid-cols-3 gap-2">
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`btn min-h-12 px-2 text-sm ${filter === f ? "bg-navy-950 text-surface" : "btn-quiet"}`}>{f}</button>
        ))}
      </div>
      {error && <div className="mb-4"><ErrorBanner message="Log refresh nahi hua. Retrying…" /></div>}
      {events === null ? <p className="secondary">Loading…</p> : shown.length === 0 ? (
        <EmptyState title="Abhi koi event nahi" description="Bills, payments and stock changes will appear here as they happen." />
      ) : (
        <div className="card space-y-1" aria-live="polite">
          {shown.map((e) => <EventLogItem key={e.id} name={e.type} summary={e.summary} timestamp={time(e.createdAt)} verified={e.verified} />)}
        </div>
      )}
    </>
  );
}

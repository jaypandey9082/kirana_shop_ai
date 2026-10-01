"use client";
import { useEffect, useState } from "react";
import { EmptyState, ErrorBanner } from "@/components/ui/primitives";
import { EventLogItem } from "./components";

interface LogEvent { id: number; type: string; summary: string; verified: boolean; createdAt: string }
interface OutboxItem { id: string; channel: string; recipient: string; body: string; link: string | null; deliveredVia: string; createdAt: string }
const FILTERS = ["All", "Payments", "Bills", "Stock", "Khata", "Actions", "Outbox"] as const;
type Filter = typeof FILTERS[number];

function groupOf(type: string): Filter {
  if (type.startsWith("payment.")) return "Payments";
  if (type === "bill.on_credit" || type.startsWith("khata.")) return "Khata";
  if (type.startsWith("bill.")) return "Bills";
  if (type.startsWith("stock.")) return "Stock";
  if (type.startsWith("action.") || type.startsWith("salaahkaar.")) return "Actions";
  return "All";
}
const time = (iso: string) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** Append-only event log, refreshed every 3 seconds. Newest first. */
export function LiveLog() {
  const [events, setEvents] = useState<LogEvent[] | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [error, setError] = useState(false);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const res = await fetch("/api/events");
        if (!res.ok) throw new Error();
        const data = await res.json();
        const ob = await fetch("/api/outbox").then((r) => r.json()).catch(() => ({ outbox: [] }));
        if (!stop) { setEvents(data.events); setOutbox(ob.outbox ?? []); setError(false); }
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
      <div role="group" aria-label="Event filters" className="mb-6 grid grid-cols-4 gap-2">
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`btn min-h-12 px-2 text-sm ${filter === f ? "bg-navy-950 text-surface" : "btn-quiet"}`}>{f}</button>
        ))}
      </div>
      {error && <div className="mb-4"><ErrorBanner message="Log refresh nahi hua. Retrying…" /></div>}
      {filter === "Outbox" ? (
        outbox.length === 0 ? <EmptyState title="Outbox khaali hai" description="Approved reorders and reminders appear here, ready to send." /> : (
          <div className="space-y-3">
            {outbox.map((o) => (
              <div key={o.id} className="card">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{o.recipient}</p>
                  <span className={`badge ${o.deliveredVia === "n8n" ? "tone-staging" : "tone-neutral"}`}>{o.deliveredVia}</span>
                </div>
                <p className="secondary mt-2">{o.body}</p>
                <p className="caption mt-2 text-muted">{o.channel === "supplier_message" ? "Supplier message" : "Customer reminder"} · {time(o.createdAt)} · not auto-sent</p>
                {o.link && <a className="btn btn-secondary mt-3 w-full" href={o.link} target="_blank" rel="noreferrer">WhatsApp draft kholiye</a>}
              </div>
            ))}
          </div>
        )
      ) : events === null ? <p className="secondary">Loading…</p> : shown.length === 0 ? (
        <EmptyState title="Abhi koi event nahi" description="Bills, payments and stock changes will appear here as they happen." />
      ) : (
        <div className="card space-y-1" aria-live="polite">
          {shown.map((e) => <EventLogItem key={e.id} name={e.type} summary={e.summary} timestamp={time(e.createdAt)} verified={e.verified} />)}
        </div>
      )}
    </>
  );
}

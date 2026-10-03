"use client";
import { useEffect, useState } from "react";
import { Activity, BadgeCheck, BellRing, CheckCircle2, CreditCard, ExternalLink, Mic, NotebookPen, Package, PackageCheck, ReceiptText, Send, ShoppingBag, Truck, type LucideIcon } from "lucide-react";
import { EmptyState, ErrorBanner, ScreenHead, Skeleton } from "@/components/ui/primitives";
import { EventLogItem } from "./components";

interface LogEvent { id: number; type: string; summary: string; verified: boolean; createdAt: string }
interface OutboxItem { id: string; channel: string; recipient: string; body: string; link: string | null; deliveredVia: string; createdAt: string }
const FILTERS = ["All", "Payments", "Bills", "Stock", "Khata", "Actions", "Outbox"] as const;
type Filter = typeof FILTERS[number];

function groupOf(type: string): Filter {
  if (type.startsWith("payment.")) return "Payments";
  if (type === "bill.on_credit" || type.startsWith("khata.")) return "Khata";
  if (type.startsWith("bill.") || type.startsWith("parchi.")) return "Bills";
  if (type.startsWith("stock.") || type.startsWith("po.") || type.startsWith("supplier.")) return "Stock";
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
      <ScreenHead title="Live log">
        <span className="badge tone-success shrink-0"><span className="pulse h-1.5 w-1.5 rounded-full bg-success-500" aria-hidden="true" />Live</span>
      </ScreenHead>
      <div role="group" aria-label="Event filters" className="chip-row mb-4">
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className="chip">
            {f}{f === "Outbox" && outbox.length > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[11px] text-surface tabular-nums">{outbox.length}</span>}
          </button>
        ))}
      </div>
      {error && <div className="mb-4"><ErrorBanner message="Log refresh nahi hua. Retrying…" /></div>}
      {filter === "Outbox" ? (
        outbox.length === 0 ? <EmptyState icon={Send} title="Outbox khaali hai" description="Approved reorders aur reminders yahan aate hain, bhejne ke liye ready." /> : (
          <div className="space-y-3">
            {outbox.map((o) => (
              <div key={o.id} className="card">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-blue-600">{o.channel === "supplier_message" ? <Truck aria-hidden="true" /> : <BellRing aria-hidden="true" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-navy-950">{o.recipient}</p>
                    <p className="caption text-muted">{o.channel === "supplier_message" ? "Supplier message" : "Customer reminder"} · {time(o.createdAt)}</p>
                  </div>
                  <span className={`badge ${o.deliveredVia === "n8n" ? "tone-staging" : "tone-neutral"}`}>{o.deliveredVia}</span>
                </div>
                <p className="mt-3 rounded-xl bg-canvas p-3 text-sm leading-6">{o.body}</p>
                <p className="caption mt-2 text-muted">Not auto-sent · aap khud bhejiye</p>
                {o.link && <a className="btn btn-secondary mt-3 w-full" href={o.link} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />WhatsApp draft kholiye</a>}
              </div>
            ))}
          </div>
        )
      ) : events === null ? <Skeleton rows={4} /> : shown.length === 0 ? (
        <EmptyState icon={Activity} title="Abhi koi event nahi" description="Bills, payments aur stock changes yahan turant dikhenge." />
      ) : (
        <div className="card relative px-3 py-1" aria-live="polite">
          <span className="absolute bottom-6 left-[32px] top-6 w-px bg-line" aria-hidden="true" />
          {shown.map((e) => {
            const v = visual(e.type, e.verified);
            return <EventLogItem key={e.id} name={e.type} summary={e.summary} timestamp={time(e.createdAt)} verified={e.verified} tone={v.tone} icon={<v.Icon className="!h-4 !w-4" aria-hidden="true" />} />;
          })}
        </div>
      )}
    </>
  );
}

function visual(type: string, verified: boolean): { Icon: LucideIcon; tone: "neutral" | "success" | "info" | "warning" } {
  if (type === "bill.paid" || verified) return { Icon: BadgeCheck, tone: "success" };
  if (type.startsWith("payment.")) return { Icon: CreditCard, tone: type.endsWith("failed") || type.endsWith("rejected") ? "warning" : "info" };
  if (type === "stock.received") return { Icon: PackageCheck, tone: "success" };
  if (type.startsWith("po.") || type.startsWith("supplier.")) return { Icon: Truck, tone: type === "po.rejected" ? "warning" : "info" };
  if (type.startsWith("stock.")) return { Icon: Package, tone: "neutral" };
  if (type === "bill.on_credit" || type.startsWith("khata.")) return { Icon: NotebookPen, tone: "warning" };
  if (type.startsWith("bill.") || type.startsWith("parchi.")) return { Icon: ReceiptText, tone: "info" };
  if (type.startsWith("salaahkaar.")) return { Icon: Mic, tone: "info" };
  if (type.startsWith("action.")) return { Icon: type.endsWith("executed") ? CheckCircle2 : Send, tone: type.endsWith("executed") ? "success" : "neutral" };
  if (type.startsWith("order.")) return { Icon: ShoppingBag, tone: "info" };
  return { Icon: Activity, tone: "neutral" };
}

"use client";
import { useEffect, useId, useRef } from "react";
import { Check, LoaderCircle, Mic, Minus, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/format-money";

export function MoneyText({ paise, size = "md", strike = false, tone = "default" }: { paise: number | null; size?: "sm" | "md" | "display"; strike?: boolean; tone?: "default" | "success" | "danger" }) {
  return <span aria-label={paise === null ? "Amount unavailable" : undefined} className={`tabular-nums ${size === "display" ? "display-amount" : size === "sm" ? "text-sm" : "text-lg font-semibold"} ${strike ? "line-through" : ""} ${tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : ""}`}>{formatMoney(paise)}</span>;
}
export const inputModes = ["Scan", "Photo", "Voice", "Parchi", "Manual"] as const;
export type InputMode = typeof inputModes[number];
export function InputModeTabs({ value, onChange }: { value: InputMode; onChange: (mode: InputMode) => void }) {
  return <div role="group" aria-label="Bill input method" className="flex gap-2">{inputModes.map(mode => <button key={mode} type="button" aria-pressed={value === mode} onClick={() => onChange(mode)} className={`min-h-12 min-w-12 flex-1 rounded-sm text-xs font-semibold ${value === mode ? "bg-navy-950 text-surface" : "bg-surface text-muted"}`}>{mode}</button>)}</div>;
}
export interface BillLineData {
  name: string; qty: number | null; pricePaise: number | null; state: "confirmed" | "needs-check";
  reason?: string; candidates?: ReadonlyArray<{ id: string; label: string }>;
}
export function BillLine({ line, onQuantity, onChoose, onRemove, busy = false }: {
  line: BillLineData; onQuantity?: (delta: number) => void; onChoose?: (id: string) => void; onRemove?: () => void; busy?: boolean;
}) {
  const total = line.qty !== null && line.pricePaise !== null ? line.qty * line.pricePaise : null;
  const check = line.state === "needs-check";
  return (
    <div className={`rounded-lg p-4 ${check ? "border-[1.5px] border-dashed border-warning-line bg-warning-tint" : "border border-line bg-surface"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words">{line.name}</h3>
          <p className="secondary tabular-nums">{line.qty ?? "—"} × <MoneyText paise={line.pricePaise} size="sm" /></p>
        </div>
        <MoneyText paise={check ? null : total} />
      </div>
      {check && (
        <>
          <p className="mt-3 text-sm text-warning">{line.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {line.candidates?.map((c) => (
              <Button key={c.id} variant="quiet" disabled={!onChoose || busy} onClick={() => onChoose?.(c.id)}>{c.label}</Button>
            ))}
          </div>
        </>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        {onRemove ? <Button variant="quiet" aria-label={`Remove ${line.name}`} disabled={busy} onClick={onRemove}><Trash2 aria-hidden="true" /></Button> : <span />}
        <div className="flex items-center gap-2">
          <Button variant="quiet" aria-label={`Decrease ${line.name} quantity`} disabled={busy || !onQuantity || line.qty === null || line.qty <= 1} onClick={() => onQuantity?.(-1)}><Minus aria-hidden="true" /></Button>
          <span aria-label="Quantity" className="min-w-10 text-center font-semibold tabular-nums">{line.qty ?? "—"}</span>
          <Button variant="quiet" aria-label={`Increase ${line.name} quantity`} disabled={busy || !onQuantity || line.qty === null || line.qty >= 99} onClick={() => onQuantity?.(1)}><Plus aria-hidden="true" /></Button>
        </div>
      </div>
    </div>
  );
}
export function BillSummary({ count, total, disabledReason, onConfirm, sticky = false, label = "Confirm bill", busy = false }: {
  count: number | null; total: number | null; disabledReason?: string; onConfirm?: () => void; sticky?: boolean; label?: string; busy?: boolean;
}) {
  return (
    <div className={`border-t border-line bg-surface p-4 ${sticky ? "sticky bottom-[calc(81px+env(safe-area-inset-bottom))] z-10 -mx-4 shadow-raised" : "rounded-lg"}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="secondary tabular-nums">{count === null ? "Items unavailable" : `${count} item${count === 1 ? "" : "s"}`}</span>
        <MoneyText paise={total} size="display" />
      </div>
      <Button className="w-full" disabled={!!disabledReason || !onConfirm || busy} onClick={onConfirm}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : null}{label}</Button>
      {disabledReason && <p className="caption mt-2 text-warning">{disabledReason}</p>}
    </div>
  );
}
export type PaymentState = "created" | "waiting" | "verifying" | "paid" | "failed" | "mock";
const paymentLabels: Record<PaymentState, string> = { created: "Created", waiting: "Waiting for customer", verifying: "Verifying with Paytm", paid: "Paid", failed: "Failed", mock: "Mock payment · not a real Paytm transaction" };
export function PaymentStatus({ state, orderId }: { state: PaymentState; orderId: string | null }) {
  const steps: PaymentState[] = ["created", "waiting", "verifying", "paid"];
  const current = steps.indexOf(state);
  return <div className="card" aria-live="polite"><ol className="space-y-3">{steps.map((step, i) => <li key={step} className={`flex items-center gap-3 text-sm ${i === current ? "font-semibold text-navy-950" : "text-muted"}`} aria-current={step === state ? "step" : undefined}><span className={`grid h-6 w-6 place-items-center rounded-full ${i <= current ? "bg-success-tint text-success" : "bg-canvas"}`}>{step === "verifying" && state === step ? <LoaderCircle className="spin" aria-hidden="true" /> : i < current || state === "paid" ? <Check aria-hidden="true" /> : <span className="h-2 w-2 rounded-full bg-line" />}</span>{paymentLabels[step]}</li>)}</ol>{(state === "failed" || state === "mock") && <p className={`mt-4 rounded-sm p-2 text-sm ${state === "failed" ? "tone-danger" : "tone-warning"}`}>{paymentLabels[state]}</p>}<p className="caption mt-4 break-all text-muted">Order ID: {orderId ?? "Unavailable · preview only"}</p></div>;
}
export function PaidToast({ amount, time, preview = false, note }: { amount: number | null; time: string | null; preview?: boolean; note?: string }) {
  return <div role="status" aria-live="polite" className="flex gap-3 rounded-xl bg-navy-950 p-4 text-surface"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success-tint text-success"><Check aria-hidden="true" /></span><div><p className="text-lg font-semibold"><MoneyText paise={amount} /> prapt hue</p><p className="caption mt-1 text-on-dark-muted">{note ?? (preview ? "Verified state preview · no payment received" : `Verified by server · ${time ?? "Time unavailable"}`)}</p></div></div>;
}
export function StockDelta({ name, before, after, reorderLevel }: { name: string; before: number | null; after: number | null; reorderLevel: number | null }) {
  const low = after !== null && reorderLevel !== null && after < reorderLevel;
  return <p className={`rounded-sm p-3 text-sm tabular-nums ${low ? "tone-danger" : "tone-neutral"}`}>{name} · {before ?? "—"} → {after ?? "—"}{low ? " · Low stock" : ""}</p>;
}
export function SourceLine({ source }: { source: string }) { return <p className="caption mt-4 border-t border-line pt-3 text-muted">Source: {source}</p>; }
export function InsightCard({ headline, facts = [], source, fresh = false }: { headline: string; facts?: readonly string[]; source: string; fresh?: boolean }) {
  return <div className="card" aria-live="polite">{fresh && <span className="badge tone-staging mb-3">Naya</span>}<h3 className="text-lg">{headline}</h3>{facts.slice(0, 3).map(fact => <p className="secondary mt-2" key={fact}>{fact}</p>)}<SourceLine source={source} /></div>;
}
export type ActionState = "pending" | "approved" | "sent" | "done" | "rejected";
export function ActionCard({ title, draft, state, onApprove, onReject, timestamps }: { title: string; draft: string; state: ActionState; onApprove?: () => void; onReject?: () => void; timestamps?: Partial<Record<ActionState, string>> }) {
  if (state === "rejected") return <p className="rounded-lg border border-line p-4 text-sm text-muted">{title} · Not now</p>;
  return <div className="card"><h3>{title}</h3><blockquote className="my-4 border-l-2 border-line pl-3 text-sm text-muted">“{draft}”</blockquote>{state === "pending" ? <><span className="badge tone-warning">Pending approval</span><div className="mt-4 flex gap-2"><Button onClick={onApprove} disabled={!onApprove} className="flex-1">Approve</Button><Button variant="secondary" onClick={onReject} disabled={!onReject} className="flex-1">Not now</Button></div></> : <ol className="space-y-2 text-sm">{(["approved", "sent", "done"] as const).map((step, i) => <li key={step} className={i <= ["approved", "sent", "done"].indexOf(state) ? "text-success" : "text-muted"}>{({ approved: "Approved", sent: "Sent to n8n", done: "Done" })[step]} · {timestamps?.[step] ?? "—"}</li>)}</ol>}</div>;
}
export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";
export function VoiceComposer({ state = "idle", disabled = false, value, onChange, onVoice, label = "Ask Salaahkaar", placeholder = "Poochiye… ya mic dabaiye", idleHint = "Tap or type to ask" }: { state?: VoiceState; disabled?: boolean; value: string; onChange: (value: string) => void; onVoice?: () => void; label?: string; placeholder?: string; idleHint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => { if (state === "error") input.current?.focus(); }, [state]);
  const buttonLabel = state === "speaking" ? "Stop speaking" : state === "listening" ? "Stop listening" : "Start voice input";
  return <div><label htmlFor={id} className="sr-only">{label}</label><div className="flex items-center gap-2"><input id={id} ref={input} className="field" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} /><button type="button" aria-label={buttonLabel} disabled={disabled || !onVoice} onClick={onVoice} className={`voice-button ${state === "listening" ? "pulse ring-4 ring-sky-100" : ""}`}>{state === "processing" ? <LoaderCircle className="spin" aria-hidden="true" /> : state === "speaking" || state === "listening" ? <span className="wave" aria-hidden="true"><span /><span /><span /><span /><span /></span> : <Mic aria-hidden="true" />}</button></div><p className={`caption mt-2 ${state === "error" ? "text-danger" : "text-muted"}`} role="status">{state === "error" ? "Mic nahi chala. Type karke poochiye." : disabled ? "Voice and answers are not connected yet." : state === "idle" ? idleHint : state === "listening" ? "Sun rahe hain… tap to stop" : state === "processing" ? "Samajh rahe hain…" : state}</p></div>;
}
export function ChatBubble({ hindi, romanisation }: { hindi: string; romanisation: string }) {
  return <div className="ml-6 rounded-xl rounded-br-sm bg-blue-600 p-4 text-surface"><p lang="hi">{hindi}</p><p className="mt-2 text-sm">{romanisation}</p></div>;
}
export function KhataRow({ name, ageing, balance }: { name: string; ageing: "0–15" | "16–30" | "30+"; balance: number | null }) {
  return <div className="flex items-center gap-3 border-b border-line py-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sky-100 text-blue-600">{name.split(" ").slice(0, 2).map(s => s[0]).join("")}</span><div className="min-w-0 flex-1"><p className="font-semibold">{name}</p><span className={`badge tabular-nums ${ageing === "30+" ? "tone-danger" : ageing === "16–30" ? "tone-warning" : "tone-neutral"}`}>{ageing} days</span></div><MoneyText paise={balance} /></div>;
}
export function EventLogItem({ name, summary, timestamp, verified }: { name: string; summary: string; timestamp: string | null; verified: boolean }) {
  return <div className="border-l-2 border-line py-3 pl-4 text-sm"><div className="flex flex-wrap items-center gap-2"><h3>{name}</h3>{verified && <span className="inline-flex items-center gap-1 text-success"><ShieldCheck aria-hidden="true" />Verified</span>}</div><p className="mt-2">{summary}</p><p className="mt-2 text-muted">{timestamp ?? "Time unavailable · preview only"}</p></div>;
}

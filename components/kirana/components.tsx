"use client";
import { useEffect, useId, useRef } from "react";
import { AlertTriangle, ArrowRight, BellRing, Check, CheckCircle2, ChevronRight, Database, LoaderCircle, Mic, Minus, Plus, Send, ShieldCheck, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/format-money";

export function MoneyText({ paise, size = "md", strike = false, tone = "default" }: { paise: number | null; size?: "sm" | "md" | "display"; strike?: boolean; tone?: "default" | "success" | "danger" }) {
  return <span aria-label={paise === null ? "Amount unavailable" : undefined} className={`tabular-nums ${size === "display" ? "display-amount" : size === "sm" ? "text-sm" : "text-[17px] font-semibold"} ${strike ? "line-through" : ""} ${tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : ""}`}>{formatMoney(paise)}</span>;
}

export const inputModes = ["Parchi", "Bolkar", "Items"] as const;
export type InputMode = typeof inputModes[number];
export function InputModeTabs({ value, onChange, icons }: { value: InputMode; onChange: (mode: InputMode) => void; icons?: Partial<Record<InputMode, React.ReactNode>> }) {
  return (
    <div role="group" aria-label="Bill input method" className="segmented">
      {inputModes.map((mode) => <button key={mode} type="button" aria-pressed={value === mode} onClick={() => onChange(mode)}>{icons?.[mode]}{mode}</button>)}
    </div>
  );
}

/** Quantity stepper. At 1, the minus becomes "remove" (as in quick-commerce apps). */
export function Stepper({ qty, name, onChange, onRemove, busy = false, max = 99, dark = false }: { qty: number | null; name: string; onChange?: (delta: number) => void; onRemove?: () => void; busy?: boolean; max?: number; dark?: boolean }) {
  const removing = qty === 1 && !!onRemove;
  return (
    <div className={`flex h-10 shrink-0 items-center rounded-full ${dark ? "bg-blue-600 text-surface" : "border border-line bg-surface text-navy-950"}`}>
      <button type="button" className="grid h-10 w-10 place-items-center rounded-full disabled:opacity-40" aria-label={removing ? `Remove ${name}` : `Decrease ${name} quantity`}
        disabled={busy || (!removing && (!onChange || qty === null || qty <= 1))} onClick={() => (removing ? onRemove!() : onChange?.(-1))}>
        {removing ? <Trash2 className="!h-[18px] !w-[18px]" aria-hidden="true" /> : <Minus className="!h-[18px] !w-[18px]" aria-hidden="true" />}
      </button>
      <span aria-label="Quantity" className="min-w-6 text-center text-[15px] font-semibold tabular-nums">{qty ?? "—"}</span>
      <button type="button" className="grid h-10 w-10 place-items-center rounded-full disabled:opacity-40" aria-label={`Increase ${name} quantity`}
        disabled={busy || !onChange || qty === null || qty >= max} onClick={() => onChange?.(1)}>
        <Plus className="!h-[18px] !w-[18px]" aria-hidden="true" />
      </button>
    </div>
  );
}

export interface BillLineData {
  name: string; qty: number | null; pricePaise: number | null; state: "confirmed" | "needs-check";
  /** What the parchi / voice said, shown on a line that needs a decision. */
  raw?: string;
  candidates?: ReadonlyArray<{ id: string; name: string; pricePaise: number | null }>;
}
export function BillLine({ line, onQuantity, onChoose, onRemove, busy = false }: {
  line: BillLineData; onQuantity?: (delta: number) => void; onChoose?: (id: string) => void; onRemove?: () => void; busy?: boolean;
}) {
  if (line.state === "needs-check") {
    return (
      <div className="rounded-2xl border-[1.5px] border-dashed border-warning-line bg-warning-tint p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-warning"><AlertTriangle className="!h-[18px] !w-[18px]" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-navy-950">“{line.raw ?? line.name}” — kaunsa?</p>
            <p className="caption mt-0.5 text-warning">Pakka nahi hai. Sahi product chuniye, phir bill confirm hoga.</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          {line.candidates?.map((c) => (
            <button key={c.id} type="button" disabled={!onChoose || busy} onClick={() => onChoose?.(c.id)}
              className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 text-left font-medium transition-colors hover:border-blue-600 disabled:opacity-60">
              <span className="min-w-0">{c.name}</span>
              <span className="flex items-center gap-2 text-sm text-muted tabular-nums">{formatMoney(c.pricePaise)}<ChevronRight className="!h-4 !w-4" aria-hidden="true" /></span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="caption text-muted">Quantity</span>
          <Stepper qty={line.qty} name={line.raw ?? line.name} onChange={onQuantity} onRemove={onRemove} busy={busy} />
        </div>
      </div>
    );
  }
  const total = line.qty !== null && line.pricePaise !== null ? line.qty * line.pricePaise : null;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-6">{line.name}</p>
        <p className="caption mt-0.5 text-muted tabular-nums">{formatMoney(line.pricePaise)} each · <span className="text-navy-950">{formatMoney(total)}</span></p>
      </div>
      <Stepper qty={line.qty} name={line.name} onChange={onQuantity} onRemove={onRemove} busy={busy} />
    </div>
  );
}

export function BillSummary({ count, total, disabledReason, onConfirm, sticky = false, label = "Confirm bill", busy = false }: {
  count: number | null; total: number | null; disabledReason?: string; onConfirm?: () => void; sticky?: boolean; label?: string; busy?: boolean;
}) {
  return (
    <div className={sticky ? "action-bar" : "card"}>
      {disabledReason && <p className="caption mb-2 flex items-center gap-1.5 text-warning"><AlertTriangle className="!h-3.5 !w-3.5" aria-hidden="true" />{disabledReason}</p>}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="caption text-muted tabular-nums">{count === null ? "Items unavailable" : `${count} item${count === 1 ? "" : "s"} · total`}</p>
          <p className="text-2xl font-bold leading-8 tracking-tight text-navy-950 tabular-nums">{formatMoney(total)}</p>
        </div>
        <Button className="min-w-40" disabled={!!disabledReason || !onConfirm || busy} onClick={onConfirm}>
          {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : null}{label}{!busy && <ArrowRight aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

export type PaymentState = "created" | "waiting" | "verifying" | "paid" | "failed" | "mock";
const paymentLabels: Record<PaymentState, string> = { created: "Order created", waiting: "Customer ka payment", verifying: "Server verification", paid: "Paid", failed: "Failed", mock: "Mock payment · not a real Paytm transaction" };
export function PaymentStatus({ state, orderId, provider }: { state: PaymentState; orderId: string | null; provider?: "paytm" | "mock" }) {
  const steps: PaymentState[] = ["created", "waiting", "verifying", "paid"];
  const current = state === "failed" ? 2 : state === "mock" ? 1 : steps.indexOf(state);
  const sub: Partial<Record<PaymentState, string>> = {
    waiting: "QR scan karke customer pay karega",
    verifying: provider === "mock" ? "Mock gateway se status check" : "Paytm se status check",
    paid: "Sirf server ke confirm karne par",
  };
  return (
    <div aria-live="polite">
      <ol>
        {steps.map((step, i) => {
          const done = i < current || state === "paid";
          const active = i === current && state !== "paid";
          const failedHere = state === "failed" && i === current;
          return (
            <li key={step} className="relative flex gap-3 pb-4 last:pb-0" aria-current={active ? "step" : undefined}>
              {i < steps.length - 1 && <span className={`absolute left-[11px] top-7 h-[calc(100%-24px)] w-0.5 rounded ${done ? "bg-success-500" : "bg-line"}`} aria-hidden="true" />}
              <span className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full ${failedHere ? "bg-danger text-surface" : done ? "bg-success-500 text-surface" : active ? "bg-sky-100 text-blue-600 ring-4 ring-sky-100/60" : "bg-canvas text-muted ring-1 ring-line"}`}>
                {done ? <Check className="!h-3.5 !w-3.5" aria-hidden="true" /> : active && step === "verifying" ? <LoaderCircle className="spin !h-3.5 !w-3.5" aria-hidden="true" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              <div className="-mt-0.5">
                <p className={`text-sm ${active || failedHere ? "font-semibold text-navy-950" : done ? "text-ink" : "text-muted"}`}>{failedHere ? "Payment failed" : paymentLabels[step]}</p>
                {(active || (step === "paid" && state === "paid")) && sub[step] && <p className="caption text-muted">{sub[step]}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {state === "mock" && <p className="caption mt-3 rounded-lg bg-warning-tint p-2 text-warning">{paymentLabels.mock}</p>}
      <p className="caption mt-4 break-all text-muted">Order ID {orderId ?? "unavailable · preview only"}</p>
    </div>
  );
}

/** The verified-payment moment. Shown once per verified payment, paired with software voice. */
export function PaidToast({ amount, time, preview = false, note, kind = "verified" }: { amount: number | null; time: string | null; preview?: boolean; note?: string; kind?: "verified" | "cash" }) {
  return (
    <div role="status" aria-live="polite" className="card overflow-hidden p-0 text-center">
      <div className="bg-success-tint px-6 pb-6 pt-8">
        <span className="pop-in mx-auto grid h-16 w-16 place-items-center rounded-full bg-success-500 text-surface shadow-[0_8px_24px_rgb(30_158_106/.35)]"><Check className="!h-8 !w-8 !stroke-[2.5]" aria-hidden="true" /></span>
        <p className="mt-4 text-[28px] font-bold leading-9 tracking-tight text-navy-950 tabular-nums">{formatMoney(amount)} <span className="font-semibold" lang="hi">prapt hue</span></p>
      </div>
      <p className="caption flex items-center justify-center gap-1.5 px-4 py-3 text-success">
        {kind === "cash" ? null : <ShieldCheck className="!h-4 !w-4" aria-hidden="true" />}
        {note ?? (preview ? "Verified state preview · no payment received" : `Verified by server · ${time ?? "Time unavailable"}`)}
      </p>
    </div>
  );
}

export function StockDelta({ name, before, after, reorderLevel }: { name: string; before: number | null; after: number | null; reorderLevel: number | null }) {
  const low = after !== null && reorderLevel !== null && after < reorderLevel;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="min-w-0 font-medium">{name}</span>
      <span className="flex shrink-0 items-center gap-2 tabular-nums">
        <span className="text-muted">{before ?? "—"}</span><ArrowRight className="!h-4 !w-4 text-muted" aria-hidden="true" /><span className={`font-semibold ${low ? "text-danger" : "text-navy-950"}`}>{after ?? "—"}</span>
        {low && <span className="badge tone-danger">Low</span>}
      </span>
    </div>
  );
}

export function SourceLine({ source }: { source: string }) {
  return <p className="caption mt-3 flex items-start gap-1.5 border-t border-line pt-3 text-muted"><Database className="mt-px !h-3.5 !w-3.5" aria-hidden="true" /><span>Source: {source}</span></p>;
}
export function InsightCard({ headline, facts = [], source, fresh = false }: { headline: string; facts?: readonly string[]; source: string; fresh?: boolean }) {
  return (
    <div className="card fade-up" aria-live="polite">
      {fresh && <span className="badge tone-info mb-2">Naya</span>}
      <h3 className="text-[17px] leading-6">{headline}</h3>
      {facts.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {facts.slice(0, 3).map((fact) => <li key={fact} className="secondary flex gap-2 text-ink"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden="true" />{fact}</li>)}
        </ul>
      )}
      <SourceLine source={source} />
    </div>
  );
}

export type ActionState = "pending" | "approved" | "sent" | "done" | "rejected";
export function ActionCard({ title, draft, state, onApprove, onReject, timestamps, via, error, kind }: { title: string; draft: string; state: ActionState; onApprove?: () => void; onReject?: () => void; timestamps?: Partial<Record<ActionState, string>>; via?: string | null; error?: string | null; kind?: "reorder" | "reminder" }) {
  if (state === "rejected") return <p className="flex items-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-sm text-muted">{title} · <span className="font-medium">Abhi nahi</span></p>;
  const Icon = kind === "reminder" || /remind/i.test(title) ? BellRing : Truck;
  const steps = [
    { key: "approved" as const, label: "Aapne approve kiya" },
    { key: "done" as const, label: via === "n8n" ? "Done via n8n" : via ? `Done · saved in ${via}` : "Execute ho raha hai…" },
  ];
  const reached = state === "done" ? 2 : state === "approved" || state === "sent" ? 1 : 0;
  return (
    <div className={`card fade-up ${state === "pending" ? "border-blue-600/30 ring-1 ring-blue-600/10" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-blue-600"><Icon aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="leading-6">{title}</h3>
          {state === "pending" ? <span className="badge tone-warning mt-1">Approval chahiye · abhi kuch nahi bheja</span> : state === "done" ? <span className="badge tone-success mt-1"><CheckCircle2 aria-hidden="true" />Done</span> : <span className="badge tone-info mt-1">Approved</span>}
        </div>
      </div>
      <blockquote className="mt-3 rounded-xl bg-canvas p-3 text-sm leading-6 text-ink">“{draft}”</blockquote>
      {state === "pending" ? (
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <Button onClick={onApprove} disabled={!onApprove}><Check aria-hidden="true" />Approve</Button>
          <Button variant="quiet" onClick={onReject} disabled={!onReject}>Abhi nahi</Button>
        </div>
      ) : (
        <ol className="mt-3 space-y-1.5 text-sm">
          {steps.map((st, i) => (
            <li key={st.key} className={`flex items-center gap-2 ${i < reached ? "text-success" : "text-muted"}`}>
              {i < reached ? <CheckCircle2 className="!h-4 !w-4" aria-hidden="true" /> : <LoaderCircle className="spin !h-4 !w-4" aria-hidden="true" />}
              {st.label}{timestamps?.[st.key] ? <span className="text-muted"> · {timestamps[st.key]}</span> : ""}
            </li>
          ))}
        </ol>
      )}
      {error && <p className="mt-3 rounded-lg bg-danger-tint p-2 text-sm text-danger">{error}</p>}
      {state === "done" && via !== "n8n" && <p className="caption mt-3 text-muted">Outbox mein ready hai, aap khud bhejiye. WhatsApp par auto-send nahi hota.</p>}
    </div>
  );
}

export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";
/**
 * Text field + round voice button. With `submit`, the button turns into "send" once
 * there is text, so one control serves both speaking and typing.
 */
export function VoiceComposer({ state = "idle", disabled = false, value, onChange, onVoice, label = "Ask Salaahkaar", placeholder = "Poochiye… ya mic dabaiye", idleHint = "", submit = false, busy = false }: { state?: VoiceState; disabled?: boolean; value: string; onChange: (value: string) => void; onVoice?: () => void; label?: string; placeholder?: string; idleHint?: string; submit?: boolean; busy?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => { if (state === "error") input.current?.focus(); }, [state]);
  const sending = submit && value.trim().length > 0 && state !== "listening";
  const buttonLabel = sending ? "Send" : state === "speaking" ? "Stop speaking" : state === "listening" ? "Stop listening" : "Start voice input";
  const hint = state === "error" ? "Mic nahi chala. Type karke poochiye." : state === "listening" ? "Sun rahe hain… rukne ke liye tap karein" : state === "processing" ? "Samajh rahe hain…" : state === "speaking" ? "Bol rahe hain…" : disabled ? "" : idleHint;
  return (
    <div>
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="flex items-center gap-2">
        <input id={id} ref={input} className="field rounded-full px-5" placeholder={state === "listening" ? "Boliye…" : placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
        {sending ? (
          <button type="submit" aria-label={buttonLabel} disabled={busy} className="voice-button send">{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Send aria-hidden="true" />}</button>
        ) : (
          <button type="button" aria-label={buttonLabel} disabled={disabled || !onVoice || busy} onClick={onVoice} className={`voice-button ${state === "listening" ? "listening" : ""}`}>
            {state === "processing" || busy ? <LoaderCircle className="spin" aria-hidden="true" /> : state === "speaking" || state === "listening" ? <span className="wave" aria-hidden="true"><span /><span /><span /><span /></span> : <Mic aria-hidden="true" />}
          </button>
        )}
      </div>
      {hint && <p className={`caption mt-2 px-1 ${state === "error" ? "text-danger" : "text-muted"}`} role="status">{hint}</p>}
    </div>
  );
}
export function ChatBubble({ hindi, romanisation, voice = false }: { hindi: string; romanisation?: string; voice?: boolean }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-[20px] rounded-br-md bg-blue-600 px-4 py-3 text-surface">
        <p lang={/[ऀ-ॿ]/.test(hindi) ? "hi" : undefined}>{hindi}</p>
        {romanisation && <p className="mt-1 text-sm opacity-85">{romanisation}</p>}
        {voice && <p className="caption mt-1 flex items-center justify-end gap-1 opacity-80"><Mic className="!h-3 !w-3" aria-hidden="true" />voice</p>}
      </div>
    </div>
  );
}
const AGE_TONE = { "0–15": "bg-sky-100 text-blue-700", "16–30": "bg-warning-tint text-warning", "30+": "bg-danger-tint text-danger" } as const;
export function KhataRow({ name, ageing, balance, days }: { name: string; ageing: "0–15" | "16–30" | "30+"; balance: number | null; days?: number }) {
  return (
    <div className="flex min-h-16 items-center gap-3 px-4 py-3">
      <span className={`avatar h-10 w-10 text-sm ${AGE_TONE[ageing]}`} aria-hidden="true">{name.split(" ").slice(0, 2).map((s) => s[0]).join("")}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-navy-950">{name}</p>
        <p className={`caption tabular-nums ${ageing === "30+" ? "text-danger" : ageing === "16–30" ? "text-warning" : "text-muted"}`}>{days !== undefined ? `${days} din purana` : `${ageing} days`}</p>
      </div>
      <MoneyText paise={balance} tone={ageing === "30+" ? "danger" : "default"} />
      <ChevronRight className="!h-4 !w-4 text-muted" aria-hidden="true" />
    </div>
  );
}
export function EventLogItem({ name, summary, timestamp, verified, tone = "neutral", icon }: { name: string; summary: string; timestamp: string | null; verified: boolean; tone?: "neutral" | "success" | "info" | "warning"; icon?: React.ReactNode }) {
  const dot = { neutral: "bg-canvas text-muted", success: "bg-success-tint text-success", info: "bg-sky-100 text-blue-600", warning: "bg-warning-tint text-warning" }[tone];
  return (
    <div className="relative flex gap-3 py-3 pl-1 pr-1">
      <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ${dot}`}>{icon ?? <span className="h-2 w-2 rounded-full bg-current" />}</span>
      <div className="min-w-0 flex-1">
        <p className="pt-1 text-[15px] leading-6 text-ink">{summary}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="caption text-muted tabular-nums">{timestamp ?? "—"}</span>
          <code className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-muted">{name}</code>
          {verified && <span className="badge tone-success"><ShieldCheck aria-hidden="true" />Verified</span>}
        </div>
      </div>
    </div>
  );
}

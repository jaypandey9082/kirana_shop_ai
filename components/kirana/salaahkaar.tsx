"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Send, Volume2 } from "lucide-react";
import { Button, ErrorBanner } from "@/components/ui/primitives";
import { ActionCard, ChatBubble, InsightCard, VoiceComposer, type ActionState } from "./components";
import { speakHindi, useVoiceInput } from "./voice";
import { suggestions } from "@/lib/ui-fixtures";
import { classifyApproval } from "@/lib/salaahkaar/intent";
import type { ActionView, InsightCardData } from "@/lib/salaahkaar/tools";

interface Reply { mode: "ai" | "offline" | "ai-guarded"; display: string; speak: string; cards: InsightCardData[]; actions: ActionView[]; tools: string[] }
interface Turn { id: number; question: string; reply: Reply | null; error?: string; viaVoice: boolean }

const MODE_LABEL: Record<Reply["mode"], string> = {
  ai: "AI · answers from your shop data",
  offline: "Offline mode · rule-based, same shop data",
  "ai-guarded": "AI wording hidden · a number wasn't from your data",
};

const timeOf = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : undefined);

export function actionState(a: ActionView): ActionState {
  return a.status === "PENDING" ? "pending" : a.status === "REJECTED" ? "rejected" : a.status === "EXECUTED" ? "done" : "approved";
}

/** Approve / reject an action, then follow it until it is executed (n8n may take a moment). */
export function useActions() {
  const [actions, setActions] = useState<Record<string, ActionView>>({});
  const [error, setError] = useState<string | null>(null);
  const put = (a: ActionView) => setActions((prev) => ({ ...prev, [a.id]: a }));

  const decide = async (id: string, decision: "approve" | "reject", via: "tap" | "voice" = "tap") => {
    setError(null);
    try {
      const res = await fetch(`/api/actions/${id}/${decision}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ via }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Action update nahi hua.");
      put(data.action);
      if (data.action.status === "APPROVED") void follow(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action update nahi hua.");
    }
  };

  const follow = async (id: string) => {
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch(`/api/actions/${id}`).catch(() => null);
      const data = await res?.json().catch(() => null);
      if (data?.action) {
        put(data.action);
        if (data.action.status !== "APPROVED") return;
      }
    }
  };

  return { actions, put, decide, error };
}

export function SalaahkaarScreen({ aiMode, voiceEnabled }: { aiMode: "ai" | "offline"; voiceEnabled: boolean }) {
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [nudges, setNudges] = useState<InsightCardData[] | null>(null);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const bottom = useRef<HTMLDivElement>(null);
  const { actions, put, decide, error: actionError } = useActions();

  useEffect(() => {
    fetch("/api/salaahkaar/nudges").then((r) => r.json()).then((d) => setNudges(d.cards ?? [])).catch(() => setNudges([]));
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns]);

  const latestPending = () => {
    for (const t of [...turns].reverse()) for (const a of t.reply?.actions ?? []) {
      const current = actions[a.id] ?? a;
      if (current.status === "PENDING") return current;
    }
    return null;
  };

  const ask = async (question: string, viaVoice = false) => {
    const q = question.trim();
    if (!q || busy) return;
    setText("");
    // "Haan, bhej do" right after a draft is an approval, not a new question.
    const pending = latestPending();
    if (pending) {
      const decision = classifyApproval(q);
      if (decision) {
        const id = nextId.current++;
        setTurns((t) => [...t, { id, question: q, viaVoice, reply: { mode: aiMode, display: decision === "approve" ? `Theek hai. “${pending.title}” approve kar diya.` : `Theek hai, “${pending.title}” abhi nahi bhejenge.`, speak: decision === "approve" ? "ठीक है, भेज रहा हूँ।" : "ठीक है, अभी नहीं भेजेंगे।", cards: [], actions: [], tools: [] } }]);
        await decide(pending.id, decision, viaVoice ? "voice" : "tap");
        if (viaVoice) void speakHindi(decision === "approve" ? "ठीक है, भेज रहा हूँ।" : "ठीक है, अभी नहीं भेजेंगे।");
        return;
      }
    }
    const id = nextId.current++;
    setTurns((t) => [...t, { id, question: q, reply: null, viaVoice }]);
    setBusy(true);
    try {
      const res = await fetch("/api/salaahkaar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Jawab nahi mila.");
      const reply = data.reply as Reply;
      reply.actions.forEach(put);
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, reply } : x)));
      if (viaVoice) void speakHindi(reply.speak);
    } catch (e) {
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: e instanceof Error ? e.message : "Jawab nahi mila." } : x)));
    } finally {
      setBusy(false);
    }
  };

  const voice = useVoiceInput((transcript) => { if (transcript) void ask(transcript, true); });

  return (
    <div className="pb-56">
      <section className="-mx-4 -mt-6 rounded-b-xl bg-navy-950 px-4 py-6 text-surface">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-surface">Salaahkaar</h1>
            <p className="mt-2 text-sm text-on-dark-muted">Aapka dukaan adviser · Hindi / Hinglish</p>
          </div>
          <span className={`badge ${aiMode === "ai" ? "bg-navy-700 text-surface" : "tone-warning"}`}>{aiMode === "ai" ? "AI" : "OFFLINE MODE"}</span>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          {suggestions.map((s) => (
            <button key={s} type="button" disabled={busy} className="min-h-12 rounded-md bg-navy-700 px-3 py-2 text-left text-sm" onClick={() => ask(s)}>{s}</button>
          ))}
        </div>
      </section>

      {nudges && nudges.length > 0 && turns.length === 0 && (
        <section className="mt-6 space-y-3" aria-label="Abhi dhyan dein">
          <p className="section-label">Abhi dhyan dein</p>
          {nudges.map((c, i) => <InsightCard key={i} headline={c.headline} facts={c.facts} source={c.source} fresh />)}
        </section>
      )}

      <section className="mt-6 space-y-4" aria-live="polite">
        {turns.map((t) => (
          <div key={t.id} className="space-y-3">
            <ChatBubble hindi={t.question} />
            {!t.reply && !t.error && <div className="card flex items-center gap-3"><LoaderCircle className="spin text-blue-600" aria-hidden="true" /><p>Dukaan ka data dekh rahe hain…</p></div>}
            {t.error && <ErrorBanner message={t.error} />}
            {t.reply && (
              <>
                <div className="card">
                  <p className="text-[17px] leading-relaxed">{t.reply.display}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className={`badge ${t.reply.mode === "ai" ? "tone-staging" : "tone-warning"}`}>{MODE_LABEL[t.reply.mode]}</span>
                    <Button variant="quiet" aria-label="Jawab suniye" onClick={() => speakHindi(t.reply!.speak)}><Volume2 aria-hidden="true" /></Button>
                  </div>
                </div>
                {t.reply.cards.map((c, i) => <InsightCard key={i} headline={c.headline} facts={c.facts} source={c.source} />)}
                {t.reply.actions.map((a) => {
                  const current = actions[a.id] ?? a;
                  return (
                    <ActionCard key={a.id} title={current.title} draft={current.draft} state={actionState(current)}
                      onApprove={() => decide(a.id, "approve")} onReject={() => decide(a.id, "reject")}
                      timestamps={{ approved: timeOf(current.decidedAt), done: timeOf(current.executedAt) }}
                      via={current.deliveredVia} error={current.status === "FAILED" ? `Execution failed: ${current.error ?? "unknown error"}` : null} />
                  );
                })}
              </>
            )}
          </div>
        ))}
        {actionError && <ErrorBanner message={actionError} />}
        <div ref={bottom} />
      </section>

      <form
        className="fixed bottom-[calc(81px+env(safe-area-inset-bottom))] left-1/2 z-20 w-full max-w-[420px] -translate-x-1/2 border-t border-line bg-surface p-4"
        onSubmit={(e) => { e.preventDefault(); void ask(text); }}
      >
        <VoiceComposer state={voice.state} value={text} onChange={setText} onVoice={voiceEnabled && !busy ? voice.toggle : undefined}
          idleHint={voiceEnabled ? "Mic dabaiye ya type karein" : "Voice not set up (Sarvam key). Type karein."} />
        {voice.error && <p className="caption mt-1 text-danger">{voice.error}</p>}
        <Button type="submit" className="mt-3 w-full" disabled={!text.trim() || busy}>
          {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Send aria-hidden="true" />}Poochiye
        </Button>
      </form>
    </div>
  );
}

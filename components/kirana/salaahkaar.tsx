"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Square, Volume2 } from "lucide-react";
import { ErrorBanner } from "@/components/ui/primitives";
import { ActionCard, ChatBubble, InsightCard, VoiceComposer, type ActionState } from "./components";
import { speakHindi, toggleSpeak, useSpeaking, useVoiceInput } from "./voice";
import { suggestions } from "@/lib/ui-fixtures";
import { classifyApproval } from "@/lib/salaahkaar/intent";
import type { ActionView, InsightCardData } from "@/lib/salaahkaar/tools";

interface Reply { mode: "ai" | "offline" | "ai-guarded"; display: string; speak: string; cards: InsightCardData[]; actions: ActionView[]; tools: string[] }
interface Turn { id: number; question: string; reply: Reply | null; error?: string; viaVoice: boolean }

const MODE_LABEL: Record<Reply["mode"], string> = {
  ai: "AI · aapke shop data se",
  offline: "Offline · rule-based, same shop data",
  "ai-guarded": "AI wording hidden · number data se nahi tha",
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
  // Bring the newest question to the top so its whole answer reads downwards.
  const lastId = turns.at(-1)?.id;
  useEffect(() => { if (lastId) bottom.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [lastId]);

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

  const empty = turns.length === 0;
  return (
    <div className="pb-32">
      <section className="hero -mx-4 -mt-5 rounded-none rounded-b-[28px] px-4 pb-5 pt-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-500 text-navy-950"><Mic aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="text-surface">Salaahkaar</h1>
            <p className="truncate text-sm text-on-dark-muted">Dukaan adviser · Hindi / Hinglish</p>
          </div>
          <span className={`badge ${aiMode === "ai" ? "bg-white/10 text-surface" : "tone-warning"}`}>{aiMode === "ai" ? "AI" : "OFFLINE"}</span>
        </div>
        <div className="chip-row mt-4" role="group" aria-label="Suggested questions">
          {suggestions.map((s) => (
            <button key={s} type="button" disabled={busy} className="chip chip-dark" onClick={() => ask(s)}>{s}</button>
          ))}
        </div>
      </section>

      {empty && nudges === null && <div className="mt-5 space-y-3"><div className="skeleton h-4 w-32" /><div className="skeleton h-28" /></div>}
      {empty && nudges && nudges.length > 0 && (
        <section className="mt-5 space-y-3" aria-label="Abhi dhyan dein">
          <p className="section-label">Abhi dhyan dein</p>
          {nudges.map((c, i) => <InsightCard key={i} headline={c.headline} facts={c.facts} source={c.source} fresh />)}
        </section>
      )}

      <section className="mt-5 space-y-4" aria-live="polite">
        {turns.map((t) => (
          <div key={t.id} ref={t.id === lastId ? bottom : undefined} className="scroll-mt-20 space-y-3">
            <ChatBubble hindi={t.question} voice={t.viaVoice} />
            {!t.reply && !t.error && (
              <div className="flex items-center gap-3 px-1">
                <Avatar />
                <p className="secondary flex items-center gap-2"><LoaderCircle className="spin !h-4 !w-4 text-blue-600" aria-hidden="true" />Dukaan ka data dekh rahe hain…</p>
              </div>
            )}
            {t.error && <ErrorBanner message={t.error} />}
            {t.reply && (
              <>
                <div className="fade-up flex items-start gap-3">
                  <Avatar />
                  <div className="card min-w-0 flex-1 rounded-tl-md">
                    <p className="text-[16px] leading-7">{t.reply.display}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={`badge ${t.reply.mode === "ai" ? "tone-info" : "tone-warning"}`}>{MODE_LABEL[t.reply.mode]}</span>
                      <SpeakButton text={t.reply.speak} />
                    </div>
                  </div>
                </div>
                {t.reply.cards.map((c, i) => <InsightCard key={i} headline={c.headline} facts={c.facts} source={c.source} />)}
                {t.reply.actions.map((a) => {
                  const current = actions[a.id] ?? a;
                  return (
                    <ActionCard key={a.id} kind={current.type} title={current.title} draft={current.draft} state={actionState(current)}
                      onApprove={() => decide(a.id, "approve")} onReject={() => decide(a.id, "reject")}
                      timestamps={{ approved: timeOf(current.decidedAt), done: timeOf(current.executedAt) }}
                      via={current.deliveredVia} error={current.status === "FAILED" ? `Execution failed: ${current.error ?? "unknown error"}` : null} />
                  );
                })}
                {t.reply.actions.some((a) => (actions[a.id] ?? a).status === "PENDING") && (
                  <p className="caption px-1 text-muted">Bol sakte hain: “Haan, bhej do” ya “Abhi nahi”.</p>
                )}
              </>
            )}
          </div>
        ))}
        {actionError && <ErrorBanner message={actionError} />}
      </section>

      <form className="action-bar" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
        <VoiceComposer submit busy={busy} state={voice.state} value={text} onChange={setText} onVoice={voiceEnabled ? voice.toggle : undefined}
          placeholder={voiceEnabled ? "Poochiye… ya mic dabaiye" : "Type karke poochiye…"}
          idleHint={voiceEnabled ? "" : "Voice not set up on this server. Typing works."} />
        {voice.error && <p className="caption mt-1 px-1 text-danger">{voice.error}</p>}
      </form>
    </div>
  );
}

/** Play the answer aloud; while it plays, the same button stops it. */
function SpeakButton({ text }: { text: string }) {
  const playing = useSpeaking() === text;
  return (
    <button type="button" className={`icon-btn -my-2 -mr-2 ${playing ? "bg-sky-100 text-blue-700" : "text-blue-600"}`}
      aria-label={playing ? "Rokiye" : "Jawab suniye"} aria-pressed={playing} onClick={() => void toggleSpeak(text)}>
      {playing ? <Square className="!h-4 !w-4 fill-current" aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
    </button>
  );
}

function Avatar() {
  return <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy-950 text-sky-500" aria-hidden="true"><Mic className="!h-4 !w-4" /></span>;
}

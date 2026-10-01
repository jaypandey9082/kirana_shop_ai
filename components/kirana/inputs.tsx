"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ExternalLink, FileText, LoaderCircle, Plus } from "lucide-react";
import { Button, ErrorBanner } from "@/components/ui/primitives";
import { VoiceComposer, type VoiceState } from "./components";
import type { BillView } from "@/lib/bills";

export interface AiCapabilities { parchi: boolean; voice: boolean; parchiLabel: string | null }
export type LinesResult = { bill: BillView; unmatched: string[] };

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed. Please try again.");
  return data;
}

/** Shrink a phone photo to ≤1600px JPEG before upload (faster on venue networks). */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85));
  } catch {
    return file; // the server still validates type and size
  }
}

export function ParchiPanel({ caps, ensureBill, onResult }: { caps: AiCapabilities; ensureBill: () => Promise<BillView>; onResult: (r: LinesResult, note: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "live" | "demo">(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const send = async (kind: "live" | "demo", file?: File) => {
    setBusy(kind);
    setError(null);
    try {
      const bill = await ensureBill();
      let res: Response;
      if (kind === "demo") {
        res = await fetch(`/api/bills/${bill.id}/parchi`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demo: true }) });
      } else {
        const form = new FormData();
        form.append("image", await shrink(file!), "parchi.jpg");
        res = await fetch(`/api/bills/${bill.id}/parchi`, { method: "POST", body: form });
      }
      const data = await readJson(res);
      onResult(data, kind === "demo" ? "Cached demo reading · not read live" : `Read by ${caps.parchiLabel ?? "AI"} · check every line`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parchi padh nahi paaye.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card">
      <p className="section-label">Parchi se bill</p>
      <div className="mt-3 flex items-center gap-3">
        <span className="grid h-16 w-14 shrink-0 place-items-center overflow-hidden rounded-sm border border-[#EADFB8] bg-[#FFFDF4] text-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          {preview ? <img src={preview} alt="Parchi photo" className="h-full w-full object-cover" /> : <FileText aria-hidden="true" />}
        </span>
        <p className="secondary">Photo lijiye. AI list padhega, catalogue se match hoga, aur jo pakka nahi woh aap chunenge.</p>
      </div>
      <input
        ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" aria-label="Parchi photo"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setPreview(URL.createObjectURL(f));
          void send("live", f);
        }}
      />
      <Button className="mt-4 w-full" disabled={!caps.parchi || !!busy} onClick={() => input.current?.click()}>
        {busy === "live" ? <LoaderCircle className="spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
        {busy === "live" ? "Parchi padh rahe hain…" : "Parchi ki photo lein"}
      </Button>
      {!caps.parchi && <p className="caption mt-2 text-muted">Live reading is not set up on this server (OpenAI key/model missing).</p>}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="flex-1" disabled={!!busy} onClick={() => send("demo")}>
          {busy === "demo" ? <LoaderCircle className="spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}Demo parchi (cached)
        </Button>
        <a className="btn btn-quiet" href="/demo-parchi" target="_blank" rel="noreferrer" aria-label="Open the demo parchi"><ExternalLink aria-hidden="true" /></a>
      </div>
      <p className="caption mt-2 text-muted">Cached = a saved reading of the demo parchi, labelled in the log. Use it if the network or AI is down.</p>
      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
    </div>
  );
}

const MAX_SECONDS = 20;

export function VoicePanel({ caps, ensureBill, onResult }: { caps: AiCapabilities; ensureBill: () => Promise<BillView>; onResult: (r: LinesResult, note: string) => void }) {
  const [state, setState] = useState<VoiceState>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); recorder.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  const transcribe = async (blob: Blob, type: string) => {
    setState("processing");
    try {
      const form = new FormData();
      form.append("audio", blob, type.includes("mp4") ? "speech.mp4" : "speech.webm");
      const data = await readJson(await fetch("/api/voice/stt", { method: "POST", body: form }));
      setText(data.transcript);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Awaaz samajh nahi aayi.");
      setState("error");
    }
  };

  const toggle = async () => {
    setError(null);
    if (state === "listening") { recorder.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        if (timer.current) clearTimeout(timer.current);
        stream.getTracks().forEach((t) => t.stop());
        void transcribe(new Blob(chunks, { type: rec.mimeType }), rec.mimeType);
      };
      recorder.current = rec;
      rec.start();
      setState("listening");
      timer.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_SECONDS * 1000);
    } catch {
      setError("Mic nahi chala. Type karke likhiye.");
      setState("error");
    }
  };

  const add = async () => {
    if (!text.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const bill = await ensureBill();
      const data = await readJson(await fetch(`/api/bills/${bill.id}/lines`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, source: "voice" }) }));
      onResult(data, "From voice · check every line");
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add nahi hua.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="card">
      <p className="section-label">Bolkar bill</p>
      <p className="secondary mt-2">“Do doodh, ek bread aur teen biskut” bolein. Transcript check karke bill mein jodein.</p>
      <div className="mt-4">
        <VoiceComposer state={state} value={text} onChange={setText} onVoice={caps.voice ? toggle : undefined}
          label="Spoken or typed order" placeholder="do doodh, ek bread…" idleHint="Mic dabaiye ya type karein" />
      </div>
      {!caps.voice && <p className="caption mt-2 text-muted">Voice is not set up on this server (Sarvam key missing). Typing works.</p>}
      <Button className="mt-3 w-full" disabled={!text.trim() || adding || state === "processing"} onClick={add}>
        {adding ? <LoaderCircle className="spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}Bill mein jodein
      </Button>
      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
    </div>
  );
}

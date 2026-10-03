"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ExternalLink, FileText, LoaderCircle, Mic, Plus } from "lucide-react";
import { Button, ErrorBanner } from "@/components/ui/primitives";
import type { BillView } from "@/lib/bills";
import { useVoiceInput } from "./voice";

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

export function ParchiPanel({ caps, ensureBill, onResult, compact = false }: { caps: AiCapabilities; ensureBill: () => Promise<BillView>; onResult: (r: LinesResult, note: string) => void; compact?: boolean }) {
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
      onResult(data, kind === "demo" ? "Cached demo reading" : `Read by ${caps.parchiLabel ?? "AI"} · check karein`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parchi padh nahi paaye.");
    } finally {
      setBusy(null);
    }
  };

  const fileInput = (
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
  );
  const demoButton = (primary: boolean, label = "Demo parchi (cached)") => (
    <Button variant={primary ? "primary" : "quiet"} className="flex-1" disabled={!!busy} onClick={() => send("demo")}>
      {busy === "demo" ? <LoaderCircle className="spin" aria-hidden="true" /> : <FileText aria-hidden="true" />}{label}
    </Button>
  );

  if (compact) {
    return (
      <div className="card p-3">
        {fileInput}
        <div className="flex gap-2">
          {caps.parchi && (
            <Button variant="secondary" className="flex-1" disabled={!!busy} onClick={() => input.current?.click()}>
              {busy === "live" ? <LoaderCircle className="spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}Aur parchi
            </Button>
          )}
          {demoButton(false, caps.parchi ? "Demo" : "Demo parchi phir se")}
        </div>
        {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
      </div>
    );
  }

  return (
    <div className="card p-3">
      {fileInput}
      <button type="button" disabled={!caps.parchi || !!busy} onClick={() => input.current?.click()}
        className="group flex w-full flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed border-line-strong bg-blue-50 px-4 py-7 text-center transition-colors hover:border-blue-600 disabled:cursor-not-allowed disabled:bg-canvas">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          <img src={preview} alt="Parchi photo" className="h-20 w-16 rounded-lg object-cover shadow-card" />
        ) : (
          <span className={`grid h-14 w-14 place-items-center rounded-2xl ${caps.parchi ? "bg-blue-600 text-surface" : "bg-line text-muted"}`}>
            {busy === "live" ? <LoaderCircle className="spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
          </span>
        )}
        <span>
          <span className={`block text-[17px] font-semibold ${caps.parchi ? "text-navy-950" : "text-muted"}`}>{busy === "live" ? "Parchi padh rahe hain…" : "Parchi ki photo lein"}</span>
          <span className="secondary mt-1 block">{caps.parchi ? "AI padhega, aap check karenge" : "Live reading off (no OpenAI key)"}</span>
        </span>
      </button>
      <div className="mt-3 flex gap-2">
        {demoButton(!caps.parchi)}
        <a className="btn btn-quiet w-12 px-0" href="/demo-parchi" target="_blank" rel="noreferrer" aria-label="Open the demo parchi"><ExternalLink aria-hidden="true" /></a>
      </div>
      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
    </div>
  );
}

export function VoicePanel({ caps, ensureBill, onResult }: { caps: AiCapabilities; ensureBill: () => Promise<BillView>; onResult: (r: LinesResult, note: string) => void }) {
  const [text, setText] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const voice = useVoiceInput(setText);
  const error = addError ?? voice.error;

  const add = async () => {
    if (!text.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const bill = await ensureBill();
      const data = await readJson(await fetch(`/api/bills/${bill.id}/lines`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, source: "voice" }) }));
      onResult(data, "From voice · check karein");
      setText("");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Add nahi hua.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); void add(); }}>
      <div className="flex flex-col items-center gap-3 pb-4 pt-2 text-center">
        <button type="button" aria-label={voice.state === "listening" ? "Stop listening" : "Start voice input"} disabled={!caps.voice || adding}
          onClick={voice.toggle} className={`voice-button voice-lg ${voice.state === "listening" ? "listening" : ""}`}>
          {voice.state === "processing" ? <LoaderCircle className="spin" aria-hidden="true" /> : voice.state === "listening" ? <span className="wave" aria-hidden="true"><span /><span /><span /><span /></span> : <Mic className="!h-7 !w-7" aria-hidden="true" />}
        </button>
        <div>
          <p className="font-semibold text-navy-950">{voice.state === "listening" ? "Sun rahe hain…" : voice.state === "processing" ? "Samajh rahe hain…" : "Bolkar bill banaiye"}</p>
          <p className="secondary mt-1">“Do doodh, ek bread aur teen biskut”</p>
        </div>
      </div>
      <label htmlFor="voice-order" className="sr-only">Spoken or typed order</label>
      <input id="voice-order" className="field" placeholder={caps.voice ? "Transcript yahan aayega… ya type karein" : "Voice off on this server · type karein"} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      <Button type="submit" className="mt-3 w-full" disabled={!text.trim() || adding || voice.state === "processing"}>
        {adding ? <LoaderCircle className="spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}Bill mein jodein
      </Button>
      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
    </form>
  );
}

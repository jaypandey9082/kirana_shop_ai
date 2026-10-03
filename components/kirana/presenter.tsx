"use client";
import { useEffect, useRef, useState } from "react";
import { Activity, Check, FileText, RotateCcw, Smartphone, Store, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/primitives";

interface Ready { [k: string]: { ok: boolean; detail: string } | string | null }
const PHONE = { w: 390, h: 844 };
const KEY = "kirana.demo.resetSecret";

function Phone({ title, hint, icon, src, scale, frameKey }: { title: string; hint: string; icon: React.ReactNode; src: string; scale: number; frameKey: number }) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <figcaption className="text-center">
        <span className="flex items-center justify-center gap-2 text-lg font-semibold text-surface">{icon}{title}</span>
        <span className="text-sm text-on-dark-muted">{hint}</span>
      </figcaption>
      <div className="overflow-hidden rounded-[36px] border-[10px] border-[#0A1328] bg-surface shadow-raised" style={{ width: PHONE.w * scale + 20, height: PHONE.h * scale + 20 }}>
        <iframe key={frameKey} title={title} src={src} allow="microphone; autoplay" style={{ width: PHONE.w, height: PHONE.h, transform: `scale(${scale})`, transformOrigin: "0 0", border: 0 }} />
      </div>
    </figure>
  );
}

export function Presenter({ shopSlug }: { shopSlug: string }) {
  const [scale, setScale] = useState(0.8);
  const [ready, setReady] = useState<Ready | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fit = () => setScale(Math.max(0.5, Math.min(1, (window.innerHeight - 190) / PHONE.h)));
    fit();
    window.addEventListener("resize", fit);
    fetch("/api/ready").then((r) => r.json()).then(setReady).catch(() => setReady(null));
    return () => window.removeEventListener("resize", fit);
  }, []);

  const reset = async () => {
    let secret = "";
    try { secret = sessionStorage.getItem(KEY) ?? ""; } catch { /* private mode */ }
    if (!secret) secret = window.prompt("Demo reset secret") ?? "";
    if (!secret) return;
    setBusy(true);
    const res = await fetch("/api/demo/reset", { method: "POST", headers: { "x-demo-reset-secret": secret } }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      try { sessionStorage.setItem(KEY, secret); } catch { /* ignore */ }
      setMsg("Demo data reset ✓");
      setFrameKey((k) => k + 1);
    } else {
      try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
      setMsg(res?.status === 401 ? "Wrong secret" : res?.status === 404 ? "Reset is disabled on this server" : "Reset failed");
    }
    setTimeout(() => setMsg(null), 4000);
  };

  const NAMES = { database: "Database", payments: "Payments", parchiAndAgent: "AI", voice: "Voice", automation: "Actions" } as const;
  const badges = ready ? (Object.keys(NAMES) as Array<keyof typeof NAMES>).map((k) => {
    const v = ready[k] as { ok: boolean; detail: string; mode?: string } | undefined;
    if (!v) return null;
    const mock = k === "payments" && v.mode === "mock";
    const label = mock ? "Mock payments" : k === "payments" && v.mode === "staging" ? "Paytm staging" : NAMES[k];
    return (
      <span key={k} title={v.detail} className={`badge px-2.5 py-1 text-xs ${v.ok && !mock ? "bg-white/10 text-surface" : "tone-warning"}`}>
        {v.ok && !mock ? <Check aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}{label}
      </span>
    );
  }) : null;

  return (
    <main className="min-h-dvh bg-navy-950 px-6 py-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-500 text-lg font-bold text-navy-950" aria-hidden="true">K</span>
          <div>
            <h1 className="text-surface">Kirana Shop AI <span className="font-normal text-on-dark-muted">· live demo · Team HackHorizon</span></h1>
            <div className="mt-1.5 flex flex-wrap gap-2">{badges}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="caption text-surface" role="status">{msg}</span>}
          <a className="btn btn-quiet" href="/demo-parchi" target="_blank" rel="noreferrer"><FileText aria-hidden="true" />Demo parchi</a>
          <Button variant="secondary" disabled={busy} onClick={reset}><RotateCcw aria-hidden="true" />Reset demo</Button>
        </div>
      </header>
      <div ref={wrap} className="flex flex-wrap items-start justify-center gap-6">
        <Phone title="Customer" hint="Shop QR se order aur payment" icon={<Store aria-hidden="true" />} src={`/s/${shopSlug}`} scale={scale} frameKey={frameKey} />
        <Phone title="Shopkeeper" hint="Counter · Khata · Salaahkaar" icon={<Smartphone aria-hidden="true" />} src="/counter" scale={scale} frameKey={frameKey} />
        <Phone title="Live log" hint="Har event, server se verified" icon={<Activity aria-hidden="true" className="text-sky-500" />} src="/log" scale={scale} frameKey={frameKey} />
      </div>
    </main>
  );
}

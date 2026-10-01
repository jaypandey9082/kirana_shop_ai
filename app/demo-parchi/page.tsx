import { Kalam } from "next/font/google";
import { DEMO_PARCHI_LINES } from "@/lib/demo/parchi";

const hand = Kalam({ subsets: ["latin", "devanagari"], weight: ["400", "700"], display: "swap" });
export const metadata = { title: "Demo parchi", robots: { index: false } };

/** A printable/photographable demo shopping list. For live demos, prefer a real handwritten one. */
export default function Page() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div className={`${hand.className} w-full max-w-xs -rotate-2 rounded-sm border border-[#EADFB8] bg-[#FFFDF4] p-8 text-[#2C2C6E] shadow-raised`}>
        <p className="text-sm opacity-70">1/10 · Sharma ji</p>
        <ul className="mt-4 space-y-3 text-3xl leading-tight">
          {DEMO_PARCHI_LINES.map((l) => <li key={l} lang={/[ऀ-ॿ]/.test(l) ? "hi" : undefined}>{l}</li>)}
        </ul>
      </div>
      <p className="caption mt-6 max-w-xs text-center text-muted">Demo parchi for the Kirana Shop AI demo. Photograph it from the Counter&apos;s Parchi tab.</p>
    </main>
  );
}

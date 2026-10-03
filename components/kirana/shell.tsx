"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Activity, Mic, NotebookPen, ReceiptText, ShoppingBag } from "lucide-react";
import { Sheet } from "@/components/ui/primitives";
import type { ShellFixture } from "@/lib/ui-fixtures";

export type Mode = "demo" | "staging" | "mock" | "live-off";
const modes: Record<Mode, { label: string; short: string; tone: string; explanation: string }> = {
  demo: { label: "DEMO DATA", short: "Demo", tone: "neutral", explanation: "Synthetic demo store. Products, past sales and Khata are generated demo data, not a real shop." },
  staging: { label: "PAYTM STAGING", short: "Staging", tone: "staging", explanation: "Paytm staging: test transactions verified by our server with Paytm. No real money moves." },
  mock: { label: "MOCK PAYMENTS", short: "Mock", tone: "warning", explanation: "Mock payment · not a real Paytm transaction. It still goes through the same server-side verification, so the flow can be demonstrated without credentials." },
  "live-off": { label: "PAYMENTS OFF", short: "Pay off", tone: "neutral", explanation: "Online payment is off: Paytm is selected but its staging credentials are missing. Cash and udhaar still work." },
};
export function ModeBadge({ mode }: { mode: Mode }) { return <span className={`badge tone-${modes[mode].tone}`}>{modes[mode].label}</span>; }

const tabs = [
  { href: "/counter", label: "Counter", Icon: ReceiptText },
  { href: "/orders", label: "Orders", Icon: ShoppingBag },
  { href: "/khata", label: "Khata", Icon: NotebookPen },
  { href: "/salaahkaar", label: "Salaahkaar", Icon: Mic, ai: true },
];

export function MerchantShell({ children, fixture, date }: { children: ReactNode; fixture: ShellFixture; date: string }) {
  const path = usePathname();
  const [showModes, setShowModes] = useState(false);
  const pay = modes[fixture.paymentMode];
  const toPrepare = useOrdersToPrepare();
  return (
    <div className="merchant-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="shell-header">
        <span className="avatar h-10 w-10 bg-navy-950 text-[15px] text-surface" aria-hidden="true">{fixture.shopName.charAt(0)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-5 text-navy-950">{fixture.shopName}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="caption text-muted">{date}</span>
            <button type="button" onClick={() => setShowModes(true)} aria-haspopup="dialog" aria-label={`Modes: ${modes[fixture.dataMode].label}, ${pay.label}. Tap for details.`}
              className={`badge tone-${pay.tone} px-2 text-[10px] leading-4`}>
              <span className={`h-1.5 w-1.5 rounded-full ${pay.tone === "warning" ? "bg-warning-line" : pay.tone === "staging" ? "bg-blue-600" : "bg-muted"}`} aria-hidden="true" />
              DEMO · {pay.short.toUpperCase()}
            </button>
          </div>
        </div>
        <Link className="icon-btn" href="/log" aria-label="Open live log" aria-current={path === "/log" ? "page" : undefined}>
          <Activity aria-hidden="true" className={path === "/log" ? "text-blue-600" : ""} />
        </Link>
      </header>
      <main id="main-content" tabIndex={-1} className="shell-content outline-none">{children}</main>
      <nav aria-label="Merchant navigation" className="bottom-nav">
        {tabs.map(({ href, label, Icon, ai }) => (
          <Link key={href} href={href} aria-current={path === href ? "page" : undefined} className="nav-link">
            <span className={`nav-icon relative ${ai ? "nav-icon-ai" : ""}`}>
              <Icon aria-hidden="true" />
              {href === "/orders" && toPrepare > 0 && (
                <span className="pop-in absolute -top-1 right-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] font-bold leading-none text-surface ring-2 ring-surface tabular-nums">{toPrepare}</span>
              )}
            </span>
            {label}{href === "/orders" && toPrepare > 0 && <span className="sr-only">, {toPrepare} naye order</span>}
          </Link>
        ))}
      </nav>
      <Sheet title="Yeh demo kaise chal raha hai" open={showModes} onClose={() => setShowModes(false)}>
        <div className="space-y-4">
          {[fixture.dataMode, fixture.paymentMode].map((mode) => (
            <div key={mode} className="rounded-2xl bg-canvas p-4"><ModeBadge mode={mode} /><p className="secondary mt-2 text-ink">{modes[mode].explanation}</p></div>
          ))}
          <p className="caption text-muted">Voice confirmation is software text-to-speech, not Soundbox hardware.</p>
        </div>
      </Sheet>
    </div>
  );
}

/** Paid online orders not yet completed: the Orders tab badge. Checks on open, every 8 s while visible, and on return. */
function useOrdersToPrepare() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const { orders } = await fetch("/api/orders").then((r) => r.json());
        if (!stop) setCount((orders ?? []).filter((o: { status: string; fulfilment: string | null }) => o.status === "PAID" && o.fulfilment !== "COMPLETED").length);
      } catch { /* keep the last count */ }
    };
    const loop = async () => {
      if (document.visibilityState === "visible") await check();
      if (!stop) timer = setTimeout(loop, 8000);
    };
    const onShow = () => { if (document.visibilityState === "visible") void check(); };
    void check().then(() => { if (!stop) timer = setTimeout(loop, 8000); });
    document.addEventListener("visibilitychange", onShow);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onShow); };
  }, []);
  return count;
}

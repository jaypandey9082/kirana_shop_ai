"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ScanLine, ShoppingBag, NotebookPen, Mic, ListChecks, ChevronDown } from "lucide-react";
import { Sheet } from "@/components/ui/primitives";
import type { ShellFixture } from "@/lib/ui-fixtures";

export type Mode = "demo" | "staging" | "mock" | "live-off";
const modes: Record<Mode, { label: string; tone: string; explanation: string }> = {
  demo: { label: "DEMO DATA", tone: "neutral", explanation: "Synthetic demo store. Products, past sales and Khata are generated demo data, not a real shop." },
  staging: { label: "PAYTM STAGING", tone: "staging", explanation: "Paytm staging: test transactions verified by our server with Paytm. No real money moves." },
  mock: { label: "MOCK PAYMENTS", tone: "warning", explanation: "Mock payment · not a real Paytm transaction. It still goes through the same server-side verification, so the flow can be demonstrated without credentials." },
  "live-off": { label: "PAYMENTS OFF", tone: "neutral", explanation: "Online payment is off: Paytm is selected but its staging credentials are missing. Cash and udhaar still work." },
};
export function ModeBadge({ mode }: { mode: Mode }) { return <span className={`badge tone-${modes[mode].tone}`}>{modes[mode].label}</span>; }
const tabs = [ { href: "/counter", label: "Counter", Icon: ScanLine }, { href: "/orders", label: "Orders", Icon: ShoppingBag }, { href: "/khata", label: "Khata", Icon: NotebookPen }, { href: "/salaahkaar", label: "Salaahkaar", Icon: Mic } ];
export function MerchantShell({ children, fixture, date }: { children: ReactNode; fixture: ShellFixture; date: string }) {
  const path = usePathname();
  const [showModes, setShowModes] = useState(false);
  return <div className="merchant-shell"><a href="#main-content" className="skip-link">Skip to content</a>
    <header className="shell-header"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold text-navy-950">{fixture.shopName}</p><p className="caption mt-1 text-muted">{date}</p></div><Link className="btn btn-quiet shrink-0 px-3" href="/log" aria-label="Open live log"><ListChecks aria-hidden="true" /><span className="caption">Log</span></Link></div><button type="button" className="mt-2 flex min-h-12 w-full items-center justify-end gap-2 rounded-sm" onClick={() => setShowModes(true)} aria-haspopup="dialog" aria-label="Explain demo and payment modes"><ModeBadge mode={fixture.dataMode} /><ModeBadge mode={fixture.paymentMode} /><ChevronDown aria-hidden="true" /></button></header>
    <main id="main-content" tabIndex={-1} className="shell-content">{children}</main>
    <nav aria-label="Merchant navigation" className="bottom-nav">{tabs.map(({ href, label, Icon }) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined} className="nav-link"><span className={`grid h-8 w-8 place-items-center rounded-full ${href === "/salaahkaar" ? "bg-sky-500 text-navy-950" : ""}`}><Icon aria-hidden="true" /></span>{label}</Link>)}</nav>
    <Sheet title="Workspace mode" open={showModes} onClose={() => setShowModes(false)}><div className="space-y-5">{[fixture.dataMode, fixture.paymentMode].map(mode => <div key={mode}><ModeBadge mode={mode} /><p className="secondary mt-2">{modes[mode].explanation}</p></div>)}</div></Sheet>
  </div>;
}

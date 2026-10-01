"use client";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button, EmptyState } from "@/components/ui/primitives";
import { MoneyText, VoiceComposer } from "./components";
import { suggestions } from "@/lib/ui-fixtures";

function SetupNote() { return <p className="caption mt-6 flex items-start gap-2 text-muted"><ShieldCheck aria-hidden="true" />Demo workspace · data and services not connected.</p>; }
export function OrdersScreen() { return <><h1>Orders</h1><p className="secondary mb-6 mt-1">Online orders, ek jagah.</p><EmptyState title="Orders yahan dikhenge" description="The storefront isn’t connected yet. New orders will appear here once it is ready." /><SetupNote /></>; }
export function KhataScreen() { return <><h1>Khata</h1><p className="secondary mb-6 mt-1">Udhaar ka saaf hisaab.</p><section className="mb-6 rounded-xl bg-navy-950 p-6 text-surface"><h2 className="text-sm font-normal text-on-dark-muted">Total to collect</h2><div className="my-3"><MoneyText paise={null} size="display" /></div><p className="caption text-on-dark-muted">Balance unavailable · ledger not connected</p></section><p className="section-label mb-3">Collect first</p><EmptyState title="Khata abhi juda nahi hai" description="Customer balances and ageing will come from the ledger. No dues have been loaded." /><SetupNote /></>; }
export function SalaahkaarScreen() {
  const [text, setText] = useState("");
  return <div className="pb-52"><section className="-mx-4 -mt-6 rounded-b-xl bg-navy-950 px-4 py-6 text-surface"><h1 className="text-surface">Salaahkaar</h1><p className="mt-2 text-sm text-on-dark-muted">Aapka dukaan adviser · Hindi / Hinglish</p><div className="mt-5 flex flex-col gap-2">{suggestions.map(s => <button key={s} className="min-h-12 rounded-md bg-navy-700 px-3 py-2 text-left text-sm" onClick={() => setText(s)}>{s}</button>)}</div></section><div className="my-6"><EmptyState title="Apni dukaan ke baare mein poochiye" description="Sales aur stock judne ke baad, jawaab unhi ke hisaab se milenge." /></div><div className="fixed bottom-[calc(81px+env(safe-area-inset-bottom))] left-1/2 z-20 w-full max-w-[420px] -translate-x-1/2 border-t border-line bg-surface p-4"><VoiceComposer value={text} onChange={setText} disabled /><Button className="mt-3 w-full" disabled>Ask Salaahkaar</Button></div><SetupNote /></div>;
}

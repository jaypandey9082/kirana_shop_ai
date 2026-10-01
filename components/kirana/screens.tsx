"use client";
import { ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { MoneyText } from "./components";

function SetupNote() { return <p className="caption mt-6 flex items-start gap-2 text-muted"><ShieldCheck aria-hidden="true" />Demo workspace · data and services not connected.</p>; }
export function OrdersScreen() { return <><h1>Orders</h1><p className="secondary mb-6 mt-1">Online orders, ek jagah.</p><EmptyState title="Orders yahan dikhenge" description="The storefront isn’t connected yet. New orders will appear here once it is ready." /><SetupNote /></>; }
export function KhataScreen() { return <><h1>Khata</h1><p className="secondary mb-6 mt-1">Udhaar ka saaf hisaab.</p><section className="mb-6 rounded-xl bg-navy-950 p-6 text-surface"><h2 className="text-sm font-normal text-on-dark-muted">Total to collect</h2><div className="my-3"><MoneyText paise={null} size="display" /></div><p className="caption text-on-dark-muted">Balance unavailable · ledger not connected</p></section><p className="section-label mb-3">Collect first</p><EmptyState title="Khata abhi juda nahi hai" description="Customer balances and ageing will come from the ledger. No dues have been loaded." /><SetupNote /></>; }

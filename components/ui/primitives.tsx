"use client";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertCircle, Inbox, X } from "lucide-react";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" }) {
  return <button type="button" className={`btn btn-${variant} ${className}`} {...props} />;
}
export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="card py-8 text-center"><span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-sky-100 text-blue-600"><Inbox aria-hidden="true" /></span><h2>{title}</h2><p className="secondary mx-auto mt-2 max-w-64">{description}</p></div>;
}
export function Skeleton() {
  return <div role="status" aria-label="Loading" className="card space-y-4"><div className="pulse h-4 w-2/3 rounded-sm bg-line" /><div className="pulse h-4 w-full rounded-sm bg-line" /><div className="pulse h-4 w-1/2 rounded-sm bg-line" /><span className="sr-only">Loading…</span></div>;
}
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="rounded-lg bg-danger-tint p-4 text-danger"><div className="flex gap-3"><AlertCircle aria-hidden="true" /><p>{message}</p></div>{onRetry && <Button variant="quiet" className="mt-3" onClick={onRetry}>Try again</Button>}</div>;
}
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return <dialog ref={ref} className="sheet" aria-labelledby={titleId} onCancel={onClose} onClose={onClose}><div className="mb-4 flex items-center justify-between gap-4"><h2 id={titleId} className="text-lg">{title}</h2><Button variant="quiet" aria-label="Close sheet" onClick={onClose}><X aria-hidden="true" /></Button></div>{children}</dialog>;
}
export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => { const timeout = setTimeout(onDismiss, 4000); return () => clearTimeout(timeout); }, [onDismiss]);
  return <div role="status" aria-live="polite" className="toast">{message}</div>;
}

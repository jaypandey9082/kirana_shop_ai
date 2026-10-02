"use client";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertCircle, Inbox, RotateCcw, X, type LucideIcon } from "lucide-react";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" | "dark" }) {
  return <button type="button" className={`btn btn-${variant} ${className}`} {...props} />;
}
export function EmptyState({ title, description, icon: Icon = Inbox, children }: { title: string; description: string; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <div className="card px-6 py-10 text-center">
      <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-sky-100 text-blue-600"><Icon aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p className="secondary mx-auto mt-1 max-w-64">{description}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="card space-y-3">
      <div className="skeleton h-4 w-1/3" />
      {Array.from({ length: rows }, (_, i) => <div key={i} className={`skeleton h-10 ${i % 2 ? "w-4/5" : "w-full"}`} />)}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl bg-danger-tint p-4 text-danger">
      <AlertCircle className="mt-0.5" aria-hidden="true" />
      <p className="flex-1 text-sm font-medium leading-6">{message}</p>
      {onRetry && <button type="button" className="icon-btn -my-2 -mr-2 text-danger" aria-label="Try again" onClick={onRetry}><RotateCcw aria-hidden="true" /></button>}
    </div>
  );
}
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return (
    <dialog ref={ref} className="sheet" aria-labelledby={titleId} onCancel={onClose} onClose={onClose}
      onClick={(e) => {
        // Tap on the dimmed backdrop (outside the sheet's box) closes it.
        const r = e.currentTarget.getBoundingClientRect();
        if (e.target === e.currentTarget && (e.clientY < r.top || e.clientX < r.left || e.clientX > r.right)) onClose();
      }}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id={titleId} className="text-lg">{title}</h2>
        <button type="button" className="icon-btn -mr-2 bg-canvas" aria-label="Close" onClick={onClose}><X aria-hidden="true" /></button>
      </div>
      {children}
    </dialog>
  );
}
export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => { const timeout = setTimeout(onDismiss, 4000); return () => clearTimeout(timeout); }, [onDismiss]);
  return <div role="status" aria-live="polite" className="toast">{message}</div>;
}
/** Screen title + one-line subtitle, with an optional action on the right. */
export function ScreenHead({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return <div className="screen-head"><div className="min-w-0"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{children}</div>;
}

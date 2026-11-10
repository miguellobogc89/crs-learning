"use client";
// Piezas de interfaz compartidas del módulo: modal, texto con negritas y barra de progreso.
import { Fragment, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/** Muestra en negrita lo que va entre **dobles asteriscos**. */
export function Rich({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span className={className}>
      {parts.map((p, k) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <strong key={k} className="font-semibold text-slate-900">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={k}>{p}</Fragment>
        ),
      )}
    </span>
  );
}

/** Quita las marcas de negrita (para títulos y textos cortos). */
export const plainText = (s: string | null | undefined) => (s ?? "").replace(/\*\*/g, "");

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`flex max-h-[92vh] w-full ${width} flex-col border border-slate-200 bg-white shadow-2xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="-mr-2 p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-6 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Dónde está el precio entre el stop y el objetivo. */
export function StopTargetBar({ stop, target, price, entry }: { stop: number; target: number; price: number | null; entry: number }) {
  const lo = Math.min(stop, target);
  const hi = Math.max(stop, target);
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo || 1)) * 100));
  return (
    <div className="relative h-1.5 w-full bg-gradient-to-r from-red-200 via-slate-200 to-emerald-200" title="Entre el stop (izquierda) y el objetivo (derecha)">
      <span className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-slate-400" style={{ left: `${pos(entry)}%` }} />
      {price !== null && <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 border-2 border-white bg-slate-900" style={{ left: `${pos(price)}%` }} />}
    </div>
  );
}

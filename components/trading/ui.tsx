"use client";
// Piezas de interfaz compartidas del módulo, con el estilo de Inicio: tarjetas, pastillas, avatares,
// cabeceras de sección, modal, texto con negritas y barra de progreso.
import { Fragment, useEffect, type ComponentType, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Bot, Loader2, X } from "lucide-react";
import { card, pct } from "./format";

export { card };

/** Punto de color de cada agente. */
export const AGENT_DOT: Record<string, string> = { emerald: "bg-emerald-500", violet: "bg-violet-500", blue: "bg-blue-500", orange: "bg-orange-500", slate: "bg-slate-800" };
/** Avatar y etiqueta de perfil de cada agente. */
export const AVATAR: Record<string, string> = { emerald: "bg-emerald-500", violet: "bg-violet-500", blue: "bg-blue-500", orange: "bg-orange-500", slate: "bg-slate-300" };
export const PILL: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700",
  violet: "bg-violet-50 text-violet-700",
  blue: "bg-blue-50 text-blue-700",
  orange: "bg-orange-50 text-orange-700",
  slate: "bg-slate-100 text-slate-600",
};
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Rentabilidad en pastilla verde / roja / gris con flecha. */
export function ReturnPill({ value, big = false }: { value: number; big?: boolean }) {
  const up = value > 0.05;
  const down = value < -0.05;
  const cls = up ? "bg-emerald-50 text-emerald-700" : down ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600";
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold tabular-nums ${cls} ${big ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"}`}>
      {Icon && <Icon className={big ? "h-4 w-4" : "h-3.5 w-3.5"} />}
      {pct(value)}
    </span>
  );
}

/** Avatar redondo de un agente. */
export function AgentAvatar({ color, size = "md" }: { color: string; size?: "sm" | "md" | "lg" }) {
  const box = size === "sm" ? "h-6 w-6" : size === "lg" ? "h-10 w-10" : "h-8 w-8";
  const icon = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-full ${AVATAR[color] ?? AVATAR.slate} text-white`}>
      <Bot className={icon} />
    </span>
  );
}

/** Pastilla pequeña de color (perfil, estado, mercado…). */
export function Pill({ children, color = "slate", className = "" }: { children: ReactNode; color?: string; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL[color] ?? PILL.slate} ${className}`}>{children}</span>;
}

/** Título de sección con icono en cuadrado de color, como «Tu cartera». */
export function SectionTitle({
  icon: Icon,
  children,
  tint = "indigo",
  size = "lg",
}: {
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
  tint?: "indigo" | "blue" | "emerald" | "amber" | "red" | "violet" | "slate";
  size?: "lg" | "base";
}) {
  const tints = {
    indigo: "bg-indigo-50 text-indigo-600",
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-50 text-red-600",
    violet: "bg-violet-50 text-violet-600",
    slate: "bg-slate-100 text-slate-600",
  } as const;
  const big = size === "lg";
  return (
    <h2 className={`flex min-w-0 items-center gap-3 font-semibold text-slate-900 ${big ? "text-lg" : "text-base"}`}>
      {Icon && (
        <span className={`flex shrink-0 items-center justify-center rounded-xl ${tints[tint]} ${big ? "h-9 w-9" : "h-8 w-8"}`}>
          <Icon className={big ? "h-5 w-5" : "h-4 w-4"} />
        </span>
      )}
      <span className="min-w-0">{children}</span>
    </h2>
  );
}

/** Cabecera de una tarjeta: título a la izquierda y acciones a la derecha. */
export function CardHeader({ children, actions, divider = false }: { children: ReactNode; actions?: ReactNode; divider?: boolean }) {
  return (
    <header className={`flex flex-wrap items-center justify-between gap-3 px-6 pt-5 ${divider ? "border-b border-slate-100 pb-4" : "pb-2"}`}>
      {children}
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Cargando… dentro de una tarjeta. */
export function LoadingCard({ height = "h-48" }: { height?: string }) {
  return (
    <div className={`${card} flex ${height} items-center justify-center`}>
      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
    </div>
  );
}

/** Aviso de error. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
      {children}
    </p>
  );
}

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
      <div className={`flex max-h-[92vh] w-full ${width} flex-col overflow-hidden rounded-t-2xl border border-slate-100 bg-white shadow-2xl sm:rounded-2xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-slate-900">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="-mr-2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3">{footer}</div>}
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
    <div className="relative h-1.5 w-full rounded-full bg-gradient-to-r from-red-200 via-slate-200 to-emerald-200" title="Entre el stop (izquierda) y el objetivo (derecha)">
      <span className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-slate-400" style={{ left: `${pos(entry)}%` }} />
      {price !== null && <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900 shadow-sm" style={{ left: `${pos(price)}%` }} />}
    </div>
  );
}

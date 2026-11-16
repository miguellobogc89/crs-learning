"use client";
// Ficha estándar de un agente en la interfaz: dos pastillas (estilo y de dónde saca las compras) y la ficha
// completa con las mismas cinco líneas para todos.
import { BookOpen, Flag, LogOut, Radar, Wallet } from "lucide-react";
import type { AgentSpec } from "@/lib/trading/agents/spec";
import { FAMILY_LABEL } from "@/lib/trading/agents/spec";

const FAMILY_CLS: Record<AgentSpec["family"], string> = {
  faro: "bg-blue-50 text-blue-700",
  propio: "bg-amber-50 text-amber-800",
  referencia: "bg-slate-100 text-slate-600",
};

export function SpecPills({ spec, className = "" }: { spec: AgentSpec | null; className?: string }) {
  if (!spec) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">{spec.style}</span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${FAMILY_CLS[spec.family]}`}>{FAMILY_LABEL[spec.family]}</span>
    </span>
  );
}

export function SpecSheet({ spec }: { spec: AgentSpec | null }) {
  if (!spec) return <p className="px-4 py-6 text-sm text-slate-500">Este agente no tiene ficha.</p>;
  const rows: [typeof Radar, string, string][] = [
    [Radar, "De dónde saca las compras", spec.source],
    [BookOpen, "Qué coge", spec.takes],
    [Wallet, "Cuánto pone", spec.size],
    [LogOut, "Cuándo sale", spec.exit],
    ...(spec.goal ? ([[Flag, "Su meta", spec.goal]] as [typeof Radar, string, string][]) : []),
  ];
  return (
    <div className="px-4 py-4">
      <SpecPills spec={spec} />
      <dl className="mt-3 divide-y divide-slate-100">
        {rows.map(([Icon, label, text]) => (
          <div key={label} className="flex gap-3 py-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
              <dd className="mt-0.5 text-sm leading-relaxed text-slate-700">{text}</dd>
            </div>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        Ningún agente decide con IA: la IA (FARO) solo publica ideas, y cada agente aplica siempre las mismas reglas. Así cada operación se puede explicar y
        comparar.
      </p>
    </div>
  );
}

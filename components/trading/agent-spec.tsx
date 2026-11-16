"use client";
// Ficha estándar de un agente en la interfaz: pastillas de familia (Cripto / Stock) y estilo, y la ficha completa con las
// mismas cuatro líneas para todos (qué ideas coge, cuándo, cuánto pone y cuándo sale).
import { BookOpen, Clock, LogOut, Wallet } from "lucide-react";
import type { AgentSpec } from "@/lib/trading/agents/spec";

export function SpecPills({ spec, className = "" }: { spec: AgentSpec | null; className?: string }) {
  if (!spec) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${spec.market === "Stock" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800"}`}>{spec.market}</span>
      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">{spec.style}</span>
    </span>
  );
}

export function SpecSheet({ spec }: { spec: AgentSpec | null }) {
  if (!spec) return <p className="px-4 py-6 text-sm text-slate-500">Este agente no tiene ficha.</p>;
  const rows: [typeof BookOpen, string, string][] = [
    [BookOpen, "Qué ideas coge", spec.ideas],
    [Clock, "Cuándo", spec.when],
    [Wallet, "Cuánto pone", spec.size],
    [LogOut, "Cuándo sale", spec.exit],
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
        Todos los agentes toman de la misma carta: las ideas que publica FARO, el escáner de rupturas de 20 días y el contexto del mercado (la fase). Ninguno decide con
        IA: cada uno aplica siempre sus reglas, así que cada operación se puede explicar y comparar. Todos empezaron con 1.000 €.
      </p>
    </div>
  );
}

"use client";
import { AlertCircle, Check, Clock3, Loader2, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Step, StepState } from "./pipeline-steps";

const DOT: Record<StepState, string> = {
  done: "border-emerald-500 bg-emerald-500 text-white",
  running: "border-[#0A58FF] bg-white text-[#0A58FF]",
  waiting: "border-amber-500 bg-amber-50 text-amber-600",
  error: "border-rose-500 bg-rose-50 text-rose-600",
  pending: "border-slate-200 bg-white text-slate-300",
  skipped: "border-slate-200 bg-slate-50 text-slate-300",
};
const LABEL: Record<StepState, string> = { done: "Completado", running: "En curso", waiting: "Listo para continuar", error: "Con error", pending: "Pendiente", skipped: "No aplica" };

function Dot({ state, index }: { state: StepState; index: number }) {
  const icon = state === "done" ? <Check className="size-3.5" /> : state === "running" ? <Loader2 className="size-3.5 animate-spin" />
    : state === "waiting" ? <Clock3 className="size-3.5" /> : state === "error" ? <AlertCircle className="size-3.5" />
    : state === "skipped" ? <Minus className="size-3.5" /> : <span className="text-[11px] font-semibold">{index + 1}</span>;
  return <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors", DOT[state])}>{icon}</span>;
}

/** Horizontal progress across the six stages of an import. */
export function PipelineStepper({ steps }: { steps: Step[] }) {
  return <ol className="flex items-start" aria-label="Progreso de la importación">
    {steps.map((step, i) => <li key={step.key} className="flex flex-1 flex-col items-center gap-1.5 text-center" aria-current={step.state === "running" || step.state === "waiting" ? "step" : undefined}>
      <div className="flex w-full items-center">
        <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : steps[i - 1].state === "done" ? "bg-emerald-400" : "bg-slate-200")} />
        <Dot state={step.state} index={i} />
        <span className={cn("h-0.5 flex-1", i === steps.length - 1 ? "bg-transparent" : step.state === "done" ? "bg-emerald-400" : "bg-slate-200")} />
      </div>
      <span className={cn("text-[11px] font-medium", step.state === "pending" || step.state === "skipped" ? "text-slate-400" : "text-slate-700")}>{step.name}</span>
    </li>)}
  </ol>;
}

/** One stage as a card: name, state, one-line result; details unfold on demand. */
export function StepCard({ step, index, open, children }: { step: Step; index: number; open?: boolean; children?: ReactNode }) {
  const body = <div className="flex items-start gap-3">
    <Dot state={step.state} index={index} />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold text-slate-900">{step.name}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium",
          step.state === "done" ? "bg-emerald-50 text-emerald-700" : step.state === "error" ? "bg-rose-50 text-rose-700"
          : step.state === "waiting" ? "bg-amber-50 text-amber-700" : step.state === "running" ? "bg-blue-50 text-[#0A58FF]" : "bg-slate-100 text-slate-500")}>{LABEL[step.state]}</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{step.summary ?? step.description}</p>
      {step.error && <p className="mt-1 text-xs text-rose-600">{step.error}</p>}
    </div>
  </div>;
  if (!children) return <div className="rounded-xl border border-slate-200 bg-white p-3">{body}</div>;
  return <details open={open} className="group rounded-xl border border-slate-200 bg-white [&_summary::-webkit-details-marker]:hidden">
    <summary className="cursor-pointer list-none p-3 hover:bg-slate-50/60">{body}</summary>
    <div className="border-t border-slate-100 p-3 text-sm">{children}</div>
  </details>;
}

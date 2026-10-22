"use client";

import { Check, FileStack, Network, ScanSearch, ShieldCheck, Sparkles } from "lucide-react";
import type { KnowledgeImportModalStep } from "./knowledge-import-modal.types";

const STEPS = [
  { id: "upload", label: "Documentación preparada", icon: FileStack },
  { id: "data-map", label: "Construcción del mapa de datos", icon: Network },
  { id: "analysis", label: "Análisis de registros", icon: ScanSearch },
  { id: "validation", label: "Validación", icon: ShieldCheck },
  { id: "completed", label: "Resultado", icon: Sparkles },
] as const;

const SEGMENTS = Array.from({ length: 12 }, (_, index) => index);

export function KnowledgeImportModalProgress({
  currentStep,
  mapReady = false,
  recordsReady = false,
  validationReady = false,
}: {
  currentStep: KnowledgeImportModalStep;
  mapReady?: boolean;
  recordsReady?: boolean;
  validationReady?: boolean;
}) {
  // Visual milestones derived from real ingestion results, not invented backend phases.
  const index = currentStep === "completed" ? 4
    : currentStep === "proposal" || currentStep === "analysis_result" ? 3
    : currentStep === "upload" ? 0
    : validationReady ? 3
    : recordsReady ? 3
    : mapReady ? 2
    : 1;

  return (
    <nav aria-label="Progreso de importación" className="shrink-0 border-b border-slate-100 bg-white px-5 py-5 sm:px-7">
      <style>{`@keyframes crs-segment-step {
        0%, 8% { background-color: #CBD5E1; }
        9%, 78% { background-color: #6AA9F8; }
        79%, 100% { background-color: #CBD5E1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .crs-animated-segment { animation: none !important; }
      }`}</style>
      <div className="mx-auto flex max-w-[980px] items-start">
        {STEPS.map((step, position) => {
          const Icon = step.icon;
          const completed = position < index;
          const current = position === index;
          return (
            <div key={step.id} className="flex min-w-0 flex-1 items-start last:flex-none">
              <div className="flex w-[60px] shrink-0 flex-col items-center gap-2 sm:w-[112px]">
                <span className={`flex size-10 items-center justify-center rounded-2xl border shadow-[inset_0_2px_2px_rgba(255,255,255,.8),0_4px_9px_rgba(30,64,175,.12)] transition-colors sm:size-11 ${completed ? "border-[#0A58FF] bg-gradient-to-br from-[#68B1FF] to-[#0A58FF] text-white" : current ? "border-blue-300 bg-gradient-to-br from-white via-blue-100 to-blue-200 text-[#0A58FF]" : "border-slate-200 bg-gradient-to-br from-white to-slate-100 text-slate-400"}`}>
                  {completed ? <Check className="size-5" strokeWidth={3} /> : <Icon className="size-5 drop-shadow-sm" strokeWidth={2.2} />}
                </span>
                <span className={`text-center text-[10px] font-semibold leading-tight sm:text-[11px] ${current || completed ? "text-slate-900" : "text-slate-400"}`}>{step.label}</span>
              </div>
              {position < STEPS.length - 1 ? (
                <div className="mx-1 mt-[17px] flex h-[7px] min-w-2 flex-1 gap-[3px] sm:mx-2 sm:mt-[19px]" aria-hidden="true">
                  {SEGMENTS.map(segment => (
                    <span
                      key={segment}
                      className={`h-full min-w-0 flex-1 rounded-[2px] ${completed ? "bg-[#6AA9F8]" : "bg-slate-300"} ${current && currentStep !== "completed" ? "crs-animated-segment" : ""}`}
                      style={current && currentStep !== "completed" ? {
                        animation: "crs-segment-step 3.6s steps(1, end) infinite",
                        animationDelay: `${segment * 0.22}s`,
                      } : undefined}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import { Check, FileStack, FolderTree, ScanSearch, Sparkles } from "lucide-react";
import type { KnowledgeImportModalStep } from "./knowledge-import-modal.types";

const STEPS = [
  { id: "upload", label: "Documentos", icon: FileStack },
  { id: "analyzing", label: "Análisis", icon: ScanSearch },
  { id: "proposal", label: "Reconocimiento", icon: FolderTree },
  { id: "completed", label: "Resultado", icon: Sparkles },
] as const;

export function KnowledgeImportModalProgress({ currentStep }: { currentStep: KnowledgeImportModalStep }) {
  const active = Math.max(0, STEPS.findIndex(step => step.id === currentStep));
  const index = active < 0 ? 3 : active;
  return (
    <nav aria-label="Progreso de importación" className="shrink-0 border-b border-slate-100 bg-white px-7 py-5">
      <div className="mx-auto flex max-w-[780px] items-start">
        {STEPS.map((step, position) => {
          const Icon = step.icon;
          const completed = position < index;
          const current = position === index;
          return (
            <div key={step.id} className="flex min-w-0 flex-1 items-start last:flex-none">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <span className={`flex size-11 items-center justify-center rounded-2xl border shadow-[inset_0_2px_2px_rgba(255,255,255,.8),0_4px_9px_rgba(30,64,175,.12)] transition-colors ${completed ? "border-[#0A58FF] bg-gradient-to-br from-[#68B1FF] to-[#0A58FF] text-white" : current ? "border-blue-300 bg-gradient-to-br from-white via-blue-100 to-blue-200 text-[#0A58FF]" : "border-slate-200 bg-gradient-to-br from-white to-slate-100 text-slate-400"}`}>
                  {completed ? <Check className="size-5" strokeWidth={3} /> : <Icon className="size-5 drop-shadow-sm" strokeWidth={2.2} />}
                </span>
                <span className={`text-center text-[11px] font-semibold ${current || completed ? "text-slate-900" : "text-slate-400"}`}>{step.label}</span>
              </div>
              {position < STEPS.length - 1 ? (
                <div className="relative mx-3 mt-[19px] h-[7px] min-w-4 flex-1 overflow-hidden rounded-full bg-[repeating-linear-gradient(90deg,#CBD5E1_0px,#CBD5E1_12px,transparent_12px,transparent_20px)]">
                  <div className={`absolute inset-y-0 left-0 rounded-full bg-[#0A58FF] transition-all duration-700 ${position < index ? "w-full" : position === index ? "w-0" : "w-0"}`} />
                  {position === index && currentStep !== "completed" ? <div className="absolute inset-y-0 w-1/3 animate-[pulse_1.3s_ease-in-out_infinite] rounded-full bg-[#0A58FF]/80" /> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

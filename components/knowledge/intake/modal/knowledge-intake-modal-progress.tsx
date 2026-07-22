// components/knowledge/intake/modal/knowledge-intake-modal-progress.tsx
"use client";

import {
  Check,
  FileStack,
  FolderTree,
  ScanSearch,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { KnowledgeIntakeModalStep } from "./knowledge-intake-modal.types";

type Props = {
  currentStep: KnowledgeIntakeModalStep;
};

type VisibleStep =
  | "upload"
  | "analyzing"
  | "proposal"
  | "completed";

type StepConfig = {
  id: VisibleStep;
  label: string;
  description: string;
  icon: typeof FileStack;
};

const STEPS: StepConfig[] = [
  {
    id: "upload",
    label: "Documentos",
    description: "Selección de archivos",
    icon: FileStack,
  },
  {
    id: "analyzing",
    label: "Análisis",
    description: "Revisión inteligente",
    icon: ScanSearch,
  },
  {
    id: "proposal",
    label: "Propuesta",
    description: "Estructura sugerida",
    icon: FolderTree,
  },
  {
    id: "completed",
    label: "Resultado",
    description: "Incorporación final",
    icon: Sparkles,
  },
];

function normalizeStep(
  step: KnowledgeIntakeModalStep,
): VisibleStep {
  if (step === "upload") {
    return "upload";
  }

  if (step === "analyzing") {
    return "analyzing";
  }

  if (step === "proposal") {
    return "proposal";
  }

  return "completed";
}

export function KnowledgeIntakeModalProgress({
  currentStep,
}: Props) {
  const normalizedStep =
    normalizeStep(currentStep);

  const activeStepIndex = STEPS.findIndex(
    (step) => step.id === normalizedStep,
  );

  return (
    <div className="shrink-0 border-y border-border bg-muted/20 px-6 py-4">
      <div className="relative grid grid-cols-4 gap-4">
        <div
          aria-hidden="true"
          className="absolute left-[12.5%] right-[12.5%] top-5 h-px bg-border"
        />

        <div
          aria-hidden="true"
          className="absolute left-[12.5%] top-5 h-px bg-foreground transition-[width] duration-500"
          style={{
            width:
              activeStepIndex === 0
                ? "0%"
                : activeStepIndex === 1
                  ? "25%"
                  : activeStepIndex === 2
                    ? "50%"
                    : "75%",
          }}
        />

        {STEPS.map((step, index) => {
          const Icon = step.icon;

          const isActive =
            index === activeStepIndex;

          const isCompleted =
            index < activeStepIndex;

          return (
            <div
              key={step.id}
              className="relative z-10 flex min-w-0 flex-col items-center text-center"
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border bg-background transition-all duration-300",
                  isActive &&
                    "border-sky-500 bg-sky-500 text-white shadow-sm ring-4 ring-sky-500/15",
                  isCompleted &&
                    "border-emerald-600 bg-emerald-600 text-white",
                  !isActive &&
                    !isCompleted &&
                    "border-border text-muted-foreground",
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4 stroke-[2.5]" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>

              <div className="mt-2 min-w-0">
                <p
                  className={cn(
                    "truncate text-xs font-semibold transition-colors",
                    isActive || isCompleted
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </p>

                <p
                  className={cn(
                    "mt-0.5 hidden truncate text-[11px] sm:block",
                    isActive
                      ? "text-muted-foreground"
                      : "text-muted-foreground/70",
                  )}
                >
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
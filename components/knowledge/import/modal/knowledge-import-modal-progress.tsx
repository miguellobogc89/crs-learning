// components/knowledge/import/modal/knowledge-import-modal-progress.tsx

"use client";

import {
  Check,
  FileStack,
  FolderTree,
  ScanSearch,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { KnowledgeImportModalStep } from "./knowledge-import-modal.types";

type Props = {
  currentStep: KnowledgeImportModalStep;
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
    description: "Selección",
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
    description: "Organización",
    icon: FolderTree,
  },
  {
    id: "completed",
    label: "Resultado",
    description: "Incorporación",
    icon: Sparkles,
  },
];

function normalizeStep(
  step: KnowledgeImportModalStep,
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

export function KnowledgeImportModalProgress({
  currentStep,
}: Props) {
  const normalizedStep =
    normalizeStep(currentStep);

  const activeStepIndex =
    STEPS.findIndex(
      (step) =>
        step.id === normalizedStep,
    );

  return (
    <div className="shrink-0 border-b border-slate-100 bg-white px-8 py-4">
      <div className="relative mx-auto grid max-w-[760px] grid-cols-4">
        <div
          aria-hidden="true"
          className="absolute left-[12.5%] right-[12.5%] top-[17px] h-px bg-slate-200"
        />

        <div
          aria-hidden="true"
          className="absolute left-[12.5%] top-[17px] h-px bg-emerald-500 transition-[width] duration-500"
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

        {STEPS.map(
          (step, index) => {
            const Icon = step.icon;

            const isActive =
              index ===
              activeStepIndex;

            const isCompleted =
              index <
              activeStepIndex;

            return (
              <div
                key={step.id}
                className="relative z-10 flex min-w-0 flex-col items-center text-center"
              >
                <div
                  className={cn(
                    "flex size-[34px] items-center justify-center rounded-full border bg-white transition-all duration-300",
                    isActive &&
                      "border-[#0A58FF] bg-[#0A58FF] text-white ring-[5px] ring-[#0A58FF]/10",
                    isCompleted &&
                      "border-emerald-500 bg-emerald-500 text-white",
                    !isActive &&
                      !isCompleted &&
                      "border-slate-200 text-slate-400",
                  )}
                >
                  {isCompleted ? (
                    <Check
                      className="size-4"
                      strokeWidth={2.6}
                    />
                  ) : (
                    <Icon
                      className="size-4"
                      strokeWidth={2}
                    />
                  )}
                </div>

                <div className="mt-2 min-w-0">
                  <p
                    className={cn(
                      "truncate text-[11px] font-semibold",
                      isActive ||
                        isCompleted
                        ? "text-slate-950"
                        : "text-slate-400",
                    )}
                  >
                    {step.label}
                  </p>

                  <p
                    className={cn(
                      "mt-0.5 hidden truncate text-[10px] sm:block",
                      isActive
                        ? "text-slate-500"
                        : "text-slate-400",
                    )}
                  >
                    {
                      step.description
                    }
                  </p>
                </div>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}
// components/knowledge/intake/modal/knowledge-intake-modal-progress.tsx

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KnowledgeIntakeModalStep } from "./knowledge-intake-modal.types";

const steps: Array<{ id: KnowledgeIntakeModalStep; label: string }> = [
  { id: "upload", label: "Documentos" },
  { id: "analyzing", label: "Análisis" },
  { id: "proposal", label: "Propuesta" },
  { id: "completed", label: "Resultado" },
];

type Props = { currentStep: KnowledgeIntakeModalStep };

export function KnowledgeIntakeModalProgress({ currentStep }: Props) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <div className="border-b border-border bg-muted/20 px-6 py-4">
      <div className="grid grid-cols-4 gap-2">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <div key={step.id} className="flex min-w-0 items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  isCompleted && "border-emerald-200 bg-emerald-50 text-emerald-700",
                  isCurrent && "border-cyan-200 bg-cyan-50 text-cyan-700",
                  !isCompleted && !isCurrent && "border-border bg-background text-muted-foreground",
                )}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" />
                ) : isCurrent && currentStep === "analyzing" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  index + 1
                )}
              </div>
              <span className={cn("truncate text-xs font-medium", isCurrent || isCompleted ? "text-foreground" : "text-muted-foreground")}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

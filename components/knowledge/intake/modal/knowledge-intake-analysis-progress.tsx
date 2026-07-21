    // components/knowledge/intake/modal/knowledge-intake-analysis-progress.tsx

import {
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";

type Props = {
  activeStep: number;
};

const steps = [
  "Extrayendo contenido",
  "Interpretando la documentación",
  "Comparando con el repositorio",
  "Buscando duplicados y versiones",
  "Evaluando la estructura",
  "Preparando la propuesta",
];

export function KnowledgeIntakeAnalysisProgress({
  activeStep,
}: Props) {
  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const isCompleted =
          index < activeStep;

        const isActive =
          index === activeStep;

        return (
          <div
            key={step}
            className="flex items-center gap-3 text-sm"
          >
            {isCompleted ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            ) : null}

            {isActive ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-500" />
            ) : null}

            {!isCompleted &&
            !isActive ? (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
            ) : null}

            <span
              className={
                isActive
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }
            >
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}
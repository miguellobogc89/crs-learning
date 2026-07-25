// components/knowledge/intake/modal/knowledge-intake-analysis-step.tsx
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

const analysisSteps = [
  "Extrayendo el contenido",
  "Comparando con el repositorio",
  "Comprobando duplicados y versiones",
  "Evaluando artículos relacionados",
  "Preparando la propuesta",
];

type Props = { activeStep?: number };

export function KnowledgeIntakeAnalysisStep({ activeStep = 2 }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="space-y-3">
        {analysisSteps.map((step, index) => {
          const isCompleted = index < activeStep;
          const isActive = index === activeStep;
          return (
            <div key={step} className="flex items-center gap-3 text-sm">
              {isCompleted ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : null}
              {isActive ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-500" /> : null}
              {!isCompleted && !isActive ? <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" /> : null}
              <span className={isActive ? "font-medium text-foreground" : "text-muted-foreground"}>{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
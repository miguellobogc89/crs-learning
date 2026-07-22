// components/knowledge/intake/modal/knowledge-intake-loading-overlay.tsx
import { Loader2, Sparkles } from "lucide-react";

type Props = {
  title?: string;
  description?: string;
};

export function KnowledgeIntakeLoadingOverlay({
  title = "Aplicando la propuesta",
  description = "Estamos creando y actualizando la estructura del repositorio.",
}: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300">
        <Sparkles className="h-6 w-6" />
      </div>

      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>

      <div className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-cyan-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Procesando cambios
      </div>
    </div>
  );
}
// components/knowledge/intake/modal/knowledge-intake-loading-overlay.tsx

import {
  Loader2,
  Sparkles,
} from "lucide-react";

type Props = {
  visible: boolean;
  title?: string;
  description?: string;
};

export function KnowledgeIntakeLoadingOverlay({
  visible,
  title = "Aplicando la propuesta",
  description = "Estamos creando y actualizando la estructura del repositorio.",
}: Props) {
  if (!visible) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/85 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 text-center shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300">
          <Sparkles className="h-6 w-6" />
        </div>

        <h3 className="mt-4 text-lg font-semibold text-foreground">
          {title}
        </h3>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>

        <div className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-cyan-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Procesando cambios
        </div>
      </div>
    </div>
  );
}
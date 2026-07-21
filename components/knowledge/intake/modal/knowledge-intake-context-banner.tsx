// components/knowledge/intake/modal/knowledge-intake-context-banner.tsx

import {
  FileText,
  FolderOpen,
  Library,
} from "lucide-react";

import type { KnowledgeIntakeContext } from "./knowledge-intake-modal.types";

type Props = {
  context: KnowledgeIntakeContext;
  articleTitle?: string | null;
  folderTitle?: string | null;
};

export function KnowledgeIntakeContextBanner({
  context,
  articleTitle,
  folderTitle,
}: Props) {
  if (context.origin === "article") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-cyan-600">
          <FileText className="h-4 w-4" />
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Artículo de referencia
          </p>

          <p className="mt-1 text-sm font-semibold text-foreground">
            {articleTitle ||
              "Artículo actual"}
          </p>

          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Se evaluará como destino prioritario,
            pero la IA podrá proponer otros artículos
            o carpetas.
          </p>
        </div>
      </div>
    );
  }

  if (context.origin === "folder") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-cyan-600">
          <FolderOpen className="h-4 w-4" />
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Carpeta de referencia
          </p>

          <p className="mt-1 text-sm font-semibold text-foreground">
            {folderTitle ||
              "Carpeta actual"}
          </p>

          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Se utilizará como destino preferente,
            sin impedir propuestas fuera de esta
            carpeta.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-cyan-600">
        <Library className="h-4 w-4" />
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Ámbito de análisis
        </p>

        <p className="mt-1 text-sm font-semibold text-foreground">
          Repositorio completo
        </p>

        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          La IA podrá proponer nuevas carpetas,
          artículos o actualizaciones en cualquier
          ubicación accesible.
        </p>
      </div>
    </div>
  );
}
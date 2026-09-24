
// components/knowledge/detail/general/knowledge-general-view.tsx

import {
  BrainCircuit,
  FileSearch,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { KnowledgeGeneralActions } from
  "./knowledge-general-actions";

import type {
  KnowledgeFile,
  KnowledgeGraph,
} from "../knowledge-detail.types";

import { KnowledgeEmptyState } from
  "../shared/knowledge-empty-state";

type Props = {
  hasDocuments: boolean;
  hasAnalysis: boolean;
  isRebuilding: boolean;

  knowledgeType: string;

  analysisJson: unknown;
  analysisStatus: string | null;
  analysisModel: string | null;

  graph: KnowledgeGraph | null;
  files: KnowledgeFile[];

  onRebuild: () => void;

  isEditing?: boolean;
  htmlDraft?: string;
  onHtmlDraftChange?: (html: string) => void;
};

export function KnowledgeGeneralView({
  hasDocuments,
  hasAnalysis,
  isRebuilding,
  knowledgeType,
  analysisJson,
  analysisStatus,
  analysisModel,
  graph,
  files,
  onRebuild,
  isEditing = false,
  htmlDraft,
  onHtmlDraftChange,
}: Props) {
  if (!hasDocuments) {
    return (
      <KnowledgeEmptyState
        icon={<FileSearch className="h-5 w-5" />}
        title="Añade documentación para construir el artículo"
        description="La incorporación de nuevas evidencias se realiza desde el flujo de Importación de Conocimiento de la carpeta."
      />
    );
  }

  if (!hasAnalysis) {
    return (
      <KnowledgeEmptyState
        icon={<BrainCircuit className="h-5 w-5" />}
        title="Todavía no hay un análisis disponible"
        description="Procesa la documentación del artículo para generar su resumen de calidad y trazabilidad."
        actionLabel={
          isRebuilding
            ? "Actualizando..."
            : "Actualizar conocimiento"
        }
        actionIcon={
          isRebuilding ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )
        }
        disabled={isRebuilding}
        onAction={onRebuild}
      />
    );
  }

  return (
    <KnowledgeGeneralActions
      analysisJson={analysisJson}
      isRebuilding={isRebuilding}
      onRebuild={onRebuild}
      isEditing={isEditing}
      htmlDraft={htmlDraft}
      onHtmlDraftChange={onHtmlDraftChange}
    />
  );
}
import {
  BrainCircuit,
  FileSearch,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { KnowledgeAnalysisPanel } from "@/components/knowledge/knowledge-analysis-panel";

import type {
  KnowledgeFile,
  KnowledgeGraph,
} from "../knowledge-detail.types";
import { KnowledgeEmptyState } from "../shared/knowledge-empty-state";

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
}: Props) {
  if (!hasDocuments) {
    return (
      <KnowledgeEmptyState
        icon={<FileSearch className="h-5 w-5" />}
        title="Anade documentacion para construir el articulo"
        description="La incorporacion de nuevas evidencias se realiza desde el flujo de Importacion de Conocimiento de la carpeta."
      />
    );
  }

  if (!hasAnalysis) {
    return (
      <KnowledgeEmptyState
        icon={<BrainCircuit className="h-5 w-5" />}
        title="Todavia no hay un analisis disponible"
        description="Procesa la documentacion del articulo para generar su resumen de calidad y trazabilidad."
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
    <KnowledgeAnalysisPanel
      mode="general"
      analysisJson={analysisJson}
      status={analysisStatus}
      model={analysisModel}
      knowledgeType={knowledgeType}
      graph={graph}
      files={files}
    />
  );
}

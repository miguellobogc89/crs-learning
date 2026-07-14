// components/knowledge/detail/details/knowledge-details-view.tsx

import {
  BrainCircuit,
  Loader2,
  RefreshCw,
  Upload,
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
  rebuildError: string | null;

  knowledgeType: string;

  analysisJson: unknown;
  analysisStatus: string | null;
  analysisModel: string | null;

  graph: KnowledgeGraph | null;
  files: KnowledgeFile[];

  onRebuild: () => void;
  onUpload: () => void;
};

export function KnowledgeDetailsView({
  hasDocuments,
  hasAnalysis,
  isRebuilding,
  rebuildError,
  knowledgeType,
  analysisJson,
  analysisStatus,
  analysisModel,
  graph,
  files,
  onRebuild,
  onUpload,
}: Props) {
  return (
    <>
      {!hasDocuments ? (
        <KnowledgeEmptyState
          icon={<Upload className="h-5 w-5" />}
          title="Añade documentación para generar el análisis"
          description="La IA necesita al menos un documento fuente para identificar conceptos, relaciones, aplicaciones y dependencias."
          actionLabel="Añadir documentación"
          actionIcon={
            <Upload className="mr-2 h-4 w-4" />
          }
          onAction={onUpload}
        />
      ) : !hasAnalysis ? (
        <KnowledgeEmptyState
          icon={
            <BrainCircuit className="h-5 w-5" />
          }
          title="Todavía no hay un análisis disponible"
          description="Procesa la documentación del artículo para generar su análisis detallado y extraer la estructura de conocimiento."
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
          onAction={onRebuild}
          disabled={isRebuilding}
        />
      ) : (
        <KnowledgeAnalysisPanel
          mode="details"
          analysisJson={analysisJson}
          status={analysisStatus}
          model={analysisModel}
          knowledgeType={knowledgeType}
          graph={graph}
          files={files}
        />
      )}

      {rebuildError ? (
        <p className="mt-4 text-center text-sm text-red-600">
          {rebuildError}
        </p>
      ) : null}
    </>
  );
}
// components/knowledge/detail/details/knowledge-details-view.tsx

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
  rebuildError: string | null;

  knowledgeType: string;

  analysisJson: unknown;
  analysisStatus: string | null;
  analysisModel: string | null;

  graph: KnowledgeGraph | null;
  files: KnowledgeFile[];

  onRebuild: () => void;
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
}: Props) {
  return (
    <>
      {!hasDocuments ? (
        <KnowledgeEmptyState
          icon={<FileSearch className="h-5 w-5" />}
          title="Anade documentacion para generar el analisis"
          description="La incorporacion de nuevas evidencias se realiza desde el flujo de Importacion de Conocimiento de la carpeta."
        />
      ) : !hasAnalysis ? (
        <KnowledgeEmptyState
          icon={
            <BrainCircuit className="h-5 w-5" />
          }
          title="Todavia no hay un analisis disponible"
          description="Procesa la documentacion del articulo para generar su analisis detallado y extraer la estructura de conocimiento."
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

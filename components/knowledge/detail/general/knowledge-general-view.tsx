// components/knowledge/detail/general/knowledge-general-view.tsx

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

  knowledgeType: string;

  analysisJson: unknown;
  analysisStatus: string | null;
  analysisModel: string | null;

  graph: KnowledgeGraph | null;
  files: KnowledgeFile[];

  onRebuild: () => void;
  onUpload: () => void;
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
  onUpload,
}: Props) {
  if (!hasDocuments) {
    return (
      <KnowledgeEmptyState
        icon={<Upload className="h-5 w-5" />}
        title="Añade documentación para construir el artículo"
        description="Sube uno o varios documentos para que la IA pueda analizar su contenido, generar el resumen y extraer la estructura de conocimiento."
        actionLabel="Añadir documentación"
        actionIcon={
          <Upload className="mr-2 h-4 w-4" />
        }
        onAction={onUpload}
      />
    );
  }

  if (!hasAnalysis) {
    return (
      <KnowledgeEmptyState
        icon={
          <BrainCircuit className="h-5 w-5" />
        }
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
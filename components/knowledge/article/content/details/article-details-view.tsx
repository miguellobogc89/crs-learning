
// components/knowledge/article/content/details/article-details-view.tsx

"use client";

import {
  BrainCircuit,
  FileSearch,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { KnowledgeAnalysisPanel } from
  "@/components/knowledge/knowledge-analysis-panel";

import type {
  KnowledgeFile,
  KnowledgeGraph,
} from "@/components/knowledge/detail/knowledge-detail.types";

type ArticleDetailsViewProps = {
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

export function ArticleDetailsView({
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
}: ArticleDetailsViewProps) {
  if (!hasDocuments) {
    return (
      <div className="rounded-xl border border-border bg-background px-6 py-14 text-center">
        <FileSearch className="mx-auto h-6 w-6 text-blue-600" />

        <h2 className="mt-4 font-semibold">
          Añade documentación para generar el análisis
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          La incorporación de nuevas evidencias se realiza
          desde el flujo de Importación de Conocimiento
          de la carpeta.
        </p>
      </div>
    );
  }

  if (!hasAnalysis) {
    return (
      <div className="rounded-xl border border-border bg-background px-6 py-14 text-center">
        <BrainCircuit className="mx-auto h-6 w-6 text-blue-600" />

        <h2 className="mt-4 font-semibold">
          Todavía no hay un análisis disponible
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          Procesa la documentación del artículo para generar
          su análisis detallado y extraer la estructura
          de conocimiento.
        </p>

        <button
          type="button"
          disabled={isRebuilding}
          onClick={onRebuild}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {isRebuilding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}

          {isRebuilding
            ? "Actualizando..."
            : "Actualizar conocimiento"}
        </button>

        {rebuildError && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {rebuildError}
          </p>
        )}
      </div>
    );
  }




  return (
    <>
      <KnowledgeAnalysisPanel
        mode="details"
        analysisJson={analysisJson}
        status={analysisStatus}
        model={analysisModel}
        knowledgeType={knowledgeType}
        graph={graph}
        files={files}
      />

      {rebuildError && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {rebuildError}
        </p>
      )}
    </>
  );
}
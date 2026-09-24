
// components/knowledge/article/content/general/article-general-view.tsx

"use client";

import {
  BrainCircuit,
  FileSearch,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { parseKnowledgeAnalysis } from
  "@/lib/knowledge/parse-knowledge-analysis";

type ArticleGeneralViewProps = {
  hasDocuments: boolean;
  analysisJson: unknown;
  isRebuilding: boolean;
  onRebuild: () => void;

  // Se mantienen temporalmente por compatibilidad con article-client.
  isEditing?: boolean;
  isSaving?: boolean;
  hasChanges?: boolean;
  saveError?: string | null;
  htmlDraft?: string;
  onHtmlDraftChange?: (html: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
};

export function ArticleGeneralView({
  hasDocuments,
  analysisJson,
  isRebuilding,
  onRebuild,
}: ArticleGeneralViewProps) {
  if (!hasDocuments) {
    return (
      <section>
        <FileSearch aria-hidden="true" />

        <h2>Añade documentación para construir el artículo</h2>

        <p>
          La incorporación de nuevas evidencias se realiza
          desde el flujo de Importación de Conocimiento
          de la carpeta.
        </p>
      </section>
    );
  }

  const analysis = parseKnowledgeAnalysis(
    analysisJson as Parameters<
      typeof parseKnowledgeAnalysis
    >[0],
  );

  const summary = analysis?.executiveSummary;

  if (!summary) {
    return (
      <section>
        <BrainCircuit aria-hidden="true" />

        <h2>Todavía no hay un análisis disponible</h2>

        <p>
          Procesa la documentación para generar el resumen.
        </p>

        <button
          type="button"
          disabled={isRebuilding}
          onClick={onRebuild}
        >
          {isRebuilding ? (
            <Loader2 aria-hidden="true" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}

          {isRebuilding
            ? "Actualizando..."
            : "Actualizar conocimiento"}
        </button>
      </section>
    );
  }

  const paragraphs = summary.synthesis
    .split(/\n\s*\n|\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const keyPoints = summary.keyPoints.filter(
    (point) => point.trim().length > 0,
  );

  return (
    <>
      {paragraphs.length > 0 && (
        <section>
          <h2>Resumen</h2>

          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </section>
      )}

      {keyPoints.length > 0 && (
        <section>
          <h2>Puntos clave</h2>

          <ul>
            {keyPoints.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        </section>
      )}

      {summary.conclusion?.trim() && (
        <section>
          <h2>Conclusión</h2>
          <p>{summary.conclusion}</p>
        </section>
      )}
    </>
  );
}

// components/knowledge/article/content/general/article-general-view.tsx

"use client";

import { BrainCircuit, FileSearch, Loader2, RefreshCw } from "lucide-react";

import { KnowledgeEditor } from
  "@/components/knowledge/editor/knowledge-editor";

import { parseKnowledgeAnalysis } from
  "@/lib/knowledge/parse-knowledge-analysis";

type ArticleGeneralViewProps = {
  hasDocuments: boolean;
  analysisJson: unknown;
  isRebuilding: boolean;
  onRebuild: () => void;
  isEditing: boolean;
  isSaving: boolean;
  hasChanges: boolean;
  saveError: string | null;
  htmlDraft: string;
  onHtmlDraftChange: (html: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

function getSavedSummaryHtml(
  analysisJson: unknown,
): string | null {
  if (
    typeof analysisJson !== "object" ||
    analysisJson === null ||
    Array.isArray(analysisJson)
  ) {
    return null;
  }

  const editableContent =
    (analysisJson as Record<string, unknown>).editableContent;

  if (
    typeof editableContent !== "object" ||
    editableContent === null ||
    Array.isArray(editableContent)
  ) {
    return null;
  }

  const html =
    (editableContent as Record<string, unknown>)
      .generalSummaryHtml;

  return typeof html === "string" ? html : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function summaryToHtml(
  synthesis: string,
  keyPoints: string[],
): string {
  const paragraphs = synthesis
    .split("\n")
    .map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`)
    .join("");

  const points = keyPoints
    .filter((point) => point.trim())
    .map((point) => `<li><p>${escapeHtml(point)}</p></li>`)
    .join("");

  return [
    "<h2>Resumen</h2>",
    paragraphs,
    "<h2>Puntos clave</h2>",
    `<ul>${points}</ul>`,
  ].join("");
}

export function ArticleGeneralView({
  hasDocuments,
  analysisJson,
  isRebuilding,
  onRebuild,
  isEditing,
  isSaving,
  hasChanges,
  saveError,
  htmlDraft,
  onHtmlDraftChange,
  onSave,
  onCancel,
}: ArticleGeneralViewProps) {
  if (!hasDocuments) {
    return (
      <div className="rounded-xl border border-border bg-background px-6 py-14 text-center">
        <FileSearch className="mx-auto h-6 w-6 text-blue-600" />
        <h2 className="mt-4 font-semibold">
          Añade documentación para construir el artículo
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La incorporación de nuevas evidencias se realiza desde
          el flujo de Importación de Conocimiento de la carpeta.
        </p>
      </div>
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
      <div className="rounded-xl border border-border bg-background px-6 py-14 text-center">
        <BrainCircuit className="mx-auto h-6 w-6 text-blue-600" />
        <h2 className="mt-4 font-semibold">
          Todavía no hay un análisis disponible
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Procesa la documentación para generar el resumen.
        </p>
        <button
          type="button"
          disabled={isRebuilding}
          onClick={onRebuild}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
      </div>
    );
  }

  const savedHtml = getSavedSummaryHtml(analysisJson);

  const generatedHtml = summaryToHtml(
    summary.synthesis,
    summary.keyPoints,
  );

  const displayHtml = savedHtml ?? generatedHtml;



  return (
    <>
      {isEditing && (
        <div className="mb-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || !hasChanges}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      )}

      <KnowledgeEditor
        key={isEditing ? "editing" : displayHtml}
        value={isEditing ? htmlDraft || displayHtml : displayHtml}
        onChange={isEditing ? onHtmlDraftChange : () => {}}
        editable={isEditing}
        className="w-full"
      />

      {saveError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {saveError}
        </p>
      )}
    </>
  );
}

// components/knowledge/article/content/general/article-general-view.tsx

"use client";

import { FileText, ListChecks, Sparkles, BookOpen } from "lucide-react";
import { parseKnowledgeAnalysis } from "@/lib/knowledge/parse-knowledge-analysis";

type ArticleGeneralViewProps = {
  hasDocuments: boolean;
  analysisJson: unknown;
  isRebuilding: boolean;
  onRebuild: () => void;
  isEditing?: boolean;
  isSaving?: boolean;
  hasChanges?: boolean;
  saveError?: string | null;
  htmlDraft?: string;
  onHtmlDraftChange?: (html: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
};

type KnowledgeTypeInfo = { label: string; description: string };

function getKnowledgeTypeInfo(detectedType: string): KnowledgeTypeInfo | null {
  const type = detectedType.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (!type) return null;

  const types: Record<string, KnowledgeTypeInfo> = {
    procedure: { label: "Procedimiento", description: "Instrucciones y criterios para realizar una actividad paso a paso." },
    process: { label: "Proceso", description: "Actividades relacionadas, participantes y resultados de un flujo de trabajo." },
    reference: { label: "Referencia", description: "Información de consulta para comprender conceptos y criterios de un ámbito." },
    guide: { label: "Guía", description: "Orientaciones y recomendaciones para abordar una tarea o situación." },
    policy: { label: "Política", description: "Principios y directrices que orientan la actuación." },
    regulation: { label: "Normativa", description: "Disposiciones, obligaciones y requisitos aplicables a un ámbito." },
    manual: { label: "Manual", description: "Instrucciones e información práctica para utilizar un sistema o realizar tareas." },
    faq: { label: "Preguntas frecuentes", description: "Respuestas organizadas a las dudas más habituales sobre un tema." },
  };
  const aliases: Record<string, string> = {
    procedimiento: "procedure", proceso: "process", referencia: "reference",
    guia: "guide", política: "policy", politica: "policy", normativa: "regulation",
  };
  return types[aliases[type] ?? type] ?? {
    label: detectedType.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()),
    description: "Clasificación identificada a partir del contenido de la documentación.",
  };
}

function getSavedSummaryHtml(analysisJson: unknown): string | null {
  if (typeof analysisJson !== "object" || analysisJson === null || Array.isArray(analysisJson)) return null;
  const editableContent = (analysisJson as Record<string, unknown>).editableContent;
  if (typeof editableContent !== "object" || editableContent === null || Array.isArray(editableContent)) return null;
  const html = (editableContent as Record<string, unknown>).generalSummaryHtml;
  return typeof html === "string" ? html : null;
}

/**
 * El HTML editable puede proceder de una versión anterior que guardaba
 * «Resumen» y «Puntos clave» juntos. Mostramos solo la parte del resumen:
 * los puntos clave se pintan una única vez desde el análisis estructurado.
 * No se modifica el HTML persistido ni el contenido usado por el editor.
 */
function getDisplaySummaryHtml(html: string): string {
  const heading = (label: string) =>
    new RegExp(
      String.raw`<(?:h[1-6]|p)\b[^>]*>\s*(?:<(?:strong|b)\b[^>]*>\s*)?${label}\s*(?:<\/(?:strong|b)>\s*)?<\/(?:h[1-6]|p)>`,
      "i",
    );

  const keyPointsHeading = heading(String.raw`Puntos\s+clave\s*:?`);
  const match = keyPointsHeading.exec(html);
  const summaryOnly = match ? html.slice(0, match.index) : html;

  return summaryOnly.replace(
    new RegExp(String.raw`^\s*${heading(String.raw`Resumen\s*:?`).source}`, "i"),
    "",
  ).trim();
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n|\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function ArticleGeneralView({
  hasDocuments, analysisJson, isRebuilding, onRebuild, saveError,
}: ArticleGeneralViewProps) {
  if (!hasDocuments) {
    return (
      <section className="flex min-h-64 flex-col items-center justify-center text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <FileText aria-hidden="true" className="h-6 w-6" />
        </span>
        <h2>Añade documentación para construir el artículo</h2>
        <p className="max-w-md text-slate-500">Incorpora documentación desde Importación de Conocimiento para generar el resumen y los puntos clave del artículo.</p>
      </section>
    );
  }

  const analysis = parseKnowledgeAnalysis(
    analysisJson as Parameters<typeof parseKnowledgeAnalysis>[0],
  );
  const summary = analysis?.executiveSummary;
  const savedHtml = getSavedSummaryHtml(analysisJson);
  const displaySummaryHtml = savedHtml ? getDisplaySummaryHtml(savedHtml) : "";
  const typeInfo = getKnowledgeTypeInfo(analysis?.detectedType ?? "");
  const paragraphs = splitParagraphs(summary?.synthesis ?? "");
  const conclusion = summary?.conclusion?.trim();
  const uniqueParagraphs = paragraphs.filter((paragraph, index) =>
    paragraphs.findIndex((candidate) => normalizeText(candidate) === normalizeText(paragraph)) === index,
  );
  // La conclusión solo se añade si aporta contenido distinto al resumen.
  const showConclusion = Boolean(conclusion) && !uniqueParagraphs.some((paragraph) =>
    normalizeText(paragraph).includes(normalizeText(conclusion ?? "")) ||
    normalizeText(conclusion ?? "").includes(normalizeText(paragraph)),
  );
  const keyPoints = summary?.keyPoints ?? [];
  const hasSummary = Boolean(displaySummaryHtml) || uniqueParagraphs.length > 0;

  if (!analysis && !savedHtml) {
    return (
      <section className="flex min-h-64 flex-col items-center justify-center text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Sparkles aria-hidden="true" className="h-6 w-6" />
        </span>
        <h2>Todavía no hay un análisis disponible</h2>
        <p className="max-w-md text-slate-500">Procesa la documentación para generar el resumen y los puntos clave del artículo.</p>
        <button type="button" disabled={isRebuilding} onClick={onRebuild}>
          {isRebuilding ? "Actualizando..." : "Actualizar conocimiento"}
        </button>
      </section>
    );
  }

  return (
    <div className="min-w-0">
      <section>
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <FileText aria-hidden="true" className="h-[18px] w-[18px]" />
          </span>
          <h2 className="!mb-0">Resumen</h2>
        </div>
        {displaySummaryHtml ? (
          <div className="min-w-0 break-words [&_p+p]:mt-3" dangerouslySetInnerHTML={{ __html: displaySummaryHtml }} />
        ) : hasSummary ? (
          <div className="space-y-3">
            {uniqueParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            {showConclusion && <p>{conclusion}</p>}
          </div>
        ) : (
          <p className="text-slate-500">El análisis todavía no contiene un resumen.</p>
        )}
      </section>

      <section className="!mt-10 border-t border-slate-100 pt-9">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <ListChecks aria-hidden="true" className="h-[18px] w-[18px]" />
          </span>
          <h2 className="!mb-0">Puntos clave</h2>
          {keyPoints.length > 0 && (
            <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-500">
              {keyPoints.length}
            </span>
          )}
        </div>
        {keyPoints.length > 0 ? (
          <ol className="!list-none !pl-0">
            {keyPoints.map((point, index) => (
              <li key={index} className="!m-0 flex items-start gap-3 border-b border-slate-100 !pl-0 py-3.5 first:pt-0 last:border-b-0 last:pb-0">
                <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-xs font-semibold tabular-nums text-slate-500 ring-1 ring-slate-100">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="min-w-0 flex-1">{point}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-slate-500">El análisis todavía no contiene puntos clave.</p>
        )}
      </section>
      {saveError && <p role="alert" className="mt-8">{saveError}</p>}
    </div>
  );
}

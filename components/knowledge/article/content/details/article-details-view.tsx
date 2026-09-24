// components/knowledge/article/content/details/article-details-view.tsx

"use client";

import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GitBranch,
  Info,
  Layers3,
  ListChecks,
  Network,
  Route,
  Settings2,
  ShieldCheck,
  Table2,
  Users,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";

import { parseKnowledgeAnalysis } from
  "@/lib/knowledge/parse-knowledge-analysis";
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

type SectionProps = {
  title: string;
  icon: typeof Info;
  children: ReactNode;
  count?: number;
};


function DetailSection({
  title,
  icon: Icon,
  children,
  count,
}: SectionProps) {
  return (
    <section className="!mt-0 min-w-0 !py-10 first:!pt-0 last:!pb-0">
      <div className="mb-6 flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>

        <h2 className="!mb-0 !text-[16px] !font-semibold !leading-6">
          {title}
        </h2>

        {count !== undefined && (
          <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-500">
            {count}
          </span>
        )}
      </div>

      {children}
    </section>
  );
}

function TextSection({
  title,
  items,
  icon,
}: {
  title: string;
  items: string[];
  icon: typeof Info;
}) {
  const visibleItems = items.filter((item) => item.trim());
  if (!visibleItems.length) return null;
  return (
    <DetailSection title={title} icon={icon} count={visibleItems.length}>
      <ul className="!list-none !pl-0">
        {visibleItems.map((item, index) => (
          <li key={index} className="!m-0 flex gap-3 border-b border-slate-100 py-3 first:pt-0 last:border-0 last:pb-0">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-[11px] font-semibold tabular-nums text-slate-500">
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="min-w-0 flex-1">{item}</p>
          </li>
        ))}
      </ul>
    </DetailSection>
  );
}

function DefinitionSection({
  title,
  icon,
  items,
}: {
  title: string;
  icon: typeof Info;
  items: { label: string; description: string }[];
}) {
  const visibleItems = items.filter((item) => item.label.trim() || item.description.trim());
  if (!visibleItems.length) return null;
  return (
    <DetailSection title={title} icon={icon} count={visibleItems.length}>
      <dl className="!grid-cols-1 !gap-0">
        {visibleItems.map((item, index) => (
          <div key={index} className="border-b border-slate-100 py-3 first:pt-0 last:border-0 last:pb-0">
            <dt className="!text-[13px] !font-semibold !text-slate-900">{item.label}</dt>
            {item.description && <dd className="!mt-1 !font-normal !text-slate-600">{item.description}</dd>}
          </div>
        ))}
      </dl>
    </DetailSection>
  );
}

function getGraphItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const label = record.name ?? record.title ?? record.label;
      return typeof label === "string" ? label : "";
    }
    return "";
  }).filter((item) => item.trim().length > 0);
}

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
  const analysis = parseKnowledgeAnalysis(
    analysisJson as Parameters<typeof parseKnowledgeAnalysis>[0],
  );

  if (!hasDocuments || !hasAnalysis || !analysis) {
    return (
      <section className="flex min-h-64 flex-col items-center justify-center text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <FileText aria-hidden="true" className="h-6 w-6" />
        </span>
        <h2>{!hasDocuments ? "Añade documentación para generar el análisis" : "Todavía no hay un análisis disponible"}</h2>
        <p className="max-w-md text-slate-500">
          {!hasDocuments
            ? "Incorpora documentación desde Importación de Conocimiento para construir el artículo."
            : "Procesa la documentación para generar el análisis detallado y extraer su estructura de conocimiento."}
        </p>
        {hasDocuments && (
          <button type="button" disabled={isRebuilding} onClick={onRebuild}>
            {isRebuilding ? "Actualizando..." : "Actualizar conocimiento"}
          </button>
        )}
        {rebuildError && <p role="alert" className="mt-4">{rebuildError}</p>}
      </section>
    );
  }

  const graphSections = graph ? [
    { title: "Aplicaciones relacionadas", items: getGraphItems(graph.applications) },
    { title: "Productos relacionados", items: getGraphItems(graph.products) },
    { title: "Normativa relacionada", items: getGraphItems(graph.regulations) },
    { title: "Dependencias", items: getGraphItems(graph.dependencies) },
    { title: "Documentos relacionados", items: getGraphItems(graph.related_documents) },
  ].filter((section) => section.items.length > 0) : [];

  return (
    <div className="min-w-0 divide-y divide-slate-100">

<DetailSection title="Información del análisis" icon={Info}>
  <div className="flex flex-wrap items-center gap-2.5">

    {knowledgeType && (
      <span className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[13px] font-medium text-blue-700">
        <BookOpen aria-hidden="true" className="h-4 w-4" />
        {knowledgeType}
      </span>
    )}

    {analysis.detectedType &&
      analysis.detectedType.trim().toLowerCase() !==
        knowledgeType.trim().toLowerCase() && (
        <span className="inline-flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-[13px] font-medium text-violet-700">
          <Layers3 aria-hidden="true" className="h-4 w-4" />
          {analysis.detectedType}
        </span>
      )}

    {analysisStatus && (
      <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-700">
        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
        {analysisStatus}
      </span>
    )}

    <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-medium text-slate-600">
      <FileText aria-hidden="true" className="h-4 w-4" />
      {files.length}{" "}
      {files.length === 1 ? "documento" : "documentos"}
    </span>

    {analysisModel && (
      <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-medium text-slate-600">
        <Settings2 aria-hidden="true" className="h-4 w-4" />
        {analysisModel}
      </span>
    )}

  </div>
</DetailSection>

      {analysis.objective && (
        <DetailSection title="Objetivo" icon={Route}><p>{analysis.objective}</p></DetailSection>
      )}
      {analysis.scope && (
        <DetailSection title="Alcance" icon={Layers3}><p>{analysis.scope}</p></DetailSection>
      )}
      <TextSection title="Temas" items={analysis.topics} icon={BookOpen} />
      <DefinitionSection title="Conceptos" icon={BookOpen} items={analysis.concepts.map((item) => ({ label: item.name, description: item.definition }))} />
      <TextSection title="Requisitos previos" items={analysis.prerequisites} icon={ClipboardCheck} />
      <TextSection title="Desencadenantes" items={analysis.triggers} icon={Workflow} />
      <TextSection title="Reglas de negocio" items={analysis.businessRules} icon={ShieldCheck} />
      <TextSection title="Advertencias" items={analysis.warnings} icon={AlertTriangle} />

      {analysis.procedures.length > 0 && (
        <DetailSection title="Procedimientos" icon={ListChecks} count={analysis.procedures.length}>
          <div className="space-y-7">
            {analysis.procedures.map((procedure, index) => (
              <div key={index} className="min-w-0">
                <div className="mb-3 flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-semibold tabular-nums text-blue-700">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="!mb-1">{procedure.name}</h3>
                    {procedure.goal && <p className="text-slate-500">{procedure.goal}</p>}
                  </div>
                </div>
                {procedure.steps.length > 0 && (
                  <ol className="ml-3 !list-none !border-l !border-slate-200 !pl-6">
                    {procedure.steps.map((step, stepIndex) => (
                      <li key={stepIndex} className="relative !m-0 pb-5 last:pb-0">
                        <span className="absolute -left-[33px] top-0 flex h-5 w-5 items-center justify-center rounded-full border border-blue-200 bg-white text-[10px] font-semibold text-blue-600">{stepIndex + 1}</span>
                        <h4 className="!mb-1">{step.title}</h4>
                        <p>{step.instruction}</p>
                        {step.expectedResult && <p className="!mt-2"><strong>Resultado esperado: </strong>{step.expectedResult}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {analysis.responsibilities.length > 0 && (
        <DetailSection title="Responsabilidades" icon={Users} count={analysis.responsibilities.length}>
          <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-100">
            <table>
              <thead><tr><th>Acción</th><th>Responsable</th><th>Observaciones</th></tr></thead>
              <tbody>{analysis.responsibilities.map((item, index) => (
                <tr key={index}><td>{item.action}</td><td>{item.responsible}</td><td>{item.notes}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </DetailSection>
      )}

      {analysis.checklists.length > 0 && (
        <DetailSection title="Listas de comprobación" icon={CheckCircle2} count={analysis.checklists.length}>
          <div className="space-y-6">
            {analysis.checklists.map((checklist, index) => (
              <div key={index}>
                <h3>{checklist.title}</h3>
                <ul className="!list-none !pl-0">
                  {checklist.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="!m-0 flex items-start gap-3 py-1.5">
                      <CheckCircle2 aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {analysis.catalogTables.length > 0 && (
        <DetailSection title="Tablas y catálogos" icon={Table2} count={analysis.catalogTables.length}>
          <div className="space-y-7">
            {analysis.catalogTables.map((catalog, index) => (
              <div key={index} className="min-w-0">
                <h3>{catalog.title}</h3>
                {catalog.description && <p className="mb-3">{catalog.description}</p>}
                {catalog.sourceDocumentName && <p className="mb-3 text-xs text-slate-500"><strong>Fuente: </strong>{catalog.sourceDocumentName}</p>}
                <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-100">
                  <table>
                    <thead><tr>{catalog.columns.map((column, columnIndex) => <th key={columnIndex}>{column}</th>)}</tr></thead>
                    <tbody>{catalog.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      <DefinitionSection title="Sistemas" icon={Settings2} items={analysis.systems.map((item) => ({ label: item.name, description: item.description }))} />
      <DefinitionSection title="Actores" icon={Users} items={analysis.actors.map((item) => ({ label: item.name, description: item.role }))} />
      <DefinitionSection title="Fechas importantes" icon={CalendarDays} items={analysis.importantDates.map((item) => ({ label: item.label, description: item.value }))} />
      <TextSection title="Resultados" items={analysis.outputs} icon={CheckCircle2} />
      <TextSection title="Preguntas frecuentes" items={analysis.commonQuestions} icon={BookOpen} />
      <TextSection title="Errores habituales" items={analysis.commonErrors} icon={AlertTriangle} />
      <DefinitionSection title="Glosario" icon={BookOpen} items={analysis.glossary.map((item) => ({ label: item.term, description: item.definition }))} />

      {graphSections.length > 0 && (
        <DetailSection title="Relaciones de conocimiento" icon={Network}>
          <div className="space-y-5">
            {graphSections.map((section) => (
              <div key={section.title}>
                <h3 className="!mb-2 !text-[13px]">{section.title}</h3>
                <ul className="!list-none !pl-0">
                  {section.items.map((item, index) => (
                    <li key={index} className="!m-0 flex items-start gap-2 py-1.5">
                      <GitBranch aria-hidden="true" className="mt-1 h-3.5 w-3.5 shrink-0 text-blue-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DetailSection>
      )}
      {rebuildError && <p role="alert" className="mt-5">{rebuildError}</p>}
    </div>
  );
}
